import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A self-contained page: no remote fonts, media endpoints, uploads or file reads at request time. */
export async function buildAudioVizDemo(outputDirectory = path.join(root, 'dist-test/audio-viz-demo')) {
  const result = await build({
    entryPoints: [path.join(root, 'scripts/demos/audio-viz/main.tsx')],
    bundle: true, write: false, outdir: outputDirectory, platform: 'browser', format: 'iife',
    jsx: 'automatic', minify: true, legalComments: 'none',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const js = result.outputFiles.find((file) => file.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
  const css = result.outputFiles.find((file) => file.path.endsWith('.css')).text;
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>PomChat AudioViz Demo</title><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
  await mkdir(outputDirectory, { recursive: true });
  const output = path.join(outputDirectory, 'index.html');
  await writeFile(output, html);
  return { output, html };
}

export async function serveAudioVizDemo(html, { host = '127.0.0.1', port = 5199 } = {}) {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return;
    }
    if (!['/', '/index.html'].includes(pathname)) { response.writeHead(404).end(); return; }
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    });
    response.end(request.method === 'HEAD' ? undefined : html);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { output, html } = await buildAudioVizDemo();
  console.log(`Demo: ${output}`);
  if (process.argv.includes('--serve')) {
    const value = (flag, fallback) => process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : fallback;
    const host = value('--host', '127.0.0.1');
    const port = Number(value('--port', '5199'));
    const server = await serveAudioVizDemo(html, { host, port });
    console.log(`Listening: http://${host}:${server.address().port}/`);
    console.log('Only the demo page is served. No authentication; do not expose it to the public Internet.');
    const stop = () => server.close(() => process.exit(0));
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  }
}
