// node scripts/test-audio-viz-asset.mjs
// Optional: POMCHAT_TEST_BROWSER=/path/to/chrome (always runs headlessly).
// Uses synthetic audio and synthetic projects only; never reads app config, projects or credentials.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build, build as esbuild } from 'esbuild';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainSource = readFileSync(path.join(root, 'electron/main.ts'), 'utf8');
const mainSourceForAccentCheck = readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
// Labels in the shared asset block must not promise an image-only field.
const i18nSource = readFileSync(path.join(root, 'src/i18n.ts'), 'utf8');
assert.ok(i18nSource.includes("'project.insertImageOrder': '层级',"), 'The layer order label must stay type-neutral (zh)');
assert.ok(i18nSource.includes("'project.insertImageOrder': 'Layer order',"), 'The layer order label must stay type-neutral (en)');

// Static wiring checks: the export worker must serve the prepared analysis file and
// must not leak the local path into the render page.
const workerSource = readFileSync(path.join(root, 'electron/remotion-worker.cjs'), 'utf8');
assert.ok(
  workerSource.includes('audioVizGrid: config.audioVizGridPath ? mediaServer.urlForPath(config.audioVizGridPath) : undefined'),
  'The worker must serve the prepared analysis file',
);
assert.ok(workerSource.includes('audioVizGridPath: undefined'), 'The worker must not forward the local analysis path');
assert.ok(
  workerSource.includes("slide?.layer === 'overlay' || slide?.type === 'audio-viz'"),
  'Transparent exports must keep audio visualizations on every layer',
);
// The focus ring must follow the theme instead of the previous purple fallback.
const baseStylesheet = readFileSync(path.join(root, 'src/index.css'), 'utf8');
assert.ok(
  baseStylesheet.includes('outline: 2px solid var(--podchat-accent'),
  'The global focus ring must use the accent variable',
);
assert.ok(
  mainSourceForAccentCheck.includes("root.style.setProperty('--podchat-accent', secondaryThemeColor)"),
  'The app must publish the theme colour as the accent variable',
);

assert.ok(mainSource.includes('writeAudioVizGridFile'), 'The main process must prepare the analysis file for the export');
assert.ok(
  mainSource.includes("config.background.slides.some((slide: { type?: string }) => slide?.type === 'audio-viz')"),
  'The main process must only prepare the analysis when the project uses it',
);
assert.ok(mainSource.includes('fs.rmSync(audioVizGridPath, { force: true })'), 'The analysis file must be cleaned up');
const temporary = mkdtempSync(path.join(tmpdir(), 'pomchat-audio-viz-'));
const SAMPLE_RATE = 16000;
const screenshotsDirectory = process.argv[2];
const localAudioPath = process.env.POMCHAT_AUDIOVIZ_AUDIO || '';
let browser;
let server;

/** Mirrors the fixture generator so both sides analyse identical audio. */
const createBurstWav = () => {
  const duration = 1.6;
  const samples = new Float32Array(Math.round(SAMPLE_RATE * duration));
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / SAMPLE_RATE;
    if (time < 0.5 || time >= 1) continue;
    samples[index] = 0.6 * Math.sin(2 * Math.PI * 440 * time);
  }
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => buffer.writeInt16LE(Math.round(sample * 32767), 44 + index * 2));
  return { buffer, samples };
};

try {
  const audioPath = path.join(temporary, 'burst.wav');
  const { buffer: wav, samples } = createBurstWav();
  writeFileSync(audioPath, wav);

  const modulePath = path.join(temporary, 'modules.cjs');
  await build({
    stdin: {
      resolveDir: root,
      loader: 'ts',
      contents: `
        export * from './src/remotion/audioVizGrid';
        export { buildAudioVizGridFromAudio, encodeAudioVizGridForIpc, getAudioVizGrid } from './electron/audioViz';
      `,
    },
    outfile: modulePath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  });
  const {
    buildAudioVizGrid, buildAudioVizGridFromAudio, encodeAudioVizGridForIpc, getAudioVizGrid,
    getAudioVizLevels, decodeAudioVizGrid,
  } = createRequire(import.meta.url)(modulePath);
  const compositorDir = path.join(root, 'node_modules', `@remotion/compositor-${process.platform === 'darwin' ? `darwin-${process.arch === 'arm64' ? 'arm64' : 'x64'}` : `${process.platform}-${process.arch}`}`);
  const ffmpeg = process.env.POMCHAT_FFMPEG_PATH || path.join(compositorDir, 'ffmpeg');
  if (process.platform === 'darwin') {
    // The bundled macOS binaries resolve their libraries relative to this directory.
    process.env.DYLD_LIBRARY_PATH = [compositorDir, process.env.DYLD_LIBRARY_PATH].filter(Boolean).join(':');
  }

  // The FFmpeg analysis path must reproduce the pure-JS grid for identical PCM.
  // Decoding is allowed to shift a stored value by one quantization step, but the
  // rendered bars have to stay the same.
  const expectedGrid = buildAudioVizGrid([samples], SAMPLE_RATE);
  const decodedGrid = await buildAudioVizGridFromAudio(ffmpeg, audioPath);
  assert.equal(decodedGrid.frames, expectedGrid.frames, 'FFmpeg analysis must cover the same number of frames');
  assert.equal(decodedGrid.energyCount, expectedGrid.energyCount);
  const compareQuantized = (label, actual, expected) => {
    assert.equal(actual.length, expected.length, `${label} length`);
    let worst = 0;
    let differing = 0;
    for (let index = 0; index < expected.length; index += 1) {
      const delta = Math.abs(actual[index] - expected[index]);
      if (delta) differing += 1;
      if (delta > worst) worst = delta;
    }
    assert(worst <= 1, `${label} must not drift by more than one quantization step (worst ${worst})`);
    assert(differing / expected.length < 0.001, `${label} must match almost everywhere (${differing} of ${expected.length} differ)`);
    return worst;
  };
  const bandDelta = compareQuantized('bands', decodedGrid.bands, expectedGrid.bands);
  const energyDelta = compareQuantized('energy', decodedGrid.energy, expectedGrid.energy);
  const toneLevels = getAudioVizLevels(expectedGrid, 0.75, { mode: 'spectrum', count: 24, gain: 5, smoothingSeconds: 0 });
  const silentLevels = getAudioVizLevels(expectedGrid, 1.25, { mode: 'spectrum', count: 24, gain: 5, smoothingSeconds: 0 });
  const decodedTone = getAudioVizLevels(decodedGrid, 0.75, { mode: 'spectrum', count: 24, gain: 5, smoothingSeconds: 0 });
  assert(Math.max(...decodedTone.map((level, index) => Math.abs(level - toneLevels[index]))) < 0.02, 'Decoded levels must match the shared module');
  assert(Math.max(...toneLevels) > 0.4, 'The tone must produce visible levels');
  assert.equal(Math.max(...silentLevels), 0, 'Silence must stay at the baseline');
  console.log(`PASS analysis: FFmpeg streaming grid matches the shared module (worst step ${Math.max(bandDelta, energyDelta)})`);

  const cachedGrid = await getAudioVizGrid(ffmpeg, audioPath);
  assert.strictEqual(await getAudioVizGrid(ffmpeg, audioPath), cachedGrid, 'The desktop must reuse completed analysis');
  await assert.rejects(buildAudioVizGridFromAudio(ffmpeg, path.join(temporary, 'missing.wav')));
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(buildAudioVizGridFromAudio(ffmpeg, audioPath, cancelled.signal));

  // A five-minute PCM source exercises multiple FFmpeg chunks and catches main-process stalls.
  const episode = Buffer.alloc(44 + SAMPLE_RATE * 300 * 2);
  wav.copy(episode, 0, 0, 44);
  episode.writeUInt32LE(episode.length - 8, 4);
  episode.writeUInt32LE(episode.length - 44, 40);
  for (let offset = 44; offset < episode.length; offset += 320) episode.writeInt16LE(12000, offset);
  const episodePath = path.join(temporary, 'episode.wav');
  writeFileSync(episodePath, episode);
  let heartbeatTicks = 0;
  let lastTick = performance.now();
  let maxTickGapMs = 0;
  const heartbeat = setInterval(() => {
    const now = performance.now();
    maxTickGapMs = Math.max(maxTickGapMs, now - lastTick);
    lastTick = now;
    heartbeatTicks += 1;
  }, 16);
  const analysisStarted = performance.now();
  let episodeGrid;
  try {
    episodeGrid = await buildAudioVizGridFromAudio(ffmpeg, episodePath);
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    clearInterval(heartbeat);
  }
  assert.equal(episodeGrid.frames, 300 * 60);
  assert(heartbeatTicks > 5, 'Desktop analysis must keep the main event loop responsive');
  assert(maxTickGapMs < 120, `Desktop analysis stalled the main event loop for ${maxTickGapMs.toFixed(0)}ms`);
  const aborting = new AbortController();
  const abortTimer = setTimeout(() => aborting.abort(), 20);
  try {
    await assert.rejects(buildAudioVizGridFromAudio(ffmpeg, episodePath, aborting.signal), /cancelled|aborted/i);
  } finally {
    clearTimeout(abortTimer);
  }
  console.log(`PASS desktop responsiveness: 5-minute analysis ${(performance.now() - analysisStarted).toFixed(0)}ms, longest heartbeat gap ${maxTickGapMs.toFixed(0)}ms; cache, failure and cancellation`);

  const gridPath = path.join(temporary, 'grid.bin');
  writeFileSync(gridPath, Buffer.from(encodeAudioVizGridForIpc(expectedGrid)));

  // The editor checks include layout, so the built stylesheet is always loaded.
  const assetsDirectory = path.join(root, 'dist/assets');
  const appStylesheet = existsSync(assetsDirectory)
    ? path.join(assetsDirectory, readdirSync(assetsDirectory).find((file) => file.endsWith('.css')) || '')
    : '';
  assert.ok(appStylesheet && existsSync(appStylesheet), 'Run npm run build first: the editor checks need the built stylesheet');
  if (screenshotsDirectory) mkdirSync(screenshotsDirectory, { recursive: true });
  const appBundle = path.join(temporary, 'app.js');
  await esbuild({
    entryPoints: [path.join(root, 'scripts/fixtures/audio-viz-asset.tsx')],
    outfile: appBundle, bundle: true, platform: 'browser', format: 'iife', globalName: 'AudioVizTests',
    jsx: 'automatic', loader: { '.svg': 'dataurl', '.png': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.DEV': 'true', '__APP_VERSION__': '"test"', '__APP_COMMIT__': '"test"' },
  });

  server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/app.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(readFileSync(appBundle));
      return;
    }
    if (url.pathname === '/grid.bin') {
      response.setHeader('Content-Type', 'application/octet-stream');
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.end(readFileSync(gridPath));
      return;
    }
    if (url.pathname === '/burst.wav') {
      response.setHeader('Content-Type', 'audio/wav');
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.end(readFileSync(audioPath));
      return;
    }
    if (url.pathname === '/app.css') {
      response.setHeader('Content-Type', 'text/css');
      response.end(readFileSync(appStylesheet));
      return;
    }
    if (url.pathname === '/local-audio' && localAudioPath) {
      response.setHeader('Content-Type', 'application/octet-stream');
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.end(readFileSync(localAudioPath));
      return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;

  browser = await openBrowser('chrome', {
    browserExecutable: process.env.POMCHAT_TEST_BROWSER || undefined,
    chromiumOptions: { headless: true },
    logLevel: 'error',
  });
  const errors = [];
  const page = await browser.newPage({
    context: { sourceMap: () => null, sourceMapUrl: () => null },
    logLevel: 'error', indent: false, pageIndex: 0, onLog: () => {},
    onBrowserLog: (log) => { if (log.type === 'error') errors.push(log.text); },
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  await page.goto({ url: origin, timeout: 30_000 });

  // The served analysis must decode to exactly the levels computed on the Node side.
  const expected = [0.25, 0.75, 1.25].map((time) => ({
    time,
    levels: getAudioVizLevels(expectedGrid, time, { mode: 'spectrum', count: 24, gain: 5, smoothingSeconds: 0 }),
  }));
  const fetched = await page.evaluate(
    (url, payload) => window.AudioVizTests.runAudioVizGridFetchTest(url, payload),
    `${origin}/grid.bin`,
    expected,
  );
  assert.equal(fetched.frames, expectedGrid.frames);
  assert(Math.abs(fetched.duration - 1.6) < 0.02);

  // The web preview builds its own grid from decoded audio; it must agree with Node.
  const inBrowser = await page.evaluate((url) => window.AudioVizTests.buildGridInBrowser(url), `${origin}/burst.wav`);
  assert.equal(inBrowser.frames, expectedGrid.frames, 'Browser analysis must cover the same frames');
  for (const [index, time] of [0.25, 0.75, 1.25].entries()) {
    const nodeLevels = getAudioVizLevels(expectedGrid, time, { mode: 'spectrum', count: 24, gain: 5, smoothingSeconds: 0 });
    const worst = Math.max(...inBrowser.spectrum[index].map((level, band) => Math.abs(level - nodeLevels[band])));
    assert(worst < 0.08, `Browser analysis must match Node at ${time}s (worst delta ${worst.toFixed(3)})`);
  }
  console.log('PASS transport: served grid and in-browser analysis agree with the editor');

  // Optional real-file check: how far does the browser's own decoding drift from FFmpeg?
  const localAudio = process.env.POMCHAT_AUDIOVIZ_AUDIO;
  if (localAudio) {
    assert(existsSync(localAudio), `Missing audio fixture: ${localAudio}`);
    const realGrid = await buildAudioVizGridFromAudio(ffmpeg, localAudio);
    const times = Array.from({ length: 24 }, (_, index) => ((index + 0.5) / 24) * Math.min(60, realGrid.duration));
    const reference = times.map((time) => ({
      time,
      spectrum: getAudioVizLevels(realGrid, time, { mode: 'spectrum', count: 48, gain: 5, smoothingSeconds: 0.04 }),
      energy: getAudioVizLevels(realGrid, time, { mode: 'energy', count: 48, gain: 5, smoothingSeconds: 0.04 }),
    }));
    const browser = await page.evaluate(async (url, entries) => {
      const response = await fetch(url);
      const encoded = await response.arrayBuffer();
      const context = new AudioContext({ sampleRate: 16000 });
      try {
        const decoded = await context.decodeAudioData(encoded);
        const grid = window.AudioVizTests.buildGridFromChannels(
          Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index)),
          decoded.sampleRate,
        );
        return entries.map((entry) => ({
          spectrum: window.AudioVizTests.levelsFromGrid(grid, entry.time, 'spectrum'),
          energy: window.AudioVizTests.levelsFromGrid(grid, entry.time, 'energy'),
        }));
      } finally {
        await context.close();
      }
    }, `${origin}/local-audio`, reference);
    const worst = (key) => Math.max(...reference.map((entry, index) => Math.max(...entry[key].map((level, band) => Math.abs(level - browser[index][key][band])))));
    const spectrumDelta = worst('spectrum');
    const energyDelta = worst('energy');
    assert(spectrumDelta < 0.2, `Browser spectrum analysis must stay close to FFmpeg (worst ${spectrumDelta.toFixed(3)})`);
    assert(energyDelta < 0.2, `Browser energy analysis must stay close to FFmpeg (worst ${energyDelta.toFixed(3)})`);
    const sampled = await page.evaluate(() => window.AudioVizTests.getSampledAudio());
    assert(sampled.levelCount > 0, 'The browser must decode the local audio');
    console.log(`PASS real audio (${path.basename(localAudio)}): browser analysis vs FFmpeg — worst spectrum delta ${spectrumDelta.toFixed(3)}, energy ${energyDelta.toFixed(3)} (level units, 1.0 = full height)`);
  }

  const component = await page.evaluate((url) => window.AudioVizTests.runAudioVizComponentTest(url), `${origin}/grid.bin`);
  assert.equal(component.bars, 24);
  assert.equal(component.silent, 3, 'The shared component must render the silent baseline');
  assert(component.loud > 40, 'The shared component must render tall bars for the tone');
  assert(component.deterministic, 'The shared component must be deterministic');
  assert.equal(component.xAttributes, 24, 'Every bar must keep its own position');
  assert.equal(component.cornerRadius, 0, 'Square corners must reach the SVG');
  console.log('PASS component: shared preview/export renderer reacts to the grid');

  const editorChecks = await page.evaluate(() => window.AudioVizTests.startAudioVizEditorTest());
  const captureEditor = async (name) => {
    if (!screenshotsDirectory) return;
    const { value } = await page._client().send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(screenshotsDirectory, `${name}.png`), Buffer.from(value.data, 'base64'));
    console.log(`Captured ${name}.png`);
  };
  await captureEditor('audio-viz-spectrum');
  if (screenshotsDirectory) {
    await page.evaluate(() => window.AudioVizTests.scrollAudioVizControlsIntoView('controls'));
    await captureEditor('audio-viz-controls');
    await page.evaluate(() => window.AudioVizTests.scrollAudioVizControlsIntoView('opacity'));
    await captureEditor('audio-viz-opacity');
    await page.evaluate(() => window.AudioVizTests.scrollAudioVizControlsIntoView('layer'));
    await captureEditor('audio-viz-layer');
    await page.evaluate(() => window.AudioVizTests.scrollAudioVizControlsIntoView('rotation'));
    await captureEditor('audio-viz-rotation');
    await page.evaluate(() => window.AudioVizTests.setAudioVizEditorScreenshotState('energy'));
    await captureEditor('audio-viz-energy');
    await page.evaluate(() => window.AudioVizTests.setAudioVizEditorScreenshotState('spectrum'));
  }
  editorChecks.push(...await page.evaluate(() => window.AudioVizTests.finishAudioVizEditorTest()));
  editorChecks.push(...await page.evaluate(() => window.AudioVizTests.runSpeakerToggleTest()));
  if (screenshotsDirectory) {
    await page.evaluate(() => window.AudioVizTests.openSpeakersForScreenshot());
    const { value } = await page._client().send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(screenshotsDirectory, 'speakers-toggles.png'), Buffer.from(value.data, 'base64'));
    console.log('Captured speakers-toggles.png');
  }
  await page.evaluate(() => window.AudioVizTests.closeAudioVizEditorTest());
  assert.deepEqual(errors, [], 'The editor must not report browser errors');
  editorChecks.forEach((check) => console.log(`PASS editor: ${check}`));

  const responsive = await page.evaluate(() => window.AudioVizTests.runAudioVizInsertionResponsivenessTest());
  console.log(`PASS editor responsiveness: cold insert ${responsive.coldMs}ms, longest paint gap ${responsive.maxFrameGapMs}ms; controls, reinsertion cache and source replacement`);
  assert.deepEqual(errors, [], 'The responsiveness check must not report browser errors');

  // Real Remotion render of the same asset, with the audio path blanked the way the
  // export worker does it, so the bars can only come from the analysis file.
  const serveUrl = await bundle({ entryPoint: path.join(root, 'src/remotion/Root.tsx'), outDir: path.join(temporary, 'bundle') });
  const inputProps = {
    fps: 30,
    dimensions: { width: 1280, height: 720 },
    exportRange: { start: 0, end: 2 },
    audioPath: '',
    audioVizGrid: `${origin}/grid.bin`,
    background: {
      image: '',
      blur: 0,
      brightness: 1,
      slides: [{
        id: 'viz-export', type: 'audio-viz', name: 'Viz', start: 0, end: 2, layer: 'overlay', overlayOrder: 0, backgroundOrder: 0,
        scale: 1, offsetX: 0, offsetY: 0, rotation: 0, opacity: 1, visible: true, inheritBackgroundFilters: false,
        animationStyle: 'none', animationDuration: 0, audioVizMode: 'spectrum', audioVizColorMode: 'solid',
        audioVizColor: '#FF0000', audioVizCornerStyle: 'square', audioVizAlignment: 'bottom',
        audioVizBars: 24, audioVizGain: 5, audioVizSmoothing: 0, audioVizWidth: 480, audioVizHeight: 200,
      }],
    },
    chatLayout: { animationStyle: 'none', showAvatar: false, showSpeakerName: false, showTimestamp: false },
    speakers: { A: { name: 'Alice', side: 'left', type: 'speaker', style: {} } },
    content: [],
  };
  const renderBrowser = await openBrowser('chrome', { chromiumOptions: { gl: 'swiftshader', headless: true }, logLevel: 'error' });
  const stills = {};
  try {
    const common = { serveUrl, inputProps, puppeteerInstance: renderBrowser, chromiumOptions: { gl: 'swiftshader' }, logLevel: 'error' };
    const composition = await selectComposition({ ...common, id: 'PodchatRender' });
    for (const [name, frame] of [['tone', 22], ['silence', 38]]) {
      const output = path.join(temporary, `${name}.png`);
      await renderStill({ ...common, composition, frame, output, imageFormat: 'png', overwrite: true, concurrency: 1 });
      stills[name] = output;
    }
    // Transparent exports keep the visualization even on the bottom layer.
    const alphaProps = {
      ...inputProps,
      transparentBackground: true,
      background: {
        ...inputProps.background,
        image: '',
        blur: 0,
        brightness: 1,
        slides: inputProps.background.slides.map((slide) => ({ ...slide, layer: 'background' })),
      },
    };
    await renderStill({
      ...common, composition, frame: 22, inputProps: alphaProps,
      output: path.join(temporary, 'alpha-tone.png'), imageFormat: 'png', overwrite: true, concurrency: 1,
    });
  } finally {
    await renderBrowser.close({ silent: true });
  }

  // Compare the renders in the browser, which decodes PNG without extra dependencies.
  const compareServer = createServer((request, response) => {
    const file = path.basename(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    const filePath = path.join(temporary, file);
    if (!/^[\w.-]+\.png$/.test(file) || !existsSync(filePath)) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.end(readFileSync(filePath));
  });
  await new Promise((resolve, reject) => {
    compareServer.once('error', reject);
    compareServer.listen(0, '127.0.0.1', resolve);
  });
  const compareOrigin = `http://127.0.0.1:${compareServer.address().port}`;
  try {
    // Preview frames at the export canvas size, captured from the shared renderer.
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    for (const [name, frame] of [['preview-tone', 22], ['preview-silence', 38]]) {
      await page.evaluate((url, time) => window.AudioVizTests.mountCanvasPreview(url, time), `${origin}/grid.bin`, frame / 30);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const { value } = await page._client().send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path.join(temporary, `${name}.png`), Buffer.from(value.data, 'base64'));
    }
    // The web edition analyses decoded audio in the browser instead of FFmpeg.
    for (const [name, frame] of [['preview-web-tone', 22], ['preview-web-silence', 38]]) {
      await page.evaluate((url, time) => window.AudioVizTests.mountCanvasPreviewFromAudio(url, time), `${origin}/burst.wav`, frame / 30);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const { value } = await page._client().send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path.join(temporary, `${name}.png`), Buffer.from(value.data, 'base64'));
    }
    await page.evaluate(() => window.AudioVizTests.unmountCanvasPreview());

    const counts = await page.evaluate(async (base) => {
      const measure = async (name) => {
        const blob = await (await fetch(`${base}/${name}`)).blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        context.drawImage(bitmap, 0, 0);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        let red = 0;
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            const offset = (y * canvas.width + x) * 4;
            if (data[offset] > 180 && data[offset + 1] < 80 && data[offset + 2] < 80) {
              red += 1;
              if (x < left) left = x;
              if (x > right) right = x;
              if (y < top) top = y;
              if (y > bottom) bottom = y;
            }
          }
        }
        return { red, left, top, right, bottom, width: bitmap.width, height: bitmap.height };
      };
      const names = ['tone.png', 'silence.png', 'alpha-tone.png', 'preview-tone.png', 'preview-silence.png', 'preview-web-tone.png', 'preview-web-silence.png'];
      const results = {};
      for (const name of names) results[name] = await measure(name);
      return results;
    }, compareOrigin);

    const still = counts['tone.png'];
    const quietStill = counts['silence.png'];
    const preview = counts['preview-tone.png'];
    const quietPreview = counts['preview-silence.png'];
    assert.equal(still.width, 1280);
    assert.equal(still.height, 720);
    assert.equal(preview.width, 1280);
    assert.equal(preview.height, 720);
    assert(quietStill.red > 0, 'The exported still must contain the asset');
    assert(still.red > quietStill.red * 2, `The exported bars must react to the audio (tone ${still.red} vs silence ${quietStill.red})`);
    console.log(`PASS export: Remotion still renders analysed bars (${still.red} vs ${quietStill.red} pixels)`);

    // A transparent export must still draw the visualization, even on the bottom layer.
    const alphaStill = counts['alpha-tone.png'];
    assert(alphaStill.red > 0, 'A transparent export must keep the audio visualization');
    assert(
      Math.abs(alphaStill.red - still.red) <= Math.max(60, Math.round(still.red * 0.02)),
      `A transparent export must draw the same bars (alpha ${alphaStill.red} vs ${still.red})`,
    );
    console.log(`PASS alpha export: bottom-layer visualization survives (${alphaStill.red} red pixels)`);

    // The preview and the export must draw the same bars at the same moment.
    for (const [label, a, b] of [['tone', preview, still], ['silence', quietPreview, quietStill]]) {
      const delta = Math.abs(a.red - b.red);
      const tolerance = Math.max(60, Math.round(Math.max(a.red, b.red) * 0.02));
      assert(delta <= tolerance, `${label}: preview and export must draw the same bars (preview ${a.red} vs export ${b.red} red pixels)`);
      for (const edge of ['left', 'top', 'right', 'bottom']) {
        assert(
          Math.abs(a[edge] - b[edge]) <= 1,
          `${label}: the bar bounding box must match on ${edge} (preview ${a[edge]} vs export ${b[edge]})`,
        );
      }
    }
    console.log(`PASS preview vs export: identical bars at the same time (tone ${preview.red}/${still.red}, silence ${quietPreview.red}/${quietStill.red} red pixels)`);

    // The web preview decodes audio itself; report how far that can drift from the export.
    const web = counts['preview-web-tone.png'];
    const quietWeb = counts['preview-web-silence.png'];
    const webDelta = Math.abs(web.red - still.red);
    const webTolerance = Math.max(200, Math.round(still.red * 0.08));
    assert(webDelta <= webTolerance, `web preview: bars must stay close to the export (web ${web.red} vs export ${still.red})`);
    assert(Math.abs(quietWeb.red - quietStill.red) <= 200, `web preview: silence must match (web ${quietWeb.red} vs export ${quietStill.red})`);
    for (const edge of ['left', 'top', 'right', 'bottom']) {
      assert(Math.abs(web[edge] - still[edge]) <= 4, `web preview: bounding box must stay close on ${edge} (web ${web[edge]} vs export ${still[edge]})`);
    }
    console.log(`PASS web preview vs export: browser-decoded analysis stays within ${webDelta} red pixels and ${Math.max(...['left', 'top', 'right', 'bottom'].map((edge) => Math.abs(web[edge] - still[edge])))}px of the export`);
  } finally {
    await new Promise((resolve) => compareServer.close(resolve));
  }

  assert.deepEqual(errors, [], 'No browser errors are allowed');
  console.log(`Artifacts: ${temporary}`);
} finally {
  if (browser) await browser.close({ silent: true });
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(temporary, { recursive: true, force: true });
}
