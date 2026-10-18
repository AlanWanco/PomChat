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
let appendHelpSupported = true;
let binaryVersion = '1.2.9';
let seasonAddFails = false;
const execCalls = [];
const spawnCalls = [];
const contents = { isDestroyed: () => false, send: (_channel, state) => states.push(structuredClone(state)) };
globalThis.__biliupRuntimeTest = {
  handlers,
  execCalls,
  spawnCalls,
  shouldFailSeasonAdd: () => seasonAddFails,
  version: () => binaryVersion,
  help: () => helpSupported ? '--user-cookie --title --tid --tag --copyright --limit --submit --cover' : '--user-cookie --title --tid --tag --copyright --limit --cover',
  appendHelp: () => appendHelpSupported ? '--vid --line --limit --submit' : '--vid --line --limit',
  spawn: (_binary, args) => {
    spawnCount += 1;
    spawnCalls.push(args);
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
const fetchRequests = [];
globalThis.fetch = async (url) => {
  const parsed = new URL(String(url));
  fetchRequests.push(parsed);
  if (parsed.href === 'https://api.bilibili.com/x/web-interface/nav') {
    return { ok: true, status: 200, json: async () => ({ code: 0, data: { isLogin: true, uname: 'Synthetic account' } }) };
  }
  if (parsed.origin === 'https://api.bilibili.com' && parsed.pathname === '/x/web-interface/view' && parsed.searchParams.get('bvid') === 'BV1abC2deF34') {
    return { ok: true, status: 200, json: async () => ({ code: 0, data: { aid: 40, bvid: 'BV1abC2deF34', title: 'Synthetic video', pages: [{ cid: 50, page: 1, part: 'Part one', duration: 90 }, { cid: 51, page: 2, part: 'Part two', duration: 30 }] } }) };
  }
  throw new Error(`Unexpected synthetic request: ${parsed.href}`);
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
              [promisify.custom]: async (_binary, args) => {
                globalThis.__biliupRuntimeTest.execCalls.push(args);
                if (args.includes('--version')) return { stdout: 'biliup ' + globalThis.__biliupRuntimeTest.version(), stderr: '' };
                if (args[0] === 'append' && args.includes('--help')) return { stdout: globalThis.__biliupRuntimeTest.appendHelp(), stderr: '' };
                if (args.includes('season')) {
                  if (globalThis.__biliupRuntimeTest.shouldFailSeasonAdd() && args.includes('add')) throw new Error('Synthetic season-add failure');
                  const action = args[args.indexOf('season') + 1];
                  const json = action === 'list'
                    ? JSON.stringify([{ season: { id: 10, title: 'Synthetic collection' }, sections: { sections: [{ id: 20, title: 'Main' }] } }])
                    : JSON.stringify({ season: { id: 10, title: 'Synthetic collection' }, sections: [{ section: { id: 20, title: 'Main' }, episodes: [{ id: 30, aid: 40, cid: 50, title: 'Episode' }] }] });
                  return { stdout: String.fromCharCode(27) + '[2m2026-10-18 INFO biliup_cli::uploader: user: Synthetic account' + String.fromCharCode(27) + '[0m' + String.fromCharCode(10) + json, stderr: '' };
                }
                return { stdout: globalThis.__biliupRuntimeTest.help(), stderr: '' };
              }
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
  assert.deepEqual((await invoke('inspect', directory)).value, { version: 'biliup 1.2.9', seasonsSupported: true });
  assert.deepEqual((await invoke('video-parts', 'BV1abC2deF34')).value, { aid: 40, bvid: 'BV1abC2deF34', title: 'Synthetic video', pages: [{ cid: 50, page: 1, part: 'Part one', duration: 90 }, { cid: 51, page: 2, part: 'Part two', duration: 30 }] });
  assert.equal(fetchRequests.at(-1).searchParams.get('bvid'), 'BV1abC2deF34', 'Video ID must be encoded as one query value');
  assert.equal((await invoke('video-parts', 'malicious-id')).error, 'input');
  const seasonResult = await invoke('seasons', directory); assert.deepEqual(seasonResult.value, [{ id: 10, title: 'Synthetic collection', sections: [{ id: 20, title: 'Main' }] }], `season list: ${JSON.stringify(seasonResult)} calls=${JSON.stringify(execCalls)}`);
  assert.deepEqual((await invoke('season-contents', directory, 10)).value, { id: 10, title: 'Synthetic collection', sections: [{ id: 20, title: 'Main', episodes: [{ id: 30, aid: 40, cid: 50, title: 'Episode' }] }] });
  binaryVersion = '1.2.8';
  assert.equal((await invoke('inspect', directory)).value.seasonsSupported, false, 'Collections must be disabled below 1.2.9');
  assert.equal((await invoke('seasons', directory)).error, 'unsupported', 'Old binaries must not receive season commands');
  binaryVersion = '1.2.9';
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

  const secondVideo = path.join(temporary, 'second-video.mp4');
  writeFileSync(secondVideo, Buffer.from('synthetic-video-two'));
  assert.equal((await invoke('upload', { ...request(video), seasonSectionId: '20', filePaths: [video, secondVideo] })).ok, true);
  child.data('Submitted BV1abC2deF34\n');
  child.exit(0);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    state = (await invoke('state')).value;
    if (!state.busy) break;
  }
  assert.equal(state.phase, 'success', 'Multi-file P upload followed by collection assignment should succeed');
  assert.deepEqual(spawnCalls.at(-1).slice(-2).map((item) => path.basename(item)), ['video.mp4', 'second-video.mp4'], 'Multi-file upload must pass each path as a positional P in order');
  assert(execCalls.some((args) => args.includes('season') && args.includes('add') && args.includes('20') && args.includes('--vid') && args.includes('BV1abC2deF34')), 'Successful new submission should add its BVID to the selected season section');
  const commandsBeforeAppend = execCalls.length;
  assert.equal((await invoke('upload', { ...request(video), mode: 'append', targetVideoId: 'BV1abC2deF34' })).ok, true);
  assert.equal(spawnCalls.at(-1)[2], 'append', 'Append mode must use biliup append instead of upload');
  assert(spawnCalls.at(-1).includes('--vid') && spawnCalls.at(-1).includes('BV1abC2deF34'));
  child.exit(0);
  for (let attempt = 0; attempt < 40; attempt += 1) { await new Promise((resolve) => setImmediate(resolve)); state = (await invoke('state')).value; if (!state.busy) break; }
  assert.equal(state.phase, 'success', 'Append success does not require the CLI to print a new BVID');
  assert.equal(state.bvid, 'BV1abC2deF34', 'Append completion retains the target submission ID');
  assert(state.logs.some((line) => line.includes('BV1abC2deF34') && line.includes('appended')), 'Append completion explains that new parts were added');
  assert(!execCalls.slice(commandsBeforeAppend).some((args) => args.includes('season') && args.includes('add')), 'Append mode does not add a collection');
  const appendArgs = spawnCalls.at(-1);
  assert(appendArgs.includes('append') && !appendArgs.includes('--title') && !appendArgs.includes('--tid'), 'Append mode needs only its target and upload options, not new-submission metadata');
  const spawnCountBeforeInvalidTarget = spawnCount;
  assert.equal((await invoke('upload', { ...request(video), mode: 'append', targetVideoId: 'invalid' })).error, 'input');
  assert.equal(spawnCount, spawnCountBeforeInvalidTarget, 'Invalid append targets must be rejected before spawning biliup');
  appendHelpSupported = false;
  assert.equal((await invoke('upload', { ...request(video), mode: 'append', targetVideoId: 'BV1abC2deF34' })).error, 'unsupported', 'Append flags are checked against append --help');
  appendHelpSupported = true;
  binaryVersion = '1.2.8';
  const unsupportedSeason = await invoke('upload', { ...request(video), seasonSectionId: '20' });
  assert.equal(unsupportedSeason.error, 'unsupported', 'The main process must reject collection assignment for old binaries');
  assert.equal(spawnCount, 5, 'An unsupported collection version must not start an upload');
  binaryVersion = '1.2.9';
  seasonAddFails = true;
  assert.equal((await invoke('upload', { ...request(video), seasonSectionId: '20' })).ok, true);
  child.data('Submitted BV1abC2deF34\n'); child.exit(0);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    state = (await invoke('state')).value;
    if (!state.busy) break;
  }
  assert.equal(state.phase, 'success', 'A post-upload collection failure must not misreport the video upload as failed');
  assert(state.logs.some((line) => line.includes('adding it to the collection failed')), 'A failed collection assignment must be explicit in the upload log');
  seasonAddFails = false;

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
  assert(execCalls.some((args) => args.includes('season') && args.includes('list') && args.includes('--json')), 'Collection browsing must use the documented biliup season JSON command');
  console.log('PASS biliup runtime: version gate, public video P lookup, season JSON browsing, missing video/cover, preflight logs, partial terminal errors, redaction, empty output, unsupported arguments, PTY errors, cancellation and success');
} finally {
  globalThis.fetch = previousFetch;
  delete globalThis.__biliupRuntimeTest;
  rmSync(temporary, { recursive: true, force: true });
}
