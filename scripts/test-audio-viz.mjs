import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { openBrowser } from '@remotion/renderer';
import { buildAudioVizDemo, serveAudioVizDemo } from './audio-viz-demo.mjs';

const temporary = await mkdtemp(path.join(tmpdir(), 'pomchat-energy-'));
let browser;
let server;
try {
  const output = path.join(temporary, 'energy.cjs');
  await build({ entryPoints: ['src/remotion/audioEnergy.ts'], outfile: output, bundle: true, platform: 'node', format: 'cjs' });
  const { analyzeAudioEnergy, smoothAudioEnergy, energyAtTime, getEnergyBarLevels } = createRequire(import.meta.url)(output);
  const sine = Float32Array.from({ length: 48000 }, (_, index) => Math.sin(index * 2 * Math.PI * 5000 / 48000) * 0.5);
  const inverse = sine.map((sample) => -sample);
  const mono = analyzeAudioEnergy([sine], 48000);
  const stereo = analyzeAudioEnergy([sine, inverse], 48000);
  assert.equal(mono.values.length, 120);
  assert(Math.abs(energyAtTime(mono, 0.4) - 0.5 / Math.sqrt(2)) < 0.002, 'High-frequency energy must survive envelope reduction');
  assert.deepEqual(stereo.values, mono.values, 'Anti-phase stereo must not cancel');
  const silence = analyzeAudioEnergy([new Float32Array(48000)], 48000);
  assert(getEnergyBarLevels(silence, 0.8).every((value) => value === 0));
  assert.equal(energyAtTime(mono, -1), 0);
  assert.equal(energyAtTime(mono, 1), 0);
  assert.equal(energyAtTime(mono, NaN), 0);
  const smooth = smoothAudioEnergy(mono, 0.1);
  const first = getEnergyBarLevels(smooth, 0.6, 48, 20);
  getEnergyBarLevels(smooth, 0.9);
  assert.deepEqual(getEnergyBarLevels(smooth, 0.6, 48, 20), first);
  assert(first.every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
  assert.equal(getEnergyBarLevels(smooth, 0.6, 100000).length, 128);
  assert.throws(() => analyzeAudioEnergy([], 48000));
  assert.throws(() => analyzeAudioEnergy([sine], 0));
  assert.throws(() => analyzeAudioEnergy([sine, new Float32Array(1)], 48000));
  assert.equal(analyzeAudioEnergy([new Float32Array()], 48000).values.length, 0);
  assert(analyzeAudioEnergy([new Float32Array([NaN, Infinity, 0])], 3).values.every(Number.isFinite));
  console.log('PASS energy: RMS, high frequencies, anti-phase stereo, silence, bounds and deterministic seeking');

  const spectrumOutput = path.join(temporary, 'spectrum.cjs');
  await build({ entryPoints: ['src/remotion/audioSpectrum.ts'], outfile: spectrumOutput, bundle: true, platform: 'node', format: 'cjs' });
  const { createAudioSpectrumSampler } = createRequire(import.meta.url)(spectrumOutput);
  const spectrum = createAudioSpectrumSampler([sine], 48000);
  const settings = { count: 48, gain: 1, smoothingSeconds: 0.04 };
  const highLevels = spectrum.getLevels(0.4, settings);
  const lowTone = Float32Array.from({ length: 48000 }, (_, index) => Math.sin(index * 2 * Math.PI * 300 / 48000) * 0.5);
  const lowSpectrum = createAudioSpectrumSampler([lowTone], 48000);
  const lowLevels = lowSpectrum.getLevels(0.4, settings);
  const peak = (values) => values.indexOf(Math.max(...values));
  assert(peak(highLevels) > peak(lowLevels) + 15, 'Low/high tones must drive different, ordered frequency bands');
  assert(Math.max(...highLevels) > 0.5 && Math.max(...lowLevels) > 0.5);
  assert.equal(peak(spectrum.getLevels(0.7, settings)), peak(highLevels), 'A steady tone must not move horizontally');
  const inverseSpectrum = createAudioSpectrumSampler([sine, inverse], 48000);
  assert(inverseSpectrum.getLevels(0.4, settings).every((value, index) => Math.abs(value - highLevels[index]) < 1e-6));
  const silentSpectrum = createAudioSpectrumSampler([new Float32Array(48000)], 48000);
  assert(silentSpectrum.getLevels(0.5).every((value) => value === 0));
  assert(spectrum.getLevels(-1).every((value) => value === 0));
  assert(spectrum.getLevels(1).every((value) => value === 0));
  assert(spectrum.getLevels(NaN).every((value) => value === 0));
  assert(spectrum.getLevels(0.4, { gain: 0 }).every((value) => value === 0));
  assert.equal(spectrum.getLevels(0.4, { count: Infinity }).length, 48);
  assert.equal(spectrum.getLevels(0.4, { count: 10000 }).length, 128);
  const weak = createAudioSpectrumSampler([sine.map((sample) => sample * 0.1)], 48000).getLevels(0.4, settings);
  assert(Math.max(...weak) < Math.max(...highLevels) - 0.2, 'Absolute loudness must be retained, not normalized away');
  spectrum.getLevels(0.8, { count: 96, smoothingSeconds: 0.18 });
  assert.deepEqual(spectrum.getLevels(0.4, settings), highLevels);
  const longTone = Float32Array.from({ length: 24000 * 6 }, (_, index) => Math.sin(index * 2 * Math.PI * 720 / 24000) * 0.3);
  const cachedSpectrum = createAudioSpectrumSampler([longTone], 24000);
  const beforeEviction = cachedSpectrum.getLevels(0.5);
  for (let frame = 60; frame < 350; frame += 1) cachedSpectrum.getLevels(frame / 60);
  assert.deepEqual(cachedSpectrum.getLevels(0.5), beforeEviction, 'Cache eviction must not change a revisited frame');
  assert.throws(() => createAudioSpectrumSampler([], 24000));
  assert.throws(() => createAudioSpectrumSampler([sine], 0));
  assert.throws(() => createAudioSpectrumSampler([sine, new Float32Array(1)], 48000));
  console.log('PASS spectrum: real frequency bands, stationary tone peaks, stereo phase, silence, gain and seek/cache determinism');

  const svgOutput = path.join(temporary, 'bar-svg.cjs');
  await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import { renderToStaticMarkup } from 'react-dom/server';
      import { AudioEnergyBars } from './src/remotion/AudioEnergyBars';
      const props = { levels: [0.2, 0.8], label: 'test', color: '#123456', colorMode: 'gradient' as const };
      export const markup = renderToStaticMarkup(<>
        <AudioEnergyBars {...props} gradientColors={['#ff0000', '#0000ff']} />
        <AudioEnergyBars {...props} gradientColors={['#00ff00', '#ffffff']} />
        <AudioEnergyBars {...props} gradientColors={['#ff0000']} />
      </>);
    ` },
    outfile: svgOutput, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
  });
  const { markup } = createRequire(import.meta.url)(svgOutput);
  const ids = [...markup.matchAll(/<linearGradient id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2, 'Separate bar layers must not share gradient IDs');
  assert(ids.every((id) => markup.includes(`fill="url(#${id})"`)));
  assert(markup.includes('fill="#123456"'), 'Incomplete gradient data must fall back to solid color');
  console.log('PASS SVG gradient isolation and solid fallback');

  const { html, output: htmlPath } = await buildAudioVizDemo();
  server = await serveAudioVizDemo(html, { port: 0 });
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${url}/etc/passwd`)).status, 404);
  assert.equal((await fetch(url, { method: 'POST', body: 'no uploads' })).status, 405);
  browser = await openBrowser('chrome', { chromiumOptions: { headless: true }, logLevel: 'error' });
  const page = await browser.newPage({ context: { sourceMap: () => null, sourceMapUrl: () => null }, logLevel: 'error', indent: false, pageIndex: 0, onLog: () => {} });
  const client = page._client();
  const errors = [];
  client.on('Runtime.exceptionThrown', (event) => errors.push(event.exceptionDetails.text));
  await page.setViewport({ width: 1440, height: 1060, deviceScaleFactor: 1 });
  await page.goto({ url, timeout: 30000 });
  const wait = async (predicate, message) => {
    for (let index = 0; index < 100; index += 1) {
      if (await page.evaluate(predicate)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(message);
  };
  const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const input = async (id, value) => {
    await page.evaluate((testId, next) => {
      const element = document.querySelector(`[data-testid="${testId}"]`);
      const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, String(next));
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, id, value);
    await settle();
  };
  const click = async (id) => { await page.evaluate((testId) => document.querySelector(`[data-testid="${testId}"]`).click(), id); await settle(); };
  const bars = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="energy-bars"] rect')].map((rect) => Number(rect.getAttribute('height'))));
  const corners = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="energy-bars"] rect')].map((rect) => Number(rect.getAttribute('rx'))));
  const gradient = () => page.evaluate(() => {
    const svg = document.querySelector('[data-testid="energy-bars"] svg');
    const paint = svg.querySelector('linearGradient');
    if (!paint) return null;
    return {
      id: paint.id, units: paint.getAttribute('gradientUnits'),
      x1: paint.getAttribute('x1'), x2: paint.getAttribute('x2'),
      y1: paint.getAttribute('y1'), y2: paint.getAttribute('y2'),
      colors: [...paint.querySelectorAll('stop')].map((stop) => stop.getAttribute('stop-color')),
      offsets: [...paint.querySelectorAll('stop')].map((stop) => Number(stop.getAttribute('offset'))),
      fills: [...svg.querySelectorAll('rect')].map((rect) => rect.getAttribute('fill')),
    };
  });
  const screenshot = async (name) => {
    await settle();
    const { value } = await client.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(path.dirname(htmlPath), name), Buffer.from(value.data, 'base64'));
  };
  await wait(() => document.querySelector('audio')?.readyState >= 2 && document.querySelectorAll('[data-testid="energy-bars"] rect').length === 48, 'Demo audio and bars must initialize');
  await screenshot('desktop-light.png');
  assert.equal((await bars()).length, 48);
  await input('seek', 1.3);
  const atFirstTime = await bars();
  await input('seek', 2.1);
  assert.notDeepEqual(await bars(), atFirstTime);
  await input('seek', 1.3);
  assert.deepEqual(await bars(), atFirstTime);
  await input('volume', 0);
  assert.deepEqual(await bars(), atFirstTime);
  await input('seek', 5.8);
  assert((await bars()).every((value) => value === 3), 'Silence produces baseline dots, not random animation');
  await input('seek', 1.3);
  const beforePlay = await page.evaluate(() => document.querySelector('audio').currentTime);
  await client.send('Runtime.evaluate', { expression: 'document.querySelector("[data-testid=play]").click()', userGesture: true });
  await new Promise((resolve) => setTimeout(resolve, 450));
  assert(await page.evaluate(() => !document.querySelector('audio').paused), 'Sample must actually play');
  assert(await page.evaluate(() => document.querySelector('audio').currentTime) > beforePlay + 0.15);
  await click('play');
  const pausedBars = await bars();
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.deepEqual(await bars(), pausedBars);
  console.log('PASS playback: real sample audio, pause, seek, silence and volume independence');

  await input('seek', 1.25);
  const originalEnergy = await bars();
  const originalPlayback = await page.evaluate(() => ({ src: document.querySelector('audio').src, time: document.querySelector('audio').currentTime }));
  await click('mode-spectrum');
  assert.equal(await page.evaluate(() => document.querySelector('[data-testid="mode-spectrum"]').getAttribute('aria-pressed')), 'true');
  assert.equal(await page.evaluate(() => document.querySelector('[data-testid="alignment"]').value), 'bottom');
  assert.deepEqual(await page.evaluate(() => ({ src: document.querySelector('audio').src, time: document.querySelector('audio').currentTime })), originalPlayback);
  await client.send('Runtime.evaluate', { expression: 'document.querySelector("[data-testid=play]").click()', userGesture: true });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const spectrumPlaying = await bars();
  await click('mode-energy');
  await click('mode-spectrum');
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert(await page.evaluate(() => !document.querySelector('audio').paused && document.querySelector('audio').currentTime > 1.4), 'Mode switching must preserve playback');
  assert.notDeepEqual(await bars(), spectrumPlaying, 'Spectrum must animate during real playback');
  await click('play');
  await input('seek', 1.25);
  const spectrumBars = await bars();
  assert.notDeepEqual(spectrumBars, originalEnergy);
  const xPositions = await page.evaluate(() => [...document.querySelectorAll('[data-testid="energy-bars"] rect')].map((rect) => rect.getAttribute('x')));
  await screenshot('spectrum-desktop-light.png');
  await click('theme');
  await screenshot('spectrum-desktop-dark.png');
  await click('theme');
  await input('seek', 2.1);
  assert.notDeepEqual(await bars(), spectrumBars);
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('[data-testid="energy-bars"] rect')].map((rect) => rect.getAttribute('x'))), xPositions);
  await input('seek', 1.25);
  assert.deepEqual(await bars(), spectrumBars);
  await input('volume', 0.3);
  assert.deepEqual(await bars(), spectrumBars);
  await input('seek', 5.8);
  assert((await bars()).every((value) => value === 3));
  await input('seek', 1.25);
  await input('alignment', 'center');
  await click('mode-energy');
  assert.deepEqual(await bars(), originalEnergy, 'Original scrolling effect must remain unchanged');
  assert.equal(await page.evaluate(() => document.querySelector('[data-testid="alignment"]').value), 'center');
  await click('mode-spectrum');
  assert.equal(await page.evaluate(() => document.querySelector('[data-testid="alignment"]').value), 'center', 'Each mode remembers its own alignment');
  await input('alignment', 'bottom');
  await click('mode-energy');
  console.log('PASS mode switch: fixed X positions, real-time heights, deterministic seeking, silence and original effect preserved');

  assert((await corners()).every((radius) => radius > 0), 'Rounded remains the default');
  const energyBeforeCorners = await bars();
  await input('corners', 'square');
  assert((await corners()).every((radius) => radius === 0));
  assert.deepEqual(await bars(), energyBeforeCorners, 'Changing corners must not change audio response');
  await screenshot('square-energy-desktop.png');
  await click('mode-spectrum');
  assert((await corners()).every((radius) => radius === 0), 'Corner style must be shared across modes');
  const spectrumBeforeCorners = await bars();
  await screenshot('square-spectrum-desktop.png');
  await input('corners', 'rounded');
  assert((await corners()).every((radius) => radius > 0));
  assert.deepEqual(await bars(), spectrumBeforeCorners);
  await click('mode-energy');
  assert((await corners()).every((radius) => radius > 0));
  console.log('PASS bar corners: rounded/square in both modes without changing amplitude or timing');

  const beforeGradient = await bars();
  const defaultGradient = ['#ed7e96', '#c3a6f3', '#70c9dc'];
  await input('color-mode', 'gradient');
  let paint = await gradient();
  assert.deepEqual(paint.colors, defaultGradient);
  assert.equal(paint.units, 'userSpaceOnUse', 'Gradient must cover the full row, not restart inside each bar');
  assert.deepEqual([paint.x1, paint.y1, paint.x2, paint.y2], ['0', '0', '980', '0']);
  assert(paint.fills.every((fill) => fill === `url(#${paint.id})`));
  assert.deepEqual(await bars(), beforeGradient);
  await input('gradient-color-0', '#ff0000');
  await input('gradient-color-1', '#00ff00');
  await input('gradient-color-2', '#0000ff');
  assert.deepEqual((await gradient()).colors, ['#ff0000', '#00ff00', '#0000ff']);
  const previewGradient = () => page.evaluate(() => document.querySelector('.gradient-preview').style.background);
  const forwardPreview = await previewGradient();
  const beforeReverse = await bars();
  await click('reverse-color');
  assert.deepEqual((await gradient()).colors, ['#0000ff', '#00ff00', '#ff0000']);
  assert.notEqual(await previewGradient(), forwardPreview, 'The preview strip must follow the reversed order');
  assert.deepEqual(await bars(), beforeReverse, 'Reversing colors must not change audio response');
  await click('reverse-color');
  assert.deepEqual((await gradient()).colors, ['#ff0000', '#00ff00', '#0000ff']);
  assert.equal(await previewGradient(), forwardPreview);
  await click('add-color');
  await click('add-color');
  await click('add-color');
  assert.equal((await gradient()).colors.length, 5);
  assert.deepEqual((await gradient()).offsets, [0, 0.25, 0.5, 0.75, 1]);
  assert(await page.evaluate(() => document.querySelector('[data-testid="add-color"]').disabled));
  await click('reverse-color');
  assert.equal((await gradient()).colors.length, 5, 'Reversing must keep the color count');
  assert.deepEqual(await bars(), beforeReverse, 'Reversing five colors must not change audio response');
  await click('reverse-color');
  await click('remove-color-1');
  await click('remove-color-2');
  await click('remove-color-2');
  await click('remove-color-0');
  assert.deepEqual((await gradient()).colors, ['#ff0000', '#0000ff']);
  assert(await page.evaluate(() => document.querySelector('[data-testid="remove-color-0"]').disabled));
  await click('add-color');
  for (let index = 0; index < defaultGradient.length; index += 1) await input(`gradient-color-${index}`, defaultGradient[index]);
  await screenshot('gradient-energy-desktop.png');
  await input('corners', 'square');
  await click('mode-spectrum');
  paint = await gradient();
  assert.deepEqual(paint.colors, defaultGradient);
  assert(paint.fills.every((fill) => fill === `url(#${paint.id})`));
  assert((await corners()).every((radius) => radius === 0));
  await screenshot('gradient-spectrum-desktop.png');
  await click('reverse-color');
  assert.deepEqual((await gradient()).colors, [...defaultGradient].reverse(), 'Reversing must work in spectrum mode too');
  await screenshot('gradient-spectrum-reversed-desktop.png');
  await click('reverse-color');
  assert.deepEqual((await gradient()).colors, defaultGradient);
  await input('color-mode', 'solid');
  assert.equal(await gradient(), null);
  assert.equal(await page.evaluate(() => document.querySelector('[data-testid="energy-bars"] rect').getAttribute('fill')), '#ed7e96');
  await input('color-mode', 'gradient');
  assert.deepEqual((await gradient()).colors, defaultGradient, 'Switching color mode must retain gradient colors');
  assert.equal(await page.evaluate(() => document.querySelector('[data-testid="reverse-color"]').disabled), false);
  await input('color-mode', 'solid');
  await input('corners', 'rounded');
  await click('mode-energy');
  console.log('PASS color modes: solid, horizontal full-row gradient, 2–5 editable colors and both modes/corner styles');

  await input('count', 32);
  assert.equal((await bars()).length, 32);
  await input('color', '#ff6600');
  assert.equal(await page.evaluate(() => document.querySelector('[data-testid="energy-bars"] rect').getAttribute('fill')), '#ff6600');
  await input('alignment', 'bottom');
  assert(await page.evaluate(() => [...document.querySelectorAll('[data-testid="energy-bars"] rect')].every((rect) => Math.abs(Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) - 124) < 0.001)));
  const pointer = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="drag-box"]').getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...pointer, button: 'left', clickCount: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pointer.x + 40, y: pointer.y + 15, button: 'left', buttons: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pointer.x + 40, y: pointer.y + 15, button: 'left', clickCount: 1 });
  await settle();
  assert(await page.evaluate(() => Number(document.querySelector('[data-testid="position-x"]').value)) > 680, 'Pointer drag must move the asset in canvas coordinates');
  await input('position-x', 640);
  const zIndex = () => page.evaluate(() => Number(document.querySelector('[data-testid="energy-bars"]').style.zIndex));
  assert.equal(await zIndex(), 12);
  await click('move-down');
  assert.equal(await zIndex(), 10);
  await click('move-up');
  assert.equal(await zIndex(), 12);
  await input('placement', 'background');
  assert.equal(await zIndex(), 1);
  await click('visibility');
  assert.equal((await bars()).length, 0);
  await click('visibility');
  await page.evaluate(() => document.querySelector('[data-testid="drag-box"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  await settle();
  assert.equal(await page.evaluate(() => Number(document.querySelector('[data-testid="position-x"]').value)), 650);
  await input('position-y', 360);
  assert.equal(await page.evaluate(() => document.querySelector('[data-testid="energy-bars"]').style.top), '298px');
  await input('corners', 'square');
  await input('color-mode', 'gradient');
  await input('gradient-color-0', '#123456');
  await click('reset');
  assert.equal(await page.evaluate(() => document.querySelector('[data-testid="color-mode"]').value), 'solid');
  assert.equal(await page.evaluate(() => document.querySelector('[data-testid="color"]').value), '#ed7e96');
  await input('color-mode', 'gradient');
  assert.deepEqual((await gradient()).colors, defaultGradient, 'Reset restores gradient defaults too');
  await input('color-mode', 'solid');
  assert.equal(await page.evaluate(() => document.querySelector('[data-testid="corners"]').value), 'rounded');
  assert((await corners()).every((radius) => radius > 0));
  await input('seek', 1.25);
  console.log('PASS asset controls: count, color, alignment, layer order, visibility and keyboard position');

  const originalSource = await page.evaluate(() => document.querySelector('audio').src);
  await page.evaluate(() => {
    const files = new DataTransfer();
    files.items.add(new File(['not an audio file'], 'broken.wav', { type: 'audio/wav' }));
    const input = document.querySelector('[data-testid="file"]');
    input.files = files.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await wait(() => document.querySelector('.error')?.textContent.includes('无法解码'), 'Decode failure must be explained');
  assert.equal(await page.evaluate(() => document.querySelector('audio').src), originalSource);
  console.log('PASS failed import preserves the previous audio');

  const sampleOutput = path.join(temporary, 'sample.cjs');
  await build({ entryPoints: ['scripts/demos/audio-viz/sampleAudio.ts'], outfile: sampleOutput, bundle: true, platform: 'node', format: 'cjs' });
  const { createSampleAudio } = createRequire(import.meta.url)(sampleOutput);
  const sampleBytes = Buffer.from(await createSampleAudio().blob.arrayBuffer());
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const files = new DataTransfer();
    files.items.add(new File([bytes], 'generated-test.wav', { type: 'audio/wav' }));
    const input = document.querySelector('[data-testid="file"]');
    input.files = files.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, sampleBytes.toString('base64'));
  await wait(() => document.querySelector('.audio-source > span')?.textContent === 'generated-test.wav', 'WAV import must succeed');
  await input('seek', 1.3);
  assert((await bars()).some((value) => value > 3));
  assert.equal(await page.evaluate(() => Boolean(document.querySelector('.error'))), false);
  console.log('PASS local WAV import, analysis and replacement');

  // Optional local user-selected file. Never copied into the demo or served over HTTP.
  if (process.argv[2]) {
    const bytes = await readFile(process.argv[2]);
    await page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const files = new DataTransfer();
      files.items.add(new File([bytes], 'local-test.m4a', { type: 'audio/mp4' }));
      const input = document.querySelector('[data-testid="file"]');
      input.files = files.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, bytes.toString('base64'));
    await wait(() => document.querySelector('.audio-source > span')?.textContent === 'local-test.m4a', 'Optional M4A must decode');
    await input('seek', 20);
    assert((await bars()).some((value) => value > 3), 'Local audio must generate real energy');
    await click('mode-spectrum');
    assert((await bars()).some((value) => value > 3), 'Local audio must generate a real spectrum');
    const m4aSpectrum = await bars();
    await input('seek', 40);
    assert.notDeepEqual(await bars(), m4aSpectrum);
    await input('seek', 20);
    assert.deepEqual(await bars(), m4aSpectrum);
    await click('mode-energy');
    console.log('PASS optional local M4A import, energy and seekable spectrum');
  }
  // Restore the public synthetic sample before any further screenshots.
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.includes('用示例音频')).click());
  await wait(() => document.querySelector('.audio-source > span')?.textContent.includes('合成节奏') && document.querySelector('audio')?.readyState >= 2, 'Sample must restore');
  await input('seek', 1.25);
  await click('theme');
  await screenshot('desktop-dark.png');
  await click('language');
  await click('mode-spectrum');
  await input('color-mode', 'gradient');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  await page.setViewport({ width: 375, height: 900, deviceScaleFactor: 1 });
  await settle();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile layout must not overflow');
  await screenshot('mobile-dark-en.png');
  await click('language');
  await click('theme');
  await screenshot('mobile-light.png');
  await page.evaluate(() => document.querySelector('.inspector').scrollIntoView());
  await screenshot('mobile-controls.png');
  assert(await page.evaluate(() => [...document.querySelectorAll('.inspector > .panel')].every((panel) => {
    return Math.abs(panel.getBoundingClientRect().width - document.querySelector('.inspector').getBoundingClientRect().width) < 1;
  })), 'Mobile panels must fill the inspector width');
  assert(await page.evaluate(() => [...document.querySelectorAll('.inspector button, .inspector select')].every((element) => {
    const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth;
  })), 'Inspector controls must fit on a phone');
  await page.setViewport({ width: 812, height: 375, deviceScaleFactor: 1 });
  await settle();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Landscape layout must not overflow');
  await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert(await page.evaluate(() => document.querySelector('audio').paused), 'No autoplay under reduced motion');
  assert.deepEqual(errors, []);
  console.log('PASS bilingual, desktop/mobile, dark/light and reduced-motion checks');
  console.log(`Demo and screenshots: ${path.dirname(htmlPath)}`);
} finally {
  if (browser) await browser.close({ silent: true });
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
