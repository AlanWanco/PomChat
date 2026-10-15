// Synthetic desktop IPC and browser storage only. Never opens a real project, account or output file.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { openBrowser } from '@remotion/renderer';

const temporary = mkdtempSync(path.join(tmpdir(), 'pomchat-export-persistence-'));
let server;
let browser;
try {
  const outfile = path.join(temporary, 'fixture.js');
  await build({
    entryPoints: ['scripts/fixtures/export-persistence.tsx'], outfile, bundle: true, platform: 'browser',
    format: 'iife', globalName: 'ExportPersistence', jsx: 'automatic', loader: { '.svg': 'dataurl', '.png': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.DEV': 'true', '__APP_VERSION__': '"test"', '__APP_COMMIT__': '"test"' },
  });
  server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/fixture.js' ? 'text/javascript' : 'text/html');
    response.end(request.url === '/fixture.js' ? readFileSync(outfile) : '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/fixture.js"></script>');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await openBrowser('chrome', { chromiumOptions: { headless: true }, logLevel: 'error' });
  const errors = [];
  const page = await browser.newPage({
    context: { sourceMap: () => null, sourceMapUrl: () => null }, logLevel: 'error', indent: false, pageIndex: 0, onLog: () => {},
    onBrowserLog: (log) => { if (log.type === 'error') { errors.push(log.text); console.error(log.text); } },
  });
  page.on('pageerror', (error) => { errors.push(String(error)); console.error(String(error)); });
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  await page.goto({ url: `http://127.0.0.1:${server.address().port}`, timeout: 30_000 });
  const results = await page.evaluate(() => window.ExportPersistence.runExportPersistenceTests());
  assert.deepEqual(errors, [], 'No renderer errors during hydration/persistence');
  for (const result of results) console.log(`PASS ${result}`);
} finally {
  if (browser) await browser.close({ silent: true });
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(temporary, { recursive: true, force: true });
}
