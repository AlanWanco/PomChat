import { app, ipcMain, net, type WebContents } from 'electron';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { IPty } from 'node-pty';
import {
  idleBiliupState, normalizeBiliupPreferences, validateBiliupTemplate,
  type BiliupState, type BiliupCheck, type BiliupPreferences, type BiliupUploadRequest,
} from '../src/biliup';
import { buildBiliupUploadArgs, parseBiliupProgress, plainTerminalLine, redactBiliupLine } from './biliupProtocol';

const require = createRequire(import.meta.url);
const exec = promisify(execFile);
const settingsPath = path.join(os.homedir(), '.config', 'pomchat', 'biliup.json');
const allowedErrors = new Set(['directory', 'binary', 'cookie', 'network', 'busy', 'template', 'schedule', 'unsupported', 'native', 'login', 'captcha', 'upload', 'cancelled', 'timeout', 'file', 'input', 'settings']);
const safeError = (error: unknown, fallback: string) => error instanceof Error && allowedErrors.has(error.message) ? error.message : fallback;
const fail = (message: string): never => { throw new Error(message); };

interface Runtime { directory: string; binary: string; cookie: string; version: string; help: string }
interface Job {
  cancelled: boolean;
  pty?: IPty;
  temporary?: string;
  timer?: ReturnType<typeof setTimeout>;
  qrTimer?: ReturnType<typeof setInterval>;
  updateTimer?: ReturnType<typeof setTimeout>;
  forcedError?: string;
}

export function registerBiliup(getContents: () => WebContents | undefined) {
  let state: BiliupState = { ...idleBiliupState, logs: [] };
  let active: Job | null = null;
  let checking = false;
  let saving = false;

  const publish = () => {
    const contents = getContents();
    if (contents && !contents.isDestroyed()) contents.send('biliup-state', state);
  };
  const update = (patch: Partial<BiliupState>) => { state = { ...state, ...patch }; publish(); };
  const checkJob = (job: Job) => { if (job.cancelled || active !== job) fail('cancelled'); };

  async function runtime(directory: string): Promise<Runtime> {
    if (typeof directory !== 'string' || !directory.trim() || directory.includes('\0')) fail('directory');
    const expanded = directory.trim().replace(/^~(?=[/\\]|$)/, os.homedir());
    if (!path.isAbsolute(expanded)) fail('directory');
    let resolved: string;
    try { resolved = await fs.realpath(expanded); if (!(await fs.stat(resolved)).isDirectory()) fail('directory'); }
    catch { return fail('directory'); }
    const names = process.platform === 'win32' ? ['biliup.exe', 'biliuprs.exe'] : ['biliup', 'biliuprs'];
    let binary = '';
    for (const name of names) {
      const candidate = path.join(resolved, name);
      try { if ((await fs.stat(candidate)).isFile()) { binary = candidate; break; } } catch { /* Try the next supported name. */ }
    }
    if (!binary) fail('binary');
    let version = '';
    let help = '';
    try {
      const options = { cwd: resolved, timeout: 15000, maxBuffer: 512 * 1024, windowsHide: true };
      const versionResult = await exec(binary, ['--version'], options);
      version = plainTerminalLine(`${versionResult.stdout}\n${versionResult.stderr}`).trim().slice(0, 160);
      const globalHelpResult = await exec(binary, ['--help'], options);
      const globalHelp = `${globalHelpResult.stdout}\n${globalHelpResult.stderr}`;
      if (!globalHelp.includes('--user-cookie')) fail('unsupported');
      const uploadHelpResult = await exec(binary, ['upload', '--help'], options);
      help = `${uploadHelpResult.stdout}\n${uploadHelpResult.stderr}`;
    } catch (error) { return fail(safeError(error, 'binary')); }
    const cookie = path.join(resolved, 'cookies.json');
    return { directory: resolved, binary, cookie, version, help };
  }

  async function credentials(file: string): Promise<{ header: string; secrets: string[] }> {
    try {
      if ((await fs.stat(file)).size > 1024 * 1024) fail('cookie');
      const data = JSON.parse(await fs.readFile(file, 'utf8'));
      const cookies: { name: string; value: string }[] = data.cookie_info?.cookies;
      if (!Array.isArray(cookies) || !cookies.some((c) => c.name === 'SESSDATA' && c.value)) fail('cookie');
      const valid = cookies.filter((c) => typeof c.name === 'string' && /^[\w-]+$/.test(c.name) && typeof c.value === 'string' && !/[\r\n;]/.test(c.value));
      return { header: valid.map((c) => `${c.name}=${c.value}`).join('; '),
        secrets: [...valid.map((c) => c.value), data.token_info?.access_token, data.token_info?.refresh_token].filter((v): v is string => typeof v === 'string' && v.length > 0) };
    } catch { return fail('cookie'); }
  }

  async function verifyCookie(file: string) {
    const auth = await credentials(file);
    try {
      const response = await net.fetch('https://api.bilibili.com/x/web-interface/nav', {
        headers: { Cookie: auth.header, Referer: 'https://www.bilibili.com/', 'User-Agent': 'Mozilla/5.0' },
        redirect: 'error', signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) fail('network');
      const data = await response.json() as { code?: number; data?: { isLogin?: boolean } };
      if (data.code !== 0 || !data.data?.isLogin) fail('cookie');
    } catch (error) { fail(safeError(error, 'network')); }
    return auth;
  }

  async function check(directory: string): Promise<BiliupCheck> {
    if (active || checking) fail('busy');
    checking = true;
    try {
      const info = await runtime(directory);
      let cookieExists = false;
      try { cookieExists = (await fs.stat(info.cookie)).isFile(); } catch { /* Login can create the first cookie file. */ }
      try {
        await verifyCookie(info.cookie);
        return { binaryOk: true, cookieOk: true, cookieExists, version: info.version, cookieFile: path.basename(info.cookie) };
      } catch (error) {
        return { binaryOk: true, cookieOk: false, cookieExists, version: info.version, cookieFile: path.basename(info.cookie), error: safeError(error, 'cookie') };
      }
    } finally { checking = false; }
  }

  async function finish(job: Job, exitCode: number) {
    if (active !== job) return;
    clearTimeout(job.timer); clearTimeout(job.updateTimer); clearInterval(job.qrTimer);
    // Do not remove a staging file until the child has exited.
    if (job.temporary) await fs.rm(job.temporary, { recursive: true, force: true }).catch(() => {});
    if (active !== job) return;
    active = null;
    const error = job.forcedError || (!job.cancelled && exitCode !== 0 ? state.kind === 'login' ? 'login' : 'upload' : undefined);
    update({ busy: false, phase: error ? 'failed' : job.cancelled ? 'cancelled' : 'success', error,
      qrImage: null, progress: !error && !job.cancelled && state.kind === 'upload' ? 100 : state.progress });
  }

  function stop(error?: string) {
    const job = active;
    if (!job) return;
    job.cancelled = true;
    job.forcedError = error;
    if (job.pty) {
      try { job.pty.kill(); } catch { /* Exit may already be pending. */ }
    }
  }

  function begin(kind: 'login' | 'upload'): Job {
    if (active || checking) return fail('busy');
    const job: Job = { cancelled: false };
    active = job;
    state = { ...idleBiliupState, logs: [], kind, busy: true, phase: 'starting' };
    publish();
    job.timer = setTimeout(() => { if (active === job) stop('timeout'); }, kind === 'login' ? 5 * 60_000 : 24 * 3600_000);
    return job;
  }

  function spawnPty(job: Job, info: Runtime, args: string[]) {
    checkJob(job);
    try {
      const pty = require('node-pty') as typeof import('node-pty');
      // Preserve platform runtime paths without passing unrelated API keys to the child.
      const env: Record<string, string> = { TERM: 'xterm-256color', LANG: 'en_US.UTF-8', RUST_LOG: 'info' };
      for (const [key, value] of Object.entries(process.env)) {
        if (/^(path|home|userprofile|systemroot|windir|comspec|temp|tmp|tmpdir|appdata|localappdata|programdata|http_proxy|https_proxy|all_proxy|no_proxy)$/i.test(key) && value) env[key] = value;
      }
      job.pty = pty.spawn(info.binary, args, { cwd: info.directory, name: 'xterm-256color', cols: 160, rows: 40, env });
      job.pty.onExit(({ exitCode }) => { void finish(job, exitCode); });
      return job.pty;
    } catch { return fail('native'); }
  }

  async function login(directory: string, method: string) {
    if (!['qr', 'sms'].includes(method)) fail('input');
    const job = begin('login');
    try {
      const info = await runtime(directory);
      checkJob(job);
      // biliup overwrites its credential file; keep a private backup first.
      const backupPath = `${info.cookie}.backup-${Date.now()}`;
      try { await fs.copyFile(info.cookie, backupPath); await fs.chmod(backupPath, 0o600); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') fail('cookie'); }
      const startedAt = Date.now();
      const child = spawnPty(job, info, ['--user-cookie', info.cookie, 'login']);
      let buffer = '';
      let selected = false;
      let selecting = false;
      let qrRead = false;
      child.onData((chunk) => {
        if (active !== job || job.cancelled) return;
        // Login output is never sent to renderer logs: terminals echo phone/code values.
        buffer = (buffer + plainTerminalLine(chunk)).slice(-12000);
        if (!selected && !selecting && buffer.includes('选择一种登录方式') && buffer.includes('扫码登录')) {
          selecting = true;
          setTimeout(() => {
            if (active !== job || job.cancelled) return;
            const marker = buffer.match(/[>❯›]\s*(账号密码|短信登录|扫码登录)/);
            const current = marker ? ['账号密码', '短信登录', '扫码登录'].indexOf(marker[1]) : 1;
            const target = method === 'qr' ? 2 : 1;
            selected = true;
            buffer = '';
            child.write((target > current ? '\x1b[B' : '\x1b[A').repeat(Math.abs(target - current)) + '\r');
            if (method === 'qr') update({ phase: 'qr' });
          }, 150);
          return;
        }
        if (!selected) return;
        if (/challenge|validate|滑动验证|滑块|极验/i.test(buffer)) { stop('captcha'); return; }
        const phase = buffer.includes('请输入手机国家代码') ? 'country' : buffer.includes('请输入手机号') ? 'phone' : buffer.includes('请输入验证码') ? 'code' : null;
        if (phase) { buffer = ''; update({ phase }); }
      });
      job.qrTimer = setInterval(() => {
        if (method !== 'qr' || qrRead || active !== job || job.cancelled) return;
        void (async () => {
          const qrPath = path.join(info.directory, 'qrcode.png');
          const stat = await fs.stat(qrPath);
          if (stat.mtimeMs < startedAt - 100 || stat.size > 1024 * 1024) return;
          const image = await fs.readFile(qrPath);
          if (active !== job || job.cancelled) return;
          qrRead = true;
          update({ qrImage: `data:image/png;base64,${image.toString('base64')}`, phase: 'qr' });
        })().catch(() => {});
      }, 600);
    } catch (error) {
      job.forcedError = safeError(error, 'login');
      await finish(job, 1);
      throw new Error(job.forcedError);
    }
  }

  async function upload(request: BiliupUploadRequest) {
    if (!request || typeof request !== 'object' || typeof request.filePath !== 'string') fail('input');
    const job = begin('upload');
    try {
      const error = validateBiliupTemplate(request.template);
      if (error) fail(error);
      const info = await runtime(request.directory);
      checkJob(job);
      const auth = await verifyCookie(info.cookie);
      checkJob(job);
      if (!path.isAbsolute(request.filePath) || !/\.mp4$/i.test(request.filePath)) fail('file');
      const original = await fs.realpath(request.filePath);
      if (!(await fs.stat(original)).isFile() || (await fs.stat(original)).size === 0) fail('file');
      let file = original;
      if (Array.from(path.basename(original)).length > 80 || path.basename(original).length > 80) {
        job.temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'pomchat-biliup-'));
        file = path.join(job.temporary, 'pomchat-video.mp4');
        try { await fs.link(original, file); }
        catch { await fs.copyFile(original, file); }
      }
      checkJob(job);
      const template = { ...request.template };
      if (template.cover && !/^https?:\/\//i.test(template.cover)) {
        template.cover = path.resolve(info.directory, template.cover);
        if (!(await fs.stat(template.cover)).isFile()) fail('file');
      }
      const args = buildBiliupUploadArgs(template, file, info.cookie, info.help);
      const child = spawnPty(job, info, args);
      update({ phase: 'uploading', logs: [`biliup upload ${JSON.stringify(path.basename(original))}`] });
      let partial = '';
      child.onData((chunk) => {
        if (active !== job) return;
        partial += chunk;
        const lines = partial.split(/[\r\n]/);
        partial = lines.pop() || '';
        if (partial.length > 16000) { lines.push(partial); partial = ''; }
        for (const raw of lines) {
          const line = redactBiliupLine(raw, auth.secrets).trim();
          if (!line) continue;
          const progress = parseBiliupProgress(line);
          if (progress !== null) {
            state = { ...state, progress, progressText: line };
          } else {
            const bvid = line.match(/\bBV[0-9A-Za-z]{10}\b/)?.[0];
            state = { ...state, bvid: bvid || state.bvid, logs: [...state.logs, line].slice(-300) };
          }
        }
        if (!job.updateTimer) job.updateTimer = setTimeout(() => { job.updateTimer = undefined; if (active === job) publish(); }, 100);
      });
      child.onExit(() => {
        if (partial.trim()) state = { ...state, logs: [...state.logs, redactBiliupLine(partial, auth.secrets)].slice(-300) };
      });
    } catch (error) {
      job.forcedError = safeError(error, 'upload');
      await finish(job, 1);
      throw new Error(job.forcedError);
    }
  }

  const handle = (name: string, callback: (...args: never[]) => unknown, fallback: string) => {
    ipcMain.handle(`biliup-${name}`, async (event, ...args) => {
      if (event.sender !== getContents()) return { ok: false, error: 'input' };
      try { return { ok: true, value: await callback(...args as never[]) }; }
      catch (error) { return { ok: false, error: safeError(error, fallback) }; }
    });
  };
  handle('load', async () => {
    try { return normalizeBiliupPreferences(JSON.parse(await fs.readFile(settingsPath, 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return normalizeBiliupPreferences(null); throw error; }
  }, 'settings');
  handle('save', async (value: BiliupPreferences) => {
    if (active || saving) fail('busy');
    saving = true;
    try {
      const normalized = normalizeBiliupPreferences(value);
      if (normalized.templates.length !== (Array.isArray(value.templates) ? value.templates.length : 0) || normalized.accounts.length !== (Array.isArray(value.accounts) ? value.accounts.length : 0)) fail('template');
      await fs.mkdir(path.dirname(settingsPath), { recursive: true });
      try { await fs.copyFile(settingsPath, `${settingsPath}.backup`); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const temporary = `${settingsPath}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(normalized, null, 2), { mode: 0o600 });
      await fs.rename(temporary, settingsPath);
      return normalized;
    } finally { saving = false; }
  }, 'settings');
  handle('check', check, 'binary');
  handle('login', login, 'login');
  handle('upload', upload, 'upload');
  handle('input', (phase: string, value: string) => {
    if (!active?.pty || active.cancelled || state.kind !== 'login' || state.phase !== phase || typeof value !== 'string') fail('input');
    const pattern = phase === 'country' ? /^\d{1,4}$/ : phase === 'phone' ? /^\d{5,15}$/ : phase === 'code' ? /^\d{4,8}$/ : null;
    if (!pattern?.test(value)) fail('input');
    update({ phase: 'starting' });
    active!.pty!.write(`${value}\r`);
  }, 'input');
  handle('cancel', () => { stop(); }, 'cancelled');
  handle('state', () => state, 'input');
  app.on('before-quit', () => stop());
  app.on('browser-window-created', (_event, window) => {
    window.on('closed', () => stop());
  });
}
