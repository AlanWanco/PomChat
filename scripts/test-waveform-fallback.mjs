import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { openBrowser } from '@remotion/renderer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(path.join(tmpdir(), 'pomchat-waveform-test-'));
let browser;
let server;
try {
  const audioWaveformBundle = path.join(temporary, 'audioWaveform.cjs');
  await build({
    entryPoints: [path.join(root, 'electron/audioWaveform.ts')],
    outfile: audioWaveformBundle,
    bundle: true,
    platform: 'node',
    format: 'cjs',
  });
  const { parsePcm16WavSamples, decodeAudioWaveform } = createRequire(import.meta.url)(audioWaveformBundle);

  const pcm = Buffer.alloc(10);
  [-32768, -16384, 0, 16384, 32767].forEach((sample, index) => pcm.writeInt16LE(sample, index * 2));
  const format = Buffer.alloc(16);
  format.writeUInt16LE(1, 0);
  format.writeUInt16LE(1, 2);
  format.writeUInt32LE(1024, 4);
  format.writeUInt32LE(2048, 8);
  format.writeUInt16LE(2, 12);
  format.writeUInt16LE(16, 14);
  const fmtChunk = Buffer.concat([Buffer.from('fmt '), Buffer.from([16, 0, 0, 0]), format]);
  const listChunk = Buffer.concat([Buffer.from('LIST'), Buffer.from([1, 0, 0, 0]), Buffer.from([0x41, 0])]);
  const dataChunk = Buffer.concat([Buffer.from('data'), Buffer.from([0xff, 0xff, 0xff, 0xff]), pcm]);
  const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0xff, 0xff, 0xff, 0xff]), Buffer.from('WAVE'), fmtChunk, listChunk, dataChunk]);
  const samples = parsePcm16WavSamples(new Uint8Array(wav.buffer, wav.byteOffset, wav.byteLength));
  assert.equal(samples.length, 5);
  assert.deepEqual([...samples], [-1, -0.5, 0, 0.5, 32767 / 32768]);
  assert.throws(() => parsePcm16WavSamples(new Uint8Array([1, 2, 3])), /invalid WAV/i);
  console.log('PASS PCM WAV parser: sentinel chunk sizes, padded chunks and signed 16-bit samples');

  const audioFile = process.argv[2];
  if (audioFile) {
    const decoded = await decodeAudioWaveform(process.env.POMCHAT_FFMPEG_PATH || 'ffmpeg', audioFile);
    assert(decoded.length > 0, 'FFmpeg must return waveform samples');
    assert(decoded.some((sample) => Math.abs(sample) > 0.01), 'Waveform samples must preserve signal amplitude');
    console.log(`PASS FFmpeg waveform decode: ${decoded.length} samples`);
  }

  const uiBundle = path.join(temporary, 'waveform-fallback.js');
  await build({
    entryPoints: [path.join(root, 'scripts/fixtures/waveform-fallback.tsx')],
    outfile: uiBundle,
    bundle: true,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    nodePaths: [path.join(root, 'node_modules')],
    define: { 'process.env.NODE_ENV': '"development"' },
  });

  server = createServer((request, response) => {
    if (request.url === '/test.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(readFileSync(uiBundle));
      return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/test.js"></script>');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  browser = await openBrowser('chrome', { chromiumOptions: { headless: true }, logLevel: 'error' });
  const pageErrors = [];
  const page = await browser.newPage({
    context: { sourceMap: () => null, sourceMapUrl: () => null },
    logLevel: 'error',
    indent: false,
    pageIndex: 0,
    onLog: () => {},
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.goto({ url: `http://127.0.0.1:${server.address().port}`, timeout: 30000 });
  const fallbackResult = await page.evaluate(() => window.PomChatWaveformFallbackTest.run());
  assert.equal(fallbackResult.decodeFailures, 1, 'Test must simulate the Electron decoder failure');
  assert.equal(fallbackResult.fallbackCalls, 1, 'FFmpeg fallback must be requested once');
  assert.equal(fallbackResult.visible, true, 'Waveform must become visible after fallback');
  assert(fallbackResult.canvasCount > 0, 'Fallback must render waveform canvases');
  assert.deepEqual(pageErrors, []);
  console.log('PASS PlayerControls: Web Audio decode failure falls back to supplied PCM peaks');
} finally {
  if (browser) await browser.close({ silent: true });
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(temporary, { recursive: true, force: true });
}
