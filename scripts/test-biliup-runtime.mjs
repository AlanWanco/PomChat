// Synthetic main-process IPC, filesystem, credentials and PTY only; never uploads or reads user settings.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const temporary = mkdtempSync(path.join(tmpdir(), 'pomchat-biliup-runtime-'));
const previousFetch = globalThis.fetch;
const handlers = new Map();
const states = [];
let child;
let spawnCount = 0;
let failureMode = '';
let helpSupported = true;
const contents = { isDestroyed: () => false, send: (_channel, state) => states.push(structuredClone(state)) };
globalThis.__biliupRuntimeTest = {
  handlers,
  help: () => helpSupported ? '--user-cookie --title --tid --tag --copyright --limit --submit --cover' : '--user-cookie --title --tid --tag --copyright --limit --cover',
  spawn: () => {
    spawnCount += 1;
    if (failureMode === 'spawn') throw new Error('Synthetic PTY failure');
    const dataListeners = [];
    const exitListeners = [];
    child = {
      onData: (callback) => { dataListeners.push(callback); },
      onExit: (callback) => { exitListeners.push(callback); },
      data: (data) => { for (const listener of dataListeners) listener(data); },
      exit: (exitCode) => { for (const listener of exitListeners) listener({ exitCode }); },
      kill: () => child.exit(1),
    };
    return child;
  },
};
globalThis.fetch = async (url) => {
  assert.equal(String(url), 'https://api.bilibili.com/x/web-interface/nav', 'No real or unexpected requests');
  return { ok: true, status: 200, json: async () => ({ code: 0, data: { isLogin: true, uname: 'Synthetic account' } }) };
};

try {
  const outfile = path.join(temporary, 'biliup.mjs');
  await build({
    entryPoints: ['electron/biliup.ts'], outfile, bundle: true, platform: 'node', format: 'esm',
    plugins: [{
      name: 'synthetic-biliup-runtime',
      setup(builder) {
        builder.onResolve({ filter: /^(electron|node:module|node:child_process)$/ }, (args) => ({ path: args.path, namespace: 'synthetic' }));
        builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, (args) => ({
          contents: args.path === 'electron' ? `
            export const app = { isPackaged: true, on() {} };
            export const ipcMain = { handle(name, callback) { globalThis.__biliupRuntimeTest.handlers.set(name, callback); } };
            export const webContents = {};
            export const Notification = { isSupported: () => false };
          ` : args.path === 'node:module' ? `
            export const createRequire = () => () => ({ spawn: globalThis.__biliupRuntimeTest.spawn });
          ` : `
            import { promisify } from 'node:util';
            export const execFile = Object.assign(function () {}, {
              [promisify.custom]: async (_binary, args) => ({
                stdout: args.includes('--version') ? 'synthetic 1.0' : globalThis.__biliupRuntimeTest.help(), stderr: ''
              })
            });
          `,
          loader: 'js',
        }));
      },
    }],
  });
  const { registerBiliup } = await import(pathToFileURL(outfile).href);
  registerBiliup(() => contents);
  const invoke = (name, ...args) => handlers.get(`biliup-${name}`)({ sender: contents }, ...args);
  const directory = path.join(temporary, 'runtime');
  mkdirSync(directory);
  writeFileSync(path.join(directory, process.platform === 'win32' ? 'biliup.exe' : 'biliup'), 'synthetic');
  writeFileSync(path.join(directory, 'cookies.json'), JSON.stringify({ cookie_info: { cookies: [{ name: 'SESSDATA', value: 'synthetic-private-cookie' }] } }));
  const template = { id: 'synthetic', name: 'Synthetic', title: 'Synthetic', tag: 'synthetic', tid: 5, copyright: 1, limit: 3, desc: '', dynamic: '', cover: '', source: '', dtime: '', line: '', submit: 'app', noReprint: false, dolby: false, hires: false, chargingPay: false, upSelectionReply: false, interactive: 0, missionId: '', isOnlySelf: '', closeReply: false, closeDanmu: false };
  const request = (filePath, updates = {}) => ({ directory, template: { ...template, ...updates }, filePath, postUpload: { language: 'en' } });
  const missingPath = path.join(temporary, 'missing-video.mp4');
  const missing = await invoke('upload', request(missingPath));
  let state = (await invoke('state')).value;
  assert.equal(missing.error, 'file', 'A missing local video must report a file error');
  assert.equal(state.phase, 'failed');
  assert(state.logs.length > 0, 'Preparation failures must never leave the console blank');
  assert(state.errorDetail.includes('ENOENT') && state.errorDetail.includes('video'), 'Show the failing stage and filesystem reason');
  assert.equal(spawnCount, 0);
  const video = path.join(temporary, 'video.mp4');
  writeFileSync(video, Buffer.from('synthetic-video'));
  const cover = await invoke('upload', request(video, { cover: path.join(temporary, 'missing-cover.png') }));
  state = (await invoke('state')).value;
  assert.equal(cover.error, 'file');
  assert(state.errorDetail.includes('ENOENT') && state.errorDetail.includes('cover'), 'A missing cover must be identified separately');
  assert.equal(spawnCount, 0);

  assert.equal((await invoke('upload', request(video))).ok, true);
  child.data('ERROR: failed at 100%: connection reset synthetic-private-cookie');
  child.exit(1);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    state = (await invoke('state')).value;
    if (!state.busy) break;
  }
  assert.equal(state.phase, 'failed');
  assert(state.errorDetail.includes('connection reset'), 'Errors containing progress percentages and no final newline must survive');
  assert(!JSON.stringify(state).includes('synthetic-private-cookie'), 'Credential values must stay redacted');

  assert.equal((await invoke('upload', request(video))).ok, true);
  child.exit(0);
  await new Promise((resolve) => setImmediate(resolve));
  state = (await invoke('state')).value;
  assert.equal(state.phase, 'failed');
  assert(state.logs.length > 0 && state.errorDetail, 'An exit with no command output or BVID must explain the failure');
  assert.equal((await invoke('upload', request(video))).ok, true);
  child.data('Submitted BV1abC2deF34\n');
  child.exit(0);
  await new Promise((resolve) => setImmediate(resolve));
  state = (await invoke('state')).value;
  assert.equal(state.phase, 'success', 'Normal successful uploads must stay successful');
  assert.equal(state.errorDetail, undefined);
  assert.equal(state.bvid, 'BV1abC2deF34');

  helpSupported = false;
  assert.equal((await invoke('upload', request(video))).error, 'unsupported');
  state = (await invoke('state')).value;
  assert(state.errorDetail.includes('arguments'), 'Unsupported flags must identify the arguments stage');
  helpSupported = true;
  failureMode = 'spawn';
  assert.equal((await invoke('upload', request(video))).error, 'native');
  state = (await invoke('state')).value;
  assert(state.errorDetail.includes('Start biliup'), 'A PTY failure must identify the executable startup stage');
  failureMode = '';

  assert.equal((await invoke('upload', request(video))).ok, true);
  await invoke('cancel');
  await new Promise((resolve) => setImmediate(resolve));
  state = (await invoke('state')).value;
  assert.equal(state.phase, 'cancelled');
  assert.equal(state.errorDetail, undefined, 'A user cancellation must not produce an upload error');
  console.log('PASS biliup runtime: missing video/cover, preflight logs, partial terminal errors, redaction, empty output, unsupported arguments, PTY errors, cancellation and success');
} finally {
  globalThis.fetch = previousFetch;
  delete globalThis.__biliupRuntimeTest;
  rmSync(temporary, { recursive: true, force: true });
}
