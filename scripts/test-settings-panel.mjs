// node scripts/test-settings-panel.mjs
// Optional: POMCHAT_TEST_BROWSER=/path/to/chrome (always runs headlessly).
// Uses a fresh browser profile and synthetic props; never reads app config or credentials.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { openBrowser } from '@remotion/renderer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
assert.ok(appSource.includes('onClose={cancelProjectResourceCheck}'), 'Resource-check Escape must use the revision-invalidating cancel path');
assert.match(appSource, /const cancelProjectResourceCheck = useCallback\(\(\) => \{\s*projectResourceCheckRevisionRef\.current \+= 1;\s*setProjectResourceCheckDialog\(null\);\s*\}, \[\]\);/, 'Resource-check cancel must invalidate pending operations');
const temporary = mkdtempSync(path.join(tmpdir(), 'pomchat-settings-test-'));
const screenshots = process.argv[2];
let browser;
let server;
try {
  const outfile = path.join(temporary, 'test.js');
  await build({
    entryPoints: [path.join(root, 'scripts/fixtures/settings-panel.tsx')],
    outfile, bundle: true, platform: 'browser', format: 'iife', globalName: 'SettingsRegression',
    jsx: 'automatic', loader: { '.svg': 'dataurl', '.png': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.DEV': 'true', '__APP_VERSION__': '"test"', '__APP_COMMIT__': '"test"' },
  });
  const stylesheet = screenshots ? readFileSync(path.join(root, 'dist/assets', readdirSync(path.join(root, 'dist/assets')).find(file => file.endsWith('.css'))), 'utf8') : '';
  server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/test.js' ? 'text/javascript' : request.url === '/test.css' ? 'text/css' : 'text/html');
    response.end(request.url === '/test.js' ? readFileSync(outfile) : request.url === '/test.css' ? stylesheet : '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/test.js"></script>');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  browser = await openBrowser('chrome', {
    browserExecutable: process.env.POMCHAT_TEST_BROWSER || undefined,
    chromiumOptions: { headless: true }, logLevel: 'error',
  });
  const errors = [];
  const page = await browser.newPage({
    context: { sourceMap: () => null, sourceMapUrl: () => null },
    logLevel: 'error', indent: false, pageIndex: 0, onLog: () => {},
    onBrowserLog: (log) => { if (log.type === 'error') { errors.push(log.text); console.error(log.text); } },
  });
  page.on('error', (error) => errors.push(String(error)));
  page.on('pageerror', (error) => { errors.push(String(error)); console.error(String(error)); });
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.goto({ url: `http://127.0.0.1:${server.address().port}`, timeout: 30_000 });
  const results = await page.evaluate(async () => window.SettingsRegression.runSettingsPanelTests());
  assert.equal(results.length, 8);
  results.push(...await page.evaluate(async () => window.SettingsRegression.runUiInteractionTests()));
  results.push(...await page.evaluate(async () => window.SettingsRegression.runAppInteractionTests()));
  if (screenshots) {
    mkdirSync(screenshots, { recursive: true });
    await page.evaluate(async () => {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/test.css';
      await new Promise(resolve => { link.onload = resolve; document.head.append(link); });
    });
    for (const width of [390, 800]) for (const language of ['en', 'zh-CN']) for (const dark of [false, true]) {
      await page.setViewport({ width, height: width === 390 ? 844 : 600, deviceScaleFactor: 1 });
      const layout = await page.evaluate(async (language, dark) => window.SettingsRegression.renderWelcomePreview(language, dark), language, dark);
      assert.equal(layout.overflow, false, 'Welcome must not overflow horizontally');
      assert(layout.titleTop >= 0, 'Welcome heading must remain reachable');
      if (width === 390) assert(layout.cards.length === 2 && layout.cards[1].top >= layout.cards[0].bottom, 'Mobile welcome cards stack vertically');
      const { value } = await page._client().send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      writeFileSync(path.join(screenshots, `welcome-${width}-${language}-${dark ? 'dark' : 'light'}.png`), Buffer.from(value.data, 'base64'));
    }
    results.push('欢迎页：390px / 800px，中英文和明暗主题');
    await page.goto({ url: `http://127.0.0.1:${server.address().port}`, timeout: 30_000 });
    await page.evaluate(async () => {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/test.css';
      await new Promise(resolve => { link.onload = resolve; document.head.append(link); });
    });
    for (const width of [390, 1280]) for (const dark of [false, true]) for (const mode of ['draft', 'failure']) {
      await page.setViewport({ width, height: width === 390 ? 844 : 900, deviceScaleFactor: 1 });
      const layout = await page.evaluate((mode, dark) => window.SettingsRegression.renderBiliupFeedbackPreview(mode, 'zh-CN', dark), mode, dark);
      assert(!layout.overflow && layout.left >= 0 && layout.right <= width, 'Biliup feedback must fit the viewport');
      assert(layout.top >= 0 && layout.bottom <= (width === 390 ? 844 : 900), 'Biliup feedback must remain reachable');
      assert(layout.errorVisible, 'A failure must be visible without searching the console');
      const { value } = await page._client().send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      writeFileSync(path.join(screenshots, `biliup-${mode}-${width}-${dark ? 'dark' : 'light'}.png`), Buffer.from(value.data, 'base64'));
    }
    await page.evaluate(() => window.SettingsRegression.closeBiliupFeedbackPreview());
    results.push('biliup：关闭保存提示与失败信息，390px / 1280px、明暗主题');

    for (const dark of [false, true]) for (const language of ['en', 'zh-CN']) for (const panelWidth of [400, 320]) {
      await page.setViewport({ width: 900, height: 800, deviceScaleFactor: 1 });
      const probe = await page.evaluate((language, dark, panelWidth) => window.SettingsRegression.renderAssetInsertRowPreview(language, dark, panelWidth), language, dark, panelWidth);
      assert(probe.sameWidth, `Insert buttons must share one width at ${probe.panelWidth}px: ${probe.widths.join(' / ')}`);
      assert(probe.fits, `Insert buttons must not overflow at ${probe.panelWidth}px: ${probe.rowWidth}`);
      assert(probe.widths[0] * 3 <= probe.rowWidth, 'Three buttons plus the two gaps must fill the row');
      for (const label of probe.labels) {
        assert(label.lines === 1, `Insert labels must stay on one line and truncate instead (${label.text} at ${probe.panelWidth}px)`);
        assert(probe.panelWidth >= 400 || label.clipped, `A narrow panel must truncate the label (${label.text})`);
      }
      if (!dark) {
        const { value } = await page._client().send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        writeFileSync(path.join(screenshots, `asset-insert-row-${language}-${panelWidth}.png`), Buffer.from(value.data, 'base64'));
      }
    }
    await page.evaluate(() => window.SettingsRegression.closeAssetInsertRowPreview());
    results.push('素材：插入图片/文字/音频可视化三等分宽度，中英文及明暗主题');
  }
  assert.deepEqual(errors, [], 'Browser must not report runtime or React errors');
  results.forEach((result) => console.log(`PASS ${result}`));
} finally {
  if (browser) await browser.close({ silent: true });
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(temporary, { recursive: true, force: true });
}
