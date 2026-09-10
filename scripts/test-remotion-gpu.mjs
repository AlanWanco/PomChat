// Windows NVIDIA: node scripts/test-remotion-gpu.mjs
// CPU baseline:    node scripts/test-remotion-gpu.mjs --software
// Compact layout:  node scripts/test-remotion-gpu.mjs --compact
// Encoding only:   node scripts/test-remotion-gpu.mjs --gl=swangle
// Uses synthetic content only; never loads app config, project files, or biliup credentials.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { bundle } from '@remotion/bundler';
import { getVideoMetadata, openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';

const { values } = parseArgs({
  options: {
    software: { type: 'boolean', default: false },
    compact: { type: 'boolean', default: false },
    gl: { type: 'string' },
  },
});
const gl = values.gl ?? (values.software ? 'swangle' : 'angle');
assert(['angle', 'swangle', 'swiftshader'].includes(gl), 'Unsupported --gl backend');
assert(['win32', 'linux', 'darwin'].includes(process.platform), 'Unsupported test platform');
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = mkdtempSync(path.join(tmpdir(), 'pomchat-gpu-smoke-'));
const outputLocation = path.join(directory, 'bubbles.mp4');
const expectedEncoder = values.software ? 'libx264' : process.platform === 'darwin' ? 'h264_videotoolbox' : 'h264_nvenc';
const avatar = (color) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="16" fill="${color}"/><circle cx="32" cy="26" r="12" fill="white"/></svg>`)}`;
const inputProps = {
  fps: 30,
  dimensions: { width: 1280, height: 720 },
  exportRange: { start: 0, end: 4 },
  audioPath: '',
  background: {},
  fontPresets: {},
  chatLayout: {
    animationStyle: 'rise', animationDuration: 0.3, bubbleScale: 1,
    compactMode: values.compact, interruptionEnabled: true, maxVisibleBubbles: 8,
    showAvatar: true, showSpeakerName: true, showTimestamp: true,
  },
  speakers: {
    left: { name: '左侧说话人', side: 'left', type: 'speaker', avatar: avatar('#2563eb'), style: { bubbleShadow: true, textShadow: true } },
    right: { name: '右侧说话人', side: 'right', type: 'speaker', avatar: avatar('#16a34a'), style: { bubbleShadow: true, textShadow: true } },
    ANNOTATION: { name: '注释', type: 'annotation', style: { annotationPosition: 'top' } },
  },
  content: [
    { type: 'text', speaker: 'left', start: 0.5, end: 2.8, text: 'GPU 导出测试：**中文粗体**与换行。\n第二行 / Second line.' },
    { type: 'text', speaker: 'right', start: 1.2, end: 2.2, text: '右侧气泡与打断动画 / NVENC smoke test' },
    { type: 'text', speaker: 'left', start: 2.9, end: 4, text: '第三条消息：保留现有气泡组件。' },
    { type: 'text', speaker: 'ANNOTATION', start: 0.3, end: 3.8, text: '合成测试素材，不读取用户项目' },
  ],
};
const encoders = new Set();
const report = {
  platform: process.platform, arch: process.arch, node: process.version,
  remotion: require('remotion/package.json').version,
  hardwareAcceleration: values.software ? 'disable' : 'required',
  requestedGl: gl, compactMode: values.compact, expectedEncoder,
  // The GL flag alone does not prove the browser used a physical GPU.
  outputLocation,
};
let browser;
const startedAt = performance.now();
console.log(`Artifacts: ${directory}`);
try {
  const serveUrl = await bundle({ entryPoint: path.join(root, 'src/remotion/Root.tsx'), outDir: path.join(directory, 'bundle') });
  browser = await openBrowser('chrome', { chromeMode: 'headless-shell', chromiumOptions: { gl } });
  const common = { serveUrl, inputProps, puppeteerInstance: browser, chromiumOptions: { gl }, logLevel: 'error' };
  const composition = await selectComposition({ ...common, id: 'PodchatRender' });
  assert.equal(composition.durationInFrames, 120);
  const renderStartedAt = performance.now();
  await renderMedia({
    ...common, composition, outputLocation, codec: 'h264', pixelFormat: 'yuv420p',
    hardwareAcceleration: report.hardwareAcceleration,
    ...(values.software ? { crf: 20, x264Preset: 'veryfast' } : { videoBitrate: '5M' }),
    imageFormat: 'jpeg', jpegQuality: 92, concurrency: 2,
    ffmpegOverride: ({ args }) => {
      for (let index = 0; index < args.length - 1; index += 1) {
        if (['-c:v', '-vcodec', '-codec:v'].includes(args[index])) encoders.add(args[index + 1]);
      }
      return args;
    },
  });
  report.renderMs = Math.round(performance.now() - renderStartedAt);
  assert(encoders.has(expectedEncoder), `Expected ${expectedEncoder}; observed ${[...encoders].join(', ')}`);
  const metadata = await getVideoMetadata(outputLocation);
  assert.equal(metadata.codec, 'h264');
  assert.equal(metadata.width, 1280);
  assert.equal(metadata.height, 720);
  assert(Math.abs(metadata.fps - 30) < 0.01);
  assert(metadata.durationInSeconds !== null && Math.abs(metadata.durationInSeconds - 4) < 0.1);
  for (const frame of [0, 60, 119]) {
    await renderStill({ ...common, composition, frame, imageFormat: 'png', output: path.join(directory, `frame-${frame}.png`) });
  }
  assert(!readFileSync(path.join(directory, 'frame-0.png')).equals(readFileSync(path.join(directory, 'frame-119.png'))), 'Start/end frames must differ');
  Object.assign(report, { success: true, totalMs: Math.round(performance.now() - startedAt), encoders: [...encoders], metadata });
  writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
  console.log('POMCHAT_GPU_SMOKE_PASS', JSON.stringify(report, null, 2));
} catch (error) {
  writeFileSync(path.join(directory, 'report.json'), JSON.stringify({ ...report, success: false, encoders: [...encoders], error: String(error) }, null, 2));
  throw error;
} finally {
  if (browser) await browser.close({ silent: true });
  rmSync(path.join(directory, 'bundle'), { recursive: true, force: true });
}
