import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const temporary = await mkdtemp(path.join(tmpdir(), 'pomchat-viz-grid-'));
try {
  const output = path.join(temporary, 'grid.cjs');
  await build({ entryPoints: ['src/remotion/audioVizGrid.ts'], outfile: output, bundle: true, platform: 'node', format: 'cjs' });
  const {
    buildAudioVizGrid, encodeAudioVizGrid, decodeAudioVizGrid, getAudioVizLevels,
    AUDIO_VIZ_SAMPLE_RATE, AUDIO_VIZ_BAND_COUNT, AUDIO_VIZ_FRAME_RATE, AUDIO_VIZ_MAX_DURATION,
  } = createRequire(import.meta.url)(output);

  const referenceOutput = path.join(temporary, 'spectrum.cjs');
  await build({ entryPoints: ['src/remotion/audioSpectrum.ts'], outfile: referenceOutput, bundle: true, platform: 'node', format: 'cjs' });
  const { createAudioSpectrumSampler } = createRequire(import.meta.url)(referenceOutput);

  const seconds = 4;
  const tone = (frequency, amplitude = 0.5) => Float32Array.from(
    { length: AUDIO_VIZ_SAMPLE_RATE * seconds },
    (_, index) => Math.sin(index * 2 * Math.PI * frequency / AUDIO_VIZ_SAMPLE_RATE) * amplitude,
  );
  const grid = buildAudioVizGrid([tone(300)], AUDIO_VIZ_SAMPLE_RATE);
  assert.equal(grid.frameRate, AUDIO_VIZ_FRAME_RATE);
  assert.equal(grid.bandCount, AUDIO_VIZ_BAND_COUNT);
  assert.equal(grid.frames, seconds * AUDIO_VIZ_FRAME_RATE);
  assert.equal(grid.bands.byteLength, grid.frames * AUDIO_VIZ_BAND_COUNT);
  assert.equal(grid.energyCount, seconds * grid.energyRate);
  assert.equal(grid.duration, seconds);

  const spectrum = (input, count = 48) => getAudioVizLevels(input, 1.5, { mode: 'spectrum', count, gain: 5, smoothingSeconds: 0.04 });
  const peak = (values) => values.indexOf(Math.max(...values));
  const lowGrid = buildAudioVizGrid([tone(200)], AUDIO_VIZ_SAMPLE_RATE);
  const highGrid = buildAudioVizGrid([tone(6000)], AUDIO_VIZ_SAMPLE_RATE);
  assert(peak(spectrum(highGrid)) > peak(spectrum(lowGrid)) + 15, 'Bands must stay ordered from low to high frequency');
  assert(spectrum(grid).some((level) => level > 0.4), 'A steady tone must produce visible bars');

  const inverse = buildAudioVizGrid([tone(300), tone(300).map((value) => -value)], AUDIO_VIZ_SAMPLE_RATE);
  assert(!spectrum(inverse).some((level) => level > 0), 'Opposite-phase stereo cancels, matching FFmpeg downmixing');
  assert.deepEqual(spectrum(buildAudioVizGrid([tone(300), tone(300)], AUDIO_VIZ_SAMPLE_RATE)), spectrum(grid), 'Duplicated channels must match mono');
  assert(!spectrum(buildAudioVizGrid([new Float32Array(AUDIO_VIZ_SAMPLE_RATE * seconds)], AUDIO_VIZ_SAMPLE_RATE)).some((level) => level > 0), 'Silence must stay at the baseline');
  assert.deepEqual(spectrum(grid), spectrum(grid), 'Reading the same time twice must be identical');
  assert.deepEqual(getAudioVizLevels(grid, 1.5, { mode: 'spectrum', count: 48, gain: 5 }), getAudioVizLevels(grid, 1.5, { mode: 'spectrum', count: 48, gain: 5 }));
  const quietGrid = buildAudioVizGrid([tone(1200, 0.02)], AUDIO_VIZ_SAMPLE_RATE);
  const quietBand = peak(spectrum(quietGrid));
  assert(spectrum(quietGrid)[quietBand] > 0 && spectrum(quietGrid)[quietBand] < 1, 'The quiet tone must stay below saturation');
  assert(getAudioVizLevels(quietGrid, 1.5, { mode: 'spectrum', gain: 8 })[quietBand] > spectrum(quietGrid)[quietBand], 'Gain must lift levels');
  assert(spectrum(grid, AUDIO_VIZ_BAND_COUNT).some((level) => level > 0.4));
  assert(!spectrum(grid, 8).some((level) => !Number.isFinite(level)));
  assert.equal(getAudioVizLevels(grid, -1).filter((level) => level !== 0).length, 0);
  assert.equal(getAudioVizLevels(grid, seconds + 1).filter((level) => level !== 0).length, 0);
  assert.equal(getAudioVizLevels(grid, Number.NaN).filter((level) => level !== 0).length, 0);
  assert.equal(getAudioVizLevels(grid, 1.5, { count: 10_000 }).length, 96);
  assert.equal(getAudioVizLevels(grid, 1.5, { count: -5 }).length, 8);
  assert.equal(getAudioVizLevels(grid, 1.5, { gain: 0 }).filter((level) => level !== 0).length, 0);
  assert.equal(getAudioVizLevels(grid, 1.5, { gain: 20 }).filter((level) => level > 1 || level < 0).length, 0, 'Levels must stay normalized');

  const energy = getAudioVizLevels(grid, 1.5, { mode: 'energy', count: 48, gain: 5, smoothingSeconds: 0.04 });
  assert.equal(energy.length, 48);
  assert(energy.some((level) => level > 0.2), 'Energy mode must report the tone');
  assert.deepEqual(energy, getAudioVizLevels(grid, 1.5, { mode: 'energy', count: 48, gain: 5, smoothingSeconds: 0.04 }));
  // A scrolling history reads earlier audio, so a silent tail still shows the previous sound.
  const tail = new Float32Array(AUDIO_VIZ_SAMPLE_RATE * seconds);
  tail.set(tone(300).subarray(0, AUDIO_VIZ_SAMPLE_RATE * 2), 0);
  const tailGrid = buildAudioVizGrid([tail], AUDIO_VIZ_SAMPLE_RATE);
  const tailEnergy = getAudioVizLevels(tailGrid, 2.2, { mode: 'energy', count: 48, gain: 5 });
  assert(tailEnergy.some((level) => level > 0.1), 'Energy history must reach back in time');
  assert(getAudioVizLevels(tailGrid, 3.9, { mode: 'energy', count: 48, gain: 5 }).every((level) => level < 0.05));

  const buffer = encodeAudioVizGrid(grid);
  assert.equal(buffer.byteLength, 32 + grid.bands.byteLength + grid.energy.byteLength);
  const decoded = decodeAudioVizGrid(buffer);
  assert.deepEqual([decoded.frameRate, decoded.bandCount, decoded.energyRate, decoded.frames, decoded.energyCount], [grid.frameRate, grid.bandCount, grid.energyRate, grid.frames, grid.energyCount]);
  assert(Math.abs(decoded.duration - grid.duration) < 1e-4);
  assert.deepEqual(spectrum(decoded), spectrum(grid), 'A round trip must preserve every bar');
  assert.equal(decodeAudioVizGrid(new ArrayBuffer(8)), null);
  assert.equal(decodeAudioVizGrid(new Uint8Array(64)), null);
  const truncated = decodeAudioVizGrid(buffer.slice(0, buffer.byteLength - 8));
  assert.equal(truncated, null);
  const wrongVersion = new Uint8Array(buffer.slice(0));
  wrongVersion[4] = 9;
  assert.equal(decodeAudioVizGrid(wrongVersion), null);
  // A decoder must be able to read a grid that does not start at byte 0 of its buffer.
  const padded = new Uint8Array(buffer.byteLength + 16);
  padded.set(new Uint8Array(buffer), 16);
  assert.deepEqual(spectrum(decodeAudioVizGrid(padded.subarray(16))), spectrum(grid));

  // The stored grid must reproduce the reference sampler closely, since preview and export both read the grid.
  const mixed = Float32Array.from({ length: AUDIO_VIZ_SAMPLE_RATE * seconds }, (_, index) => {
    const time = index / AUDIO_VIZ_SAMPLE_RATE;
    return 0.24 * Math.sin(2 * Math.PI * 180 * time) + 0.16 * Math.sin(2 * Math.PI * 1400 * time) + 0.08 * Math.sin(2 * Math.PI * 5200 * time);
  });
  const mixedGrid = buildAudioVizGrid([mixed], AUDIO_VIZ_SAMPLE_RATE);
  const reference = createAudioSpectrumSampler([mixed], AUDIO_VIZ_SAMPLE_RATE).getLevels(1.5, { count: 48, gain: 5, smoothingSeconds: 0.04 });
  const stored = spectrum(mixedGrid);
  const worst = Math.max(...stored.map((level, index) => Math.abs(level - reference[index])));
  assert(worst < 0.06, `Stored grid must track the reference sampler (worst delta ${worst.toFixed(3)})`);

  const longGrid = buildAudioVizGrid([tone(300)], AUDIO_VIZ_SAMPLE_RATE);
  assert(longGrid.duration <= AUDIO_VIZ_MAX_DURATION);
  assert.throws(() => buildAudioVizGrid([], AUDIO_VIZ_SAMPLE_RATE));
  assert.throws(() => buildAudioVizGrid([new Float32Array(4)], 0));
  assert.throws(() => buildAudioVizGrid([new Float32Array(4), new Float32Array(5)], AUDIO_VIZ_SAMPLE_RATE));

  // Streaming must match the batch path exactly, in arbitrary chunk sizes.
  const { createAudioVizGridBuilder } = createRequire(import.meta.url)(output);
  for (const chunkSize of [1, 37, 1024, 65536]) {
    const builder = createAudioVizGridBuilder(AUDIO_VIZ_SAMPLE_RATE);
    for (let offset = 0; offset < mixed.length; offset += chunkSize) {
      if (builder.push(mixed.subarray(offset, Math.min(mixed.length, offset + chunkSize)))) break;
    }
    const streamed = builder.finish();
    assert.equal(streamed.frames, mixedGrid.frames);
    assert.equal(streamed.energyCount, mixedGrid.energyCount);
    assert.deepEqual(streamed.bands, mixedGrid.bands, `Streaming bands must match the batch build at chunk size ${chunkSize}`);
    assert.deepEqual(streamed.energy, mixedGrid.energy, `Streaming energy must match the batch build at chunk size ${chunkSize}`);
  }
  const shortBuilder = createAudioVizGridBuilder(AUDIO_VIZ_SAMPLE_RATE);
  shortBuilder.push(new Float32Array(10));
  const shortGrid = shortBuilder.finish();
  assert.equal(shortGrid.frames, 0);
  assert.equal(shortGrid.bands.byteLength, 0);
  assert.equal(getAudioVizLevels(shortGrid, 0.5).filter((level) => level !== 0).length, 0);
  assert.throws(() => shortBuilder.push(new Float32Array(4)));
  assert.throws(() => shortBuilder.finish());
  console.log(`PASS audio viz grid: band order, stereo phase, silence, gain, grouping, bounds, scrolling history, round trip and reference match (max delta ${worst.toFixed(3)})`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
