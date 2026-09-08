import { app, ipcMain, webContents, type WebContents } from 'electron';
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
const debugBiliup = (...args: unknown[]) => { if (!app.isPackaged) console.info('[biliup]', ...args); };
const captchaBridgeScript = String.raw`(() => {
  if (window.__pomchatCaptchaBridgeInstalled) return;
  window.__pomchatCaptchaBridgeInstalled = true;
  const report = (url, body) => {
    if (!url || !/(?:^|\/)(?:get|ajax)\.php(?:[?#]|$)/i.test(String(url))) return;
    let text = '';
    if (typeof body === 'string') text = body;
    else if (body != null) { try { text = JSON.stringify(body); } catch {} }
    if (typeof window.__pomchatCaptcha === 'function') window.__pomchatCaptcha(JSON.stringify({ url: String(url), body: text }));
  };
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__pomchatCaptchaUrl = String(url);
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body) {
    this.addEventListener('load', () => report(this.__pomchatCaptchaUrl, this.responseText));
    return originalSend.apply(this, arguments);
  };
  const originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = function(input, init) {
      const url = typeof input === 'string' ? input : input && input.url;
      return originalFetch.call(this, input, init).then((response) => {
        response.clone().text().then((body) => report(url, body)).catch(() => {});
        return response;
      });
    };
  }
})();`;

function isBiliupCaptchaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'bilibili.com' || url.hostname.endsWith('.bilibili.com')) && url.pathname === '/h5/project-msg-auth/verify';
  } catch {
    return false;
  }
}

function getCaptchaEndpoint(value: string): 'get' | 'ajax' | null {
  try {
    const name = path.basename(new URL(value).pathname).toLowerCase();
    return name === 'get.php' ? 'get' : name === 'ajax.php' ? 'ajax' : null;
  } catch {
    return null;
  }
}

function extractCaptchaFields(payload: string): { challenge?: string; validate?: string } {
  const fields: { challenge?: string; validate?: string } = {};
  const assign = (key: 'challenge' | 'validate', value: unknown) => {
    if (typeof value === 'string' && value.trim() && value.length <= 2048 && !/[\r\n\0]/.test(value)) fields[key] = value;
  };
  const visit = (value: unknown, depth = 0) => {
    if (depth > 4 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      if (key === 'challenge' || key === 'geetest_challenge') assign('challenge', item);
      if (key === 'validate' || key === 'geetest_validate') assign('validate', item);
      visit(item, depth + 1);
    }
  };
  try { visit(JSON.parse(payload) as unknown); } catch { /* Try URL-encoded and loose JSON formats below. */ }
  try {
    const query = payload.startsWith('http://') || payload.startsWith('https://') ? new URL(payload).search : payload;
    const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
    assign('challenge', params.get('challenge') || params.get('geetest_challenge'));
    assign('validate', params.get('validate') || params.get('geetest_validate'));
  } catch { /* Not a URL-encoded payload. */ }
  for (const key of ['challenge', 'validate'] as const) {
    if (fields[key]) continue;
    const match = payload.match(new RegExp(`["'](?:geetest_)?${key}["']\\s*[:=]\\s*["']([^"']+)["']`, 'i'));
    if (match) assign(key, match[1]);
  }
  return fields;
}

interface Runtime { directory: string; binary: string; cookie: string; version: string; help: string }
interface Job {
  cancelled: boolean;
  pty?: IPty;
  temporary?: string;
  cookiePath?: string;
  cookieBackup?: string;
  timer?: ReturnType<typeof setTimeout>;
  qrTimer?: ReturnType<typeof setInterval>;
  selectTimer?: ReturnType<typeof setTimeout>;
  updateTimer?: ReturnType<typeof setTimeout>;
  captcha?: {
    challengeSent: boolean;
    validateSent: boolean;
    attachView?: (webContentsId: number) => Promise<void>;
    detachView?: () => void;
  };
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
      const stat = await fs.stat(file);
      if (stat.size > 1024 * 1024) fail('cookie');
      const data = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
      const cookieInfo = data.cookie_info && typeof data.cookie_info === 'object' ? data.cookie_info as Record<string, unknown> : {};
      const rawCookies = cookieInfo.cookies;
      const cookies = Array.isArray(rawCookies) ? rawCookies as { name: string; value: string }[] : undefined;
      const safeCookies = Array.isArray(rawCookies) ? rawCookies.filter((cookie): cookie is Record<string, unknown> => Boolean(cookie) && typeof cookie === 'object') : [];
      const tokenInfo = data.token_info && typeof data.token_info === 'object' ? data.token_info as Record<string, unknown> : {};
      debugBiliup('cookie file inspected', {
        file,
        size: stat.size,
        topLevelKeys: Object.keys(data).sort(),
        platform: typeof data.platform === 'string' ? data.platform : undefined,
        cookieCount: safeCookies.length,
        cookieNames: safeCookies.map((cookie) => typeof cookie.name === 'string' ? cookie.name : '<invalid>'),
        cookieValueLengths: safeCookies.map((cookie) => ({ name: typeof cookie.name === 'string' ? cookie.name : '<invalid>', length: typeof cookie.value === 'string' ? cookie.value.length : 0 })),
        tokenInfoKeys: Object.keys(tokenInfo).sort(),
        hasAccessToken: typeof tokenInfo.access_token === 'string' && tokenInfo.access_token.length > 0,
        hasRefreshToken: typeof tokenInfo.refresh_token === 'string' && tokenInfo.refresh_token.length > 0,
      });
      const cookieList = cookies ?? fail('cookie');
      if (!cookieList.some((c) => c.name === 'SESSDATA' && c.value)) fail('cookie');
      const valid = cookieList.filter((c) => typeof c.name === 'string' && /^[\w-]+$/.test(c.name) && typeof c.value === 'string' && !/[\r\n;]/.test(c.value));
      debugBiliup('cookie header prepared', { cookieCount: valid.length, cookieNames: valid.map((cookie) => cookie.name), hasSessdata: valid.some((cookie) => cookie.name === 'SESSDATA') });
      return { header: valid.map((c) => `${c.name}=${c.value}`).join('; '),
        secrets: [...valid.map((c) => c.value), tokenInfo.access_token, tokenInfo.refresh_token].filter((v): v is string => typeof v === 'string' && v.length > 0) };
    } catch (error) {
      debugBiliup('cookie file read failed', { file, reason: safeError(error, 'cookie') });
      return fail('cookie');
    }
  }

  async function verifyCookie(file: string) {
    const auth = await credentials(file);
    try {
      const response = await fetch('https://api.bilibili.com/x/web-interface/nav', {
        headers: { Cookie: auth.header, Referer: 'https://www.bilibili.com/', 'User-Agent': 'Mozilla/5.0' },
        redirect: 'error', signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        debugBiliup('cookie verification HTTP failure', { file, status: response.status });
        fail('network');
      }
      const data = await response.json() as { code?: number; data?: { isLogin?: boolean; uname?: string } };
      const profile = data.data;
      debugBiliup('cookie verification response', { file, status: response.status, code: data.code, hasData: Boolean(profile), isLogin: profile?.isLogin === true, hasUsername: typeof profile?.uname === 'string' && profile.uname.length > 0 });
      if (!profile || data.code !== 0 || !profile.isLogin) return fail('cookie');
      const username = typeof profile.uname === 'string' ? profile.uname.replace(/[\r\n]/g, '').trim().slice(0, 120) : '';
      return { ...auth, username };
    } catch (error) {
      debugBiliup('cookie verification failed', { file, reason: safeError(error, 'network') });
      return fail(safeError(error, 'network'));
    }
  }

  async function renewCookie(info: Runtime) {
    debugBiliup('cookie renew start', { binary: info.binary, file: info.cookie });
    try {
      await exec(info.binary, ['--user-cookie', info.cookie, 'renew'], {
        cwd: info.directory, timeout: 15000, maxBuffer: 512 * 1024, windowsHide: true,
      });
      debugBiliup('cookie renewed', { file: info.cookie });
    } catch (error) {
      debugBiliup('cookie renew skipped', { file: info.cookie, reason: safeError(error, 'cookie') });
    }
  }

  async function verifyCookieWithRenew(info: Runtime) {
    try {
      return await verifyCookie(info.cookie);
    } catch (error) {
      const reason = safeError(error, 'cookie');
      if (reason !== 'cookie') throw error;
      debugBiliup('cookie verification needs renewal', { file: info.cookie, reason });
      await renewCookie(info);
      return verifyCookie(info.cookie);
    }
  }

  async function check(directory: string): Promise<BiliupCheck> {
    if (active || checking) fail('busy');
    checking = true;
    try {
      const info = await runtime(directory);
      let cookieExists = false;
      try { cookieExists = (await fs.stat(info.cookie)).isFile(); } catch { /* Login can create the first cookie file. */ }
      try {
        const auth = await verifyCookieWithRenew(info);
        return { binaryOk: true, cookieOk: true, cookieExists, version: info.version, cookieFile: path.basename(info.cookie), username: auth.username || undefined };
      } catch (error) {
        return { binaryOk: true, cookieOk: false, cookieExists, version: info.version, cookieFile: path.basename(info.cookie), error: safeError(error, 'cookie') };
      }
    } finally { checking = false; }
  }

  async function finish(job: Job, exitCode: number) {
    if (active !== job) return;
    clearTimeout(job.timer); clearTimeout(job.selectTimer); clearTimeout(job.updateTimer); clearInterval(job.qrTimer);
    job.captcha?.detachView?.();
    if (job.cookiePath) {
      const loginSucceeded = state.kind === 'login' && !job.cancelled && !job.forcedError && exitCode === 0;
      if (loginSucceeded) {
        if (job.cookieBackup) await fs.rm(job.cookieBackup, { force: true }).catch(() => {});
      } else {
        if (job.cookieBackup) {
          try {
            await fs.copyFile(job.cookieBackup, job.cookiePath);
            await fs.chmod(job.cookiePath, 0o600);
            await fs.rm(job.cookieBackup, { force: true });
          } catch { /* Keep the backup if restoration fails. */ }
        } else {
          await fs.rm(job.cookiePath, { force: true }).catch(() => {});
        }
      }
    }
    // Do not remove a staging file until the child has exited.
    if (job.temporary) await fs.rm(job.temporary, { recursive: true, force: true }).catch(() => {});
    if (active !== job) return;
    active = null;
    const error = job.forcedError || (!job.cancelled && exitCode !== 0 ? state.kind === 'login' ? 'login' : 'upload' : undefined);
    update({ busy: false, phase: error ? 'failed' : job.cancelled ? 'cancelled' : 'success', error,
      qrImage: null, captchaUrl: null, captchaStatus: '', progress: !error && !job.cancelled && state.kind === 'upload' ? 100 : state.progress });
  }

  function stop(error?: string) {
    const job = active;
    if (!job) return;
    job.cancelled = true;
    job.forcedError = error;
    job.captcha?.detachView?.();
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
      job.cookiePath = info.cookie;
      try {
        await fs.copyFile(info.cookie, backupPath);
        await fs.chmod(backupPath, 0o600);
        job.cookieBackup = backupPath;
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') fail('cookie'); }
      const qrPath = path.join(info.directory, 'qrcode.png');
      if (method === 'qr') await fs.rm(qrPath, { force: true }).catch(() => {});
      const startedAt = Date.now();
      const child = spawnPty(job, info, ['--user-cookie', info.cookie, 'login']);
      let buffer = '';
      let selected = false;
      let selecting = false;
      let qrFileKey = '';
      let qrCandidate: { mtimeMs: number; size: number } | null = null;
      let captchaPrompt: 'challenge' | 'validate' | null = null;
      const captchaValues: { challenge?: string; validate?: string } = {};
      job.captcha = { challengeSent: false, validateSent: false };
      const maybeSubmitCaptcha = () => {
        if (active !== job || job.cancelled || !job.captcha) return;
        const prompt = captchaPrompt
          || (state.phase === 'captchaChallenge' ? 'challenge' : state.phase === 'captchaValidate' ? 'validate' : null);
        if (prompt === 'challenge' && captchaValues.challenge && captchaValues.validate && !job.captcha.challengeSent) {
          job.captcha.challengeSent = true;
          child.write(`${captchaValues.challenge}\r`);
          debugBiliup('challenge submitted', { length: captchaValues.challenge.length });
          update({ phase: 'starting', captchaStatus: 'challengeSubmitted' });
        } else if (prompt === 'validate' && captchaValues.validate && !job.captcha.validateSent) {
          job.captcha.validateSent = true;
          child.write(`${captchaValues.validate}\r`);
          debugBiliup('validate submitted', { length: captchaValues.validate.length });
          update({ phase: 'starting', captchaStatus: 'validateSubmitted' });
        }
      };
      const acceptCaptchaPayload = (payload: string, endpoint: 'get' | 'ajax' | null = null) => {
        const fields = extractCaptchaFields(payload);
        const challenge = endpoint === 'ajax' ? undefined : fields.challenge;
        const validate = endpoint === 'get' ? undefined : fields.validate;
        const capturedChallenge = Boolean(challenge && challenge !== captchaValues.challenge);
        const capturedValidate = Boolean(validate && validate !== captchaValues.validate);
        if (challenge && !job.captcha?.challengeSent) captchaValues.challenge = challenge;
        if (validate && !job.captcha?.validateSent) captchaValues.validate = validate;
        if (capturedChallenge) debugBiliup('challenge captured', { length: challenge?.length || 0, phase: state.phase, prompt: captchaPrompt });
        if (capturedValidate) debugBiliup('validate captured', { length: validate?.length || 0, phase: state.phase, prompt: captchaPrompt });
        if (capturedChallenge || capturedValidate) update({ captchaStatus: capturedValidate ? 'validateCaptured' : 'challengeCaptured' });
        maybeSubmitCaptcha();
      };
      const attachCaptchaView = async (guestWebContentsId: number) => {
        if (!Number.isInteger(guestWebContentsId) || active !== job || job.cancelled || !job.captcha) return fail('input');
        const guest = webContents.fromId(guestWebContentsId);
        if (!guest) return fail('input');
        debugBiliup('captcha webview found', { webContentsId: guestWebContentsId });
        job.captcha.detachView?.();
        const debuggerApi = guest.debugger;
        const requestEndpoints = new Map<string, 'get' | 'ajax'>();
        const messageHandler = (_event: unknown, method: string, params: unknown) => {
          const data = params && typeof params === 'object' ? params as Record<string, unknown> : {};
          if (method === 'Runtime.bindingCalled' && data.name === '__pomchatCaptcha' && typeof data.payload === 'string') {
            try {
              const message = JSON.parse(data.payload) as { body?: string; url?: string };
              if (typeof message.body === 'string') acceptCaptchaPayload(message.body, getCaptchaEndpoint(message.url || ''));
            } catch { /* Ignore malformed page messages. */ }
            return;
          }
          if (method === 'Network.requestWillBeSent') {
            const request = data.request && typeof data.request === 'object' ? data.request as Record<string, unknown> : {};
            const requestUrl = typeof request.url === 'string' ? request.url : '';
            const endpoint = getCaptchaEndpoint(requestUrl);
            if (endpoint) {
              debugBiliup('captcha endpoint request', { path: (() => { try { return new URL(requestUrl).pathname; } catch { return 'unknown'; } })() });
              const requestId = typeof data.requestId === 'string' ? data.requestId : '';
              if (requestId) requestEndpoints.set(requestId, endpoint);
            }
            return;
          }
          if (method === 'Network.responseReceived') {
            const response = data.response && typeof data.response === 'object' ? data.response as Record<string, unknown> : {};
            const responseUrl = typeof response.url === 'string' ? response.url : '';
            const requestId = typeof data.requestId === 'string' ? data.requestId : '';
            const endpoint = getCaptchaEndpoint(responseUrl);
            if (requestId && endpoint) requestEndpoints.set(requestId, endpoint);
            return;
          }
          if (method !== 'Network.loadingFinished') return;
          const requestId = typeof data.requestId === 'string' ? data.requestId : '';
          if (!requestId || !requestEndpoints.has(requestId)) return;
          void debuggerApi.sendCommand('Network.getResponseBody', { requestId }).then((body) => {
            const result = body as { body?: string; base64Encoded?: boolean };
            if (!result.body) return;
            const content = result.base64Encoded ? Buffer.from(result.body, 'base64').toString('utf8') : result.body;
            acceptCaptchaPayload(content, requestEndpoints.get(requestId) || null);
          }).catch(() => {});
        };
        const detachView = () => {
          debuggerApi.removeListener('message', messageHandler);
          try { if (debuggerApi.isAttached()) debuggerApi.detach(); } catch { /* The webview may already be gone. */ }
          if (job.captcha?.detachView === detachView) job.captcha.detachView = undefined;
        };
        debuggerApi.on('message', messageHandler);
        job.captcha.detachView = detachView;
        try {
          if (!debuggerApi.isAttached()) debuggerApi.attach('1.3');
          await debuggerApi.sendCommand('Network.enable');
          await debuggerApi.sendCommand('Runtime.enable');
          await debuggerApi.sendCommand('Page.enable');
          await debuggerApi.sendCommand('Runtime.addBinding', { name: '__pomchatCaptcha' });
          await debuggerApi.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: captchaBridgeScript });
          await debuggerApi.sendCommand('Runtime.evaluate', { expression: captchaBridgeScript });
          debugBiliup('captcha network capture attached');
          update({ captchaStatus: 'viewAttached' });
        } catch (error) {
          debugBiliup('captcha network capture failed', error instanceof Error ? error.message : 'unknown');
          detachView();
          update({ captchaStatus: 'attachFailed' });
          return fail('captcha');
        }
      };
      job.captcha.attachView = attachCaptchaView;
      const chooseLoginMethod = () => {
        if (active !== job || job.cancelled || selected || selecting) return;
        selecting = true;
        if (job.selectTimer) clearTimeout(job.selectTimer);
        setTimeout(() => {
          if (active !== job || job.cancelled) return;
          const marker = buffer.match(/(?:^|[\r\n])[ \t]*[>❯›][ \t]*(账号密码|短信登录|扫码登录)[ \t]*(?:[\r\n]|$)/);
          // dialoguer defaults to SMS (index 1); use the marker when this PTY
          // exposes it, otherwise retain that documented default.
          const current = marker ? ['账号密码', '短信登录', '扫码登录'].indexOf(marker[1]) : 1;
          const target = method === 'qr' ? 2 : 1;
          selected = true;
          buffer = '';
          child.write((target > current ? '\x1b[B' : '\x1b[A').repeat(Math.abs(target - current)) + '\r');
          if (method === 'qr') update({ phase: 'qr' });
        }, 150);
      };
      job.selectTimer = setTimeout(chooseLoginMethod, 1800);
      child.onData((chunk) => {
        if (active !== job || job.cancelled) return;
        // Login output is never sent to renderer logs: terminals echo phone/code values.
        buffer = (buffer + plainTerminalLine(chunk)).slice(-12000);
        const loginMenuDetected = buffer.includes('选择一种登录方式') || ['账号密码', '短信登录', '扫码登录'].every((label) => buffer.includes(label));
        if (!selected && !selecting && loginMenuDetected) {
          chooseLoginMethod();
          return;
        }
        if (!selected) return;
        const rawCaptchaUrl = buffer.match(/https:\/\/www\.bilibili\.com\/h5\/project-msg-auth\/verify\?[^\s\r\n]+/i)?.[0] || '';
        const captchaUrl = isBiliupCaptchaUrl(rawCaptchaUrl) ? rawCaptchaUrl : '';
        const promptBuffer = buffer.replace(/\s+/g, '');
        const phase = promptBuffer.includes('请输入验证码')
          ? 'code'
          : promptBuffer.includes('请输入ajax.php响应中的validate值')
            ? 'captchaValidate'
            : promptBuffer.includes('请输入get.php响应中的challenge值')
              ? 'captchaChallenge'
              : promptBuffer.includes('请输入手机号')
                ? 'phone'
                : promptBuffer.includes('请输入手机国家代码')
                  ? 'country'
                  : promptBuffer.includes('需要滑动验证码') || promptBuffer.includes('滑动验证码') || promptBuffer.includes('滑块') || promptBuffer.includes('极验')
                    ? 'captcha'
                    : null;
        if (phase === 'captchaChallenge') captchaPrompt = 'challenge';
        if (phase === 'captchaValidate') captchaPrompt = 'validate';
        if (phase) debugBiliup('login prompt', phase);
        if (phase || captchaUrl) {
          const captchaComplete = phase === 'code' && Boolean(job.captcha?.validateSent);
          if (captchaComplete) job.captcha?.detachView?.();
          buffer = '';
          update({
            phase: phase || (captchaUrl ? 'captchaChallenge' : state.phase),
            ...(captchaUrl ? { captchaUrl } : {}),
            ...(captchaComplete ? { captchaUrl: null } : {}),
          });
          maybeSubmitCaptcha();
        }
      });
      job.qrTimer = setInterval(() => {
        if (method !== 'qr' || active !== job || job.cancelled) return;
        void (async () => {
          const stat = await fs.stat(qrPath);
          // Some filesystems expose second-level mtimes; allow a small clock
          // granularity window because the stale file was removed before spawn.
          if (stat.mtimeMs < startedAt - 2000 || stat.size <= 0 || stat.size > 1024 * 1024) return;
          if (!qrCandidate || qrCandidate.mtimeMs !== stat.mtimeMs || qrCandidate.size !== stat.size) {
            qrCandidate = { mtimeMs: stat.mtimeMs, size: stat.size };
            return;
          }
          const fileKey = `${stat.mtimeMs}:${stat.size}`;
          if (fileKey === qrFileKey) return;
          const image = await fs.readFile(qrPath);
          if (active !== job || job.cancelled || image.length < 8 || !image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return;
          qrFileKey = fileKey;
          update({ qrImage: `data:image/png;base64,${image.toString('base64')}`, phase: 'qr' });
        })().catch(() => {});
      }, 300);
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
      const auth = await verifyCookieWithRenew(info);
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
  handle('attach-captcha', (guestWebContentsId: number) => {
    if (!Number.isInteger(guestWebContentsId) || state.kind !== 'login' || !active?.captcha?.attachView) fail('input');
    return active!.captcha!.attachView!(guestWebContentsId);
  }, 'captcha');
  handle('dismiss-captcha', () => {
    if (state.kind !== 'login' || !active?.captcha) fail('input');
    active!.captcha!.detachView?.();
    update({ captchaUrl: null, captchaStatus: 'viewClosed' });
  }, 'captcha');
  handle('input', (phase: string, value: string) => {
    if (!active?.pty || active.cancelled || state.kind !== 'login' || state.phase !== phase || typeof value !== 'string') fail('input');
    const pattern = phase === 'country'
      ? /^\d{1,4}$/
      : phase === 'phone'
        ? /^\d{5,15}$/
        : phase === 'code'
          ? /^\d{4,8}$/
          : phase === 'captchaChallenge' || phase === 'captchaValidate'
            ? /^[^\r\n\0]{1,2048}$/
            : null;
    if (!pattern?.test(value) || !value.trim()) fail('input');
    if (phase === 'captchaChallenge' && active!.captcha) active!.captcha.challengeSent = true;
    if (phase === 'captchaValidate' && active!.captcha) {
      active!.captcha.validateSent = true;
      active!.captcha.detachView?.();
    }
    update({ phase: 'starting', ...(phase === 'captchaValidate' ? { captchaUrl: null } : {}) });
    active!.pty!.write(`${value}\r`);
  }, 'input');
  handle('cancel', () => { stop(); }, 'cancelled');
  handle('state', () => state, 'input');
  app.on('before-quit', () => stop());
  app.on('browser-window-created', (_event, window) => {
    window.on('closed', () => stop());
  });
}
