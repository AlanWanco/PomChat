// node scripts/test-settings-panel.mjs
// Optional: POMCHAT_TEST_BROWSER=/path/to/chrome (always runs headlessly).
// Uses a fresh browser profile and synthetic props; never reads app config or credentials.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { openBrowser } from '@remotion/renderer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(path.join(tmpdir(), 'pomchat-settings-test-'));
let browser;
let server;
try {
  const outfile = path.join(temporary, 'test.js');
  await build({
    entryPoints: [path.join(root, 'scripts/fixtures/settings-panel.tsx')],
    outfile, bundle: true, platform: 'browser', format: 'iife', globalName: 'SettingsRegression',
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.DEV': 'true' },
  });
  server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/test.js' ? 'text/javascript' : 'text/html');
    response.end(request.url === '/test.js' ? readFileSync(outfile) : '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/test.js"></script>');
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
    onBrowserLog: (log) => { if (log.type === 'error') errors.push(log.text); },
  });
  page.on('error', (error) => errors.push(String(error)));
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.goto({ url: `http://127.0.0.1:${server.address().port}`, timeout: 30_000 });
  const results = await page.evaluate(async () => window.SettingsRegression.runSettingsPanelTests());
  assert.equal(results.length, 7);
  assert.deepEqual(errors, [], 'Browser must not report runtime or React errors');
  results.forEach((result) => console.log(`PASS ${result}`));
} finally {
  if (browser) await browser.close({ silent: true });
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(temporary, { recursive: true, force: true });
}
