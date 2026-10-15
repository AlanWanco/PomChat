import { SPECTRUM_FFT_SIZE, computeSpectrumFramePowers, getSpectrumBandAmplitude, getSpectrumDisplayLevel } from './audioSpectrum';

/**
 * Compact, portable audio analysis shared by the editor preview and the video export.
 *
 * The grid stores perceptually quantized band energy and RMS energy, so both paths
 * read the same numbers instead of running their own analysis. It is deliberately
 * free of browser and Node APIs: the Electron main process builds it with FFmpeg PCM,
 * the web preview builds it from Web Audio output.
 */
export const AUDIO_VIZ_SAMPLE_RATE = 16000;
export const AUDIO_VIZ_FRAME_RATE = 60;
export const AUDIO_VIZ_ENERGY_RATE = 120;
export const AUDIO_VIZ_BAND_COUNT = 96;
/** Longest audio that still receives analysis data. Audio beyond this renders at baseline. */
export const AUDIO_VIZ_MAX_DURATION = 3600;
/** Scrolling history used by the energy mode, in seconds. */
export const AUDIO_VIZ_HISTORY_SECONDS = 0.6;

export const AUDIO_VIZ_BAR_LIMITS = { min: 8, max: 96, step: 4 } as const;
export const AUDIO_VIZ_GAIN_LIMITS = { min: 0.5, max: 12, step: 0.25 } as const;
export const AUDIO_VIZ_SMOOTHING_LIMITS = { min: 0, max: 0.18, step: 0.01 } as const;

const MAGIC = 0x5a565043; // "PCVZ" little-endian
const VERSION = 1;
const HEADER_BYTES = 32;
const MIN_DB = -60;
const MAX_QUANTIZED = 255;

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

// 0 is reserved for silence so that a muted stretch stays exactly at the baseline.
const amplitudeToQuantized = (amplitude: number) => {
  const db = 20 * Math.log10(Math.max(1e-12, Number.isFinite(amplitude) ? amplitude : 0));
  if (db <= MIN_DB) return 0;
  return Math.max(1, Math.round(MAX_QUANTIZED * ((db - MIN_DB) / -MIN_DB)));
};

const quantizedToAmplitude = new Float32Array(MAX_QUANTIZED + 1);
for (let index = 1; index <= MAX_QUANTIZED; index += 1) {
  quantizedToAmplitude[index] = 10 ** ((MIN_DB + (index / MAX_QUANTIZED) * -MIN_DB) / 20);
}

export interface AudioVizGrid {
  frameRate: number;
  bandCount: number;
  energyRate: number;
  duration: number;
  frames: number;
  energyCount: number;
  bands: Uint8Array;
  energy: Uint8Array;
}

export interface AudioVizLevelOptions {
  mode?: 'energy' | 'spectrum';
  count?: number;
  gain?: number;
  smoothingSeconds?: number;
}

/** Group the fixed grid bands into `count` bars. Band grouping keeps the logarithm spacing. */
const getBandRange = (bandCount: number, count: number, index: number) => {
  const first = Math.floor((index / count) * bandCount);
  return [first, Math.max(first + 1, Math.floor(((index + 1) / count) * bandCount))] as const;
};

const mixToMono = (channels: readonly Float32Array[]) => {
  if (channels.length === 1) return channels[0];
  const length = channels[0].length;
  const mono = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    let total = 0;
    for (const channel of channels) {
      const sample = channel[index];
      total += Number.isFinite(sample) ? sample : 0;
    }
    mono[index] = total / channels.length;
  }
  return mono;
};

/**
 * Stream mono samples into a grid. Memory stays bounded by the output size,
 * so long audio never needs its PCM held in memory.
 */
export function createAudioVizGridBuilder(sampleRate: number) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error('A positive sample rate is required.');
  }
  const samplesPerFrame = sampleRate / AUDIO_VIZ_FRAME_RATE;
  const samplesPerEnergy = sampleRate / AUDIO_VIZ_ENERGY_RATE;
  const maxFrames = Math.floor(AUDIO_VIZ_MAX_DURATION * AUDIO_VIZ_FRAME_RATE);
  const ring = new Float32Array(SPECTRUM_FFT_SIZE);
  const frameWindow = new Float32Array(SPECTRUM_FFT_SIZE);
  const bandBlocks: Uint8Array[] = [];
  const energyBlocks: Uint8Array[] = [];
  let bandBlock = new Uint8Array(AUDIO_VIZ_FRAME_RATE * AUDIO_VIZ_BAND_COUNT);
  let bandUsed = 0;
  let energyBlock = new Uint8Array(AUDIO_VIZ_ENERGY_RATE);
  let energyUsed = 0;
  let ringWrite = 0;
  let ringFill = 0;
  let total = 0;
  let frames = 0;
  let energyCount = 0;
  let energySum = 0;
  let energySamples = 0;
  let finished = false;

  const pushBand = (level: number) => {
    bandBlock[bandUsed] = Math.round(clamp(level, 0, 1) * MAX_QUANTIZED);
    bandUsed += 1;
    if (bandUsed >= bandBlock.length) {
      bandBlocks.push(bandBlock);
      bandBlock = new Uint8Array(AUDIO_VIZ_FRAME_RATE * AUDIO_VIZ_BAND_COUNT);
      bandUsed = 0;
    }
  };

  const pushEnergy = (amplitude: number) => {
    energyBlock[energyUsed] = amplitudeToQuantized(amplitude);
    energyUsed += 1;
    if (energyUsed >= energyBlock.length) {
      energyBlocks.push(energyBlock);
      energyBlock = new Uint8Array(AUDIO_VIZ_ENERGY_RATE);
      energyUsed = 0;
    }
  };

  const buildWindow = () => {
    const missing = SPECTRUM_FFT_SIZE - ringFill;
    for (let index = 0; index < missing; index += 1) frameWindow[index] = 0;
    for (let index = missing; index < SPECTRUM_FFT_SIZE; index += 1) {
      frameWindow[index] = ring[(ringWrite + index - missing) % SPECTRUM_FFT_SIZE];
    }
  };

  return {
    push(samples: Float32Array | Int16Array | Float64Array | number[]) {
      if (finished) throw new Error('The grid builder is already finished.');
      for (let index = 0; index < samples.length; index += 1) {
        if (frames >= maxFrames) return true;
        const value = Number.isFinite(samples[index]) ? samples[index] : 0;
        ring[ringWrite] = value;
        ringWrite = (ringWrite + 1) % SPECTRUM_FFT_SIZE;
        ringFill = Math.min(SPECTRUM_FFT_SIZE, ringFill + 1);
        total += 1;
        energySum += value * value;
        energySamples += 1;
        if (total >= Math.floor((energyCount + 1) * samplesPerEnergy)) {
          pushEnergy(Math.sqrt(energySum / Math.max(1, energySamples)));
          energyCount += 1;
          energySum = 0;
          energySamples = 0;
        }
        if (total >= Math.floor((frames + 1) * samplesPerFrame)) {
          buildWindow();
          const power = computeSpectrumFramePowers([frameWindow], sampleRate);
          for (let band = 0; band < AUDIO_VIZ_BAND_COUNT; band += 1) {
            pushBand(getSpectrumDisplayLevel(getSpectrumBandAmplitude(power, AUDIO_VIZ_BAND_COUNT, band, sampleRate)));
          }
          frames += 1;
        }
      }
      return frames >= maxFrames;
    },
    finish(): AudioVizGrid {
      if (finished) throw new Error('The grid builder is already finished.');
      finished = true;
      if (energySamples > 0) {
        pushEnergy(Math.sqrt(energySum / Math.max(1, energySamples)));
        energyCount += 1;
      }
      if (bandUsed > 0) bandBlocks.push(bandBlock.subarray(0, bandUsed));
      if (energyUsed > 0) energyBlocks.push(energyBlock.subarray(0, energyUsed));
      const bands = new Uint8Array(frames * AUDIO_VIZ_BAND_COUNT);
      bandBlocks.forEach((block, index) => bands.set(block, index * AUDIO_VIZ_FRAME_RATE * AUDIO_VIZ_BAND_COUNT));
      const energy = new Uint8Array(energyCount);
      let offset = 0;
      for (const block of energyBlocks) {
        energy.set(block, offset);
        offset += block.byteLength;
      }
      return {
        frameRate: AUDIO_VIZ_FRAME_RATE,
        bandCount: AUDIO_VIZ_BAND_COUNT,
        energyRate: AUDIO_VIZ_ENERGY_RATE,
        duration: frames / AUDIO_VIZ_FRAME_RATE,
        frames,
        energyCount,
        bands,
        energy,
      };
    },
  };
}

/** Build a grid from complete channels. Multi-channel audio is averaged, matching FFmpeg downmixing. */
export function buildAudioVizGrid(channels: readonly Float32Array[], sampleRate: number): AudioVizGrid {
  if (!channels.length || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error('Audio channels and a positive sample rate are required.');
  }
  const length = channels[0].length;
  if (channels.some((channel) => channel.length !== length)) {
    throw new Error('Audio channels must have equal lengths.');
  }
  const builder = createAudioVizGridBuilder(sampleRate);
  const mono = mixToMono(channels);
  const CHUNK = 1 << 16;
  for (let offset = 0; offset < mono.length; offset += CHUNK) {
    if (builder.push(mono.subarray(offset, Math.min(mono.length, offset + CHUNK)))) break;
  }
  return builder.finish();
}

export function encodeAudioVizGrid(grid: AudioVizGrid): ArrayBuffer {
  const buffer = new ArrayBuffer(HEADER_BYTES + grid.bands.byteLength + grid.energy.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, grid.bandCount, true);
  view.setUint16(8, grid.frameRate, true);
  view.setUint16(10, grid.energyRate, true);
  view.setFloat32(16, grid.duration, true);
  view.setUint32(20, grid.frames, true);
  view.setUint32(24, grid.energyCount, true);
  new Uint8Array(buffer, HEADER_BYTES, grid.bands.byteLength).set(grid.bands);
  new Uint8Array(buffer, HEADER_BYTES + grid.bands.byteLength, grid.energy.byteLength).set(grid.energy);
  return buffer;
}

export function decodeAudioVizGrid(input: ArrayBuffer | Uint8Array): AudioVizGrid | null {
  const view = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (view.byteLength < HEADER_BYTES) return null;
  const header = new DataView(view.buffer, view.byteOffset, view.byteLength);
  if (header.getUint32(0, true) !== MAGIC || header.getUint16(4, true) !== VERSION) return null;
  const bandCount = header.getUint16(6, true);
  const frameRate = header.getUint16(8, true);
  const energyRate = header.getUint16(10, true);
  const duration = header.getFloat32(16, true);
  const frames = header.getUint32(20, true);
  const energyCount = header.getUint32(24, true);
  if (!bandCount || !frameRate || !energyRate || !frames || !energyCount) return null;
  const bandsLength = frames * bandCount;
  const bandsOffset = HEADER_BYTES;
  const energyOffset = bandsOffset + bandsLength;
  if (energyOffset + energyCount > view.byteLength) return null;
  return {
    frameRate,
    bandCount,
    energyRate,
    duration: Number.isFinite(duration) ? duration : 0,
    frames,
    energyCount,
    bands: new Uint8Array(view.buffer, view.byteOffset + bandsOffset, bandsLength),
    energy: new Uint8Array(view.buffer, view.byteOffset + energyOffset, energyCount),
  };
}

/** Interpolate one stored sample, stepping `offset` samples back from a continuous position. */
const sampleStored = (
  values: Uint8Array,
  sampleCount: number,
  position: number,
  offset: number,
  stride: number,
  lane: number,
) => {
  const index = Math.floor(position) - offset;
  if (index < 0 || index >= sampleCount) return 0;
  const first = quantizedToAmplitude[values[index * stride + lane]];
  const nextIndex = index + 1;
  if (nextIndex >= sampleCount) return first;
  const next = quantizedToAmplitude[values[nextIndex * stride + lane]];
  return first + (next - first) * (position - Math.floor(position));
};

/** Causal moving average over the energy envelope, in seconds. */
const readSmoothedEnergy = (grid: AudioVizGrid, position: number, windowSamples: number) => {
  const windowSize = Math.max(1, Math.min(windowSamples, Math.floor(position) + 1));
  let total = 0;
  for (let offset = 0; offset < windowSize; offset += 1) {
    total += sampleStored(grid.energy, grid.energyCount, position, offset, 1, 0);
  }
  return total / windowSize;
};

/**
 * Levels for one displayed frame. Depends only on absolute audio time, so the preview
 * and the export agree and seeking backwards is reproducible.
 */
export function getAudioVizLevels(grid: AudioVizGrid, time: number, options: AudioVizLevelOptions = {}): number[] {
  const { mode = 'spectrum', count = 48, gain = 5, smoothingSeconds = 0.04 } = options;
  const safeCount = Math.round(clamp(count, AUDIO_VIZ_BAR_LIMITS.min, AUDIO_VIZ_BAR_LIMITS.max));
  const safeGain = clamp(gain, 0, 20);
  if (!Number.isFinite(time) || time <= 0 || time > grid.duration || safeGain === 0) {
    return Array(safeCount).fill(0);
  }

  if (mode === 'energy') {
    const smoothingSamples = Math.round(clamp(smoothingSeconds, 0, 0.18) * grid.energyRate);
    return Array.from({ length: safeCount }, (_, index) => {
      const sampleTime = time - AUDIO_VIZ_HISTORY_SECONDS * (1 - index / Math.max(1, safeCount - 1));
      const amplitude = readSmoothedEnergy(grid, sampleTime * grid.energyRate, smoothingSamples);
      return Math.pow(Math.min(1, Math.max(0, amplitude * safeGain)), 0.8);
    });
  }

  // Stored sample `index` covers the analysis window ending at (index + 1) / frameRate.
  const position = time * grid.frameRate - 1;
  if (position < 0) return Array(safeCount).fill(0);
  const smoothingFrames = 1 + Math.round(clamp(smoothingSeconds, 0, 0.18) * grid.frameRate);
  const power = new Float64Array(grid.bandCount);
  for (let offset = 0; offset < smoothingFrames; offset += 1) {
    for (let band = 0; band < grid.bandCount; band += 1) {
      const amplitude = sampleStored(grid.bands, grid.frames, position, offset, grid.bandCount, band);
      power[band] += amplitude * amplitude;
    }
  }
  return Array.from({ length: safeCount }, (_, index) => {
    const [first, end] = getBandRange(grid.bandCount, safeCount, index);
    let bandPower = 0;
    for (let band = first; band < end; band += 1) bandPower += power[band];
    const amplitude = Math.sqrt(Math.max(0, bandPower / (end - first) / smoothingFrames)) * safeGain;
    const db = 20 * Math.log10(Math.max(1e-12, amplitude));
    return clamp((db - MIN_DB) / -MIN_DB, 0, 1);
  });
}
