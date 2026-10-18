import { app, ipcMain, webContents, Notification, type WebContents } from 'electron';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { IPty } from 'node-pty';
import {
  BILIUP_DEFAULT_PROJECT_FOLDER_TEMPLATE, idleBiliupState, isBiliupVideoPath, normalizeBiliupPreferences, supportsBiliupSeasons, validateBiliupTemplate,
  type BiliupPostUploadOptions, type BiliupState, type BiliupCheck, type BiliupLineTestResult, type BiliupPreferences, type BiliupUploadRequest,
} from '../src/biliup';
import { buildBiliupUploadArgs, extractBiliupBvid, extractBiliupFailureDetail, extractBiliupProgressDetails, parseBiliupJsonOutput, parseBiliupProgress, plainTerminalLine, redactBiliupLine } from './biliupProtocol';
import { translate } from '../src/i18n';

const require = createRequire(import.meta.url);
const exec = promisify(execFile);
const settingsPath = path.join(os.homedir(), '.config', 'pomchat', 'biliup.json');
const allowedErrors = new Set(['directory', 'binary', 'cookie', 'network', 'busy', 'template', 'schedule', 'unsupported', 'native', 'login', 'captcha', 'upload', 'cancelled', 'timeout', 'file', 'input', 'settings', 'season']);
const BILIUP_SUBMISSION_CHECK_INTERVAL_MS = 30_000;
const BILIUP_SUBMISSION_CHECK_TIMEOUT_MS = 4 * 60 * 60_000;
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

interface Runtime { directory: string; binary: string; cookie: string; version: string; help: string; appendHelp: string }
interface Job {
  cancelled: boolean;
  postUpload?: BiliupPostUploadOptions;
  originalFile?: string;
  templateTitle?: string;
  seasonSectionId?: string;
  mode?: 'new' | 'append';
  targetVideoId?: string;
  directory?: string;
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
  const submissionChecks = new Map<string, { cancelled: boolean }>();

  const publish = () => {
    const contents = getContents();
    if (contents && !contents.isDestroyed()) contents.send('biliup-state', state);
  };
  const update = (patch: Partial<BiliupState>) => { state = { ...state, ...patch }; publish(); };
  const checkJob = (job: Job) => { if (job.cancelled || active !== job) fail('cancelled'); };

  function normalizePostUploadOptions(options: BiliupUploadRequest['postUpload'], fallbackProjectName: string): BiliupPostUploadOptions {
    const value = options && typeof options === 'object' ? options as Partial<BiliupPostUploadOptions> : {};
    const language = value.language === 'en' || value.language === 'zh-CN' ? value.language : undefined;
    return {
      createProjectFolder: value.createProjectFolder === true,
      projectFolderDirectory: typeof value.projectFolderDirectory === 'string' ? value.projectFolderDirectory.slice(0, 4096) : '',
      projectFolderTemplate: typeof value.projectFolderTemplate === 'string' && value.projectFolderTemplate.trim()
        ? value.projectFolderTemplate.slice(0, 512)
        : BILIUP_DEFAULT_PROJECT_FOLDER_TEMPLATE,
      checkSubmission: value.checkSubmission === true,
      projectName: (typeof value.projectName === 'string' && value.projectName.trim() ? value.projectName : fallbackProjectName).slice(0, 512),
      language,
    };
  }

  function localizedPostUploadMessage(options: BiliupPostUploadOptions, zh: string, en: string): string {
    return options.language === 'en' ? en : zh;
  }

  function appendUploadLog(bvid: string, message: string, publishNow = true) {
    if (state.kind !== 'upload' || state.bvid !== bvid) return;
    state = { ...state, logs: [...state.logs, message].slice(-300) };
    if (publishNow) publish();
  }

  function sanitizeProjectFolderName(value: string): string {
    const withoutControls = Array.from(value, (character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? '_' : character;
    }).join('');
    const sanitized = withoutControls
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/[. ]+$/g, '')
      .trim()
      .slice(0, 180);
    return sanitized && sanitized !== '.' && sanitized !== '..' ? sanitized : 'Bilibili';
  }

  async function createProjectFolder(options: BiliupPostUploadOptions, bvid: string, originalFile: string, title: string): Promise<string> {
    const rawDirectory = options.projectFolderDirectory.trim().replace(/^~(?=[/\\]|$)/, os.homedir());
    if (!rawDirectory || rawDirectory.includes('\0') || !path.isAbsolute(rawDirectory)) throw new Error('project folder directory');
    await fs.mkdir(rawDirectory, { recursive: true });
    const originalFilename = path.basename(originalFile);
    const extension = path.extname(originalFilename).replace(/^\./, '');
    const filenameStem = originalFilename.replace(/\.[^.]*$/, '') || originalFilename;
    const projectName = options.projectName?.trim() || filenameStem;
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const HH = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const date = `${yyyy}-${mm}-${dd}`;
    const compactDate = `${yyyy}${mm}${dd}`;
    const time = `${HH}-${min}-${ss}`;
    const variables: Record<string, string> = {
      BVID: bvid, BV: bvid, ProjectName: projectName, Title: title, Filename: originalFilename,
      OriginalFilename: originalFilename, FileName: originalFilename, Ext: extension,
      Unix: String(Math.floor(now.getTime() / 1000)), UnixMs: String(now.getTime()),
      Date: date, 'yyyy-mm-dd': date, yyyyMMdd: compactDate, Time: time, 'HH-mm-ss': time,
      yyyy, MM: mm, dd, HH, mm, ss,
    };
    const lowerVariables = Object.fromEntries(Object.entries(variables).map(([key, value]) => [key.toLowerCase(), value]));
    const rawFolderName = (options.projectFolderTemplate || BILIUP_DEFAULT_PROJECT_FOLDER_TEMPLATE).replace(/\{\$([^}]+)\}/g, (match, key: string) => variables[key] ?? lowerVariables[key.toLowerCase()] ?? match);
    const folderName = sanitizeProjectFolderName(rawFolderName);
    const folderPath = path.join(rawDirectory, folderName);
    await fs.mkdir(folderPath, { recursive: true });
    return folderPath;
  }

  async function isBilibiliSubmissionApproved(bvid: string): Promise<boolean> {
    const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (PomChat)' },
      redirect: 'error', signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as { code?: number; data?: unknown };
    return payload.code === 0 && Boolean(payload.data);
  }

  async function monitorSubmission(bvid: string, options: BiliupPostUploadOptions) {
    if (submissionChecks.has(bvid)) return;
    const monitor = { cancelled: false };
    submissionChecks.set(bvid, monitor);
    const zh = options.language !== 'en';
    appendUploadLog(bvid, zh ? `开始检查 ${bvid} 是否通过审核（每 30 秒检查一次，最多 4 小时）` : `Checking ${bvid} for approval (every 30 seconds, up to 4 hours)`);
    const deadline = Date.now() + BILIUP_SUBMISSION_CHECK_TIMEOUT_MS;
    let networkFailures = 0;
    try {
      while (!monitor.cancelled && Date.now() < deadline) {
        try {
          if (!monitor.cancelled && await isBilibiliSubmissionApproved(bvid)) {
            appendUploadLog(bvid, localizedPostUploadMessage(options, `投稿 ${bvid} 已通过审核并可访问`, `Submission ${bvid} is approved and accessible`));
            if (Notification.isSupported()) {
              const notification = new Notification({
                title: zh ? 'B 站投稿审核通过' : 'Bilibili submission approved',
                body: zh ? `${bvid} 已通过审核` : `${bvid} has passed review`,
              });
              notification.show();
            }
            return;
          }
          networkFailures = 0;
        } catch {
          networkFailures += 1;
          if (networkFailures === 1 || networkFailures % 5 === 0) {
            appendUploadLog(bvid, zh ? '检查投稿状态时网络请求失败，将继续重试' : 'The submission status request failed; retrying');
          }
        }
        await new Promise<void>((resolve) => setTimeout(resolve, BILIUP_SUBMISSION_CHECK_INTERVAL_MS));
      }
      if (!monitor.cancelled) appendUploadLog(bvid, zh ? `已停止检查 ${bvid}，在 4 小时内未确认审核通过` : `Stopped checking ${bvid}; approval was not confirmed within 4 hours`);
    } finally {
      if (submissionChecks.get(bvid) === monitor) submissionChecks.delete(bvid);
    }
  }

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
    let appendHelp = '';
    try {
      const options = { cwd: resolved, timeout: 15000, maxBuffer: 512 * 1024, windowsHide: true };
      const versionResult = await exec(binary, ['--version'], options);
      version = plainTerminalLine(`${versionResult.stdout}\n${versionResult.stderr}`).trim().slice(0, 160);
      const globalHelpResult = await exec(binary, ['--help'], options);
      const globalHelp = `${globalHelpResult.stdout}\n${globalHelpResult.stderr}`;
      if (!globalHelp.includes('--user-cookie')) fail('unsupported');
      const uploadHelpResult = await exec(binary, ['upload', '--help'], options);
      help = `${uploadHelpResult.stdout}\n${uploadHelpResult.stderr}`;
      try {
        const appendHelpResult = await exec(binary, ['append', '--help'], options);
        appendHelp = `${appendHelpResult.stdout}\n${appendHelpResult.stderr}`;
      } catch { appendHelp = ''; }
    } catch (error) { return fail(safeError(error, 'binary')); }
    const cookie = path.join(resolved, 'cookies.json');
    return { directory: resolved, binary, cookie, version, help, appendHelp };
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

  async function testLines(): Promise<BiliupLineTestResult[]> {
    if (active || checking) fail('busy');
    checking = true;
    try {
      const probeResponse = await fetch('https://member.bilibili.com/preupload?r=probe', { redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!probeResponse.ok) fail('network');
      const payload = await probeResponse.json() as { lines?: Array<{ query?: unknown; probe_url?: unknown }> };
      const lines = Array.isArray(payload.lines) ? payload.lines : fail('network');
      if (lines.length === 0) fail('network');
      return await Promise.all(lines.map(async (line) => {
        const probeUrl = typeof line.probe_url === 'string' ? line.probe_url : '';
        const url = probeUrl.startsWith('//') ? `https:${probeUrl}` : probeUrl;
        const query = typeof line.query === 'string' ? line.query : '';
        const name = new URLSearchParams(query).get('upcdn') || (() => { try { return new URL(url).hostname; } catch { return 'unknown'; } })();
        if (!url) return { name, ok: false, error: 'network' as const };
        const startedAt = Date.now();
        try {
          const response = await fetch(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000) });
          return { name, ok: response.ok, status: response.status, elapsedMs: Date.now() - startedAt, ...(response.ok ? {} : { error: 'network' as const }) };
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          return { name, ok: false, elapsedMs: Date.now() - startedAt, error: /certificate|tls|ssl|cert/i.test(message) ? 'tls' as const : 'network' as const };
        }
      }));
    } finally { checking = false; }
  }

  function requireSeasonVersion(version: string) {
    if (!supportsBiliupSeasons(version)) fail('unsupported');
  }

  async function runSeasonCommand(directory: string, action: string[]): Promise<unknown> {
    const info = await runtime(directory);
    requireSeasonVersion(info.version);
    try {
      const result = await exec(info.binary, ['--user-cookie', info.cookie, 'season', ...action, '--json'], {
        cwd: info.directory, timeout: 30_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
      });
      try { return parseBiliupJsonOutput(result.stdout); }
      catch (error) {
        debugBiliup('season command returned invalid JSON', { action: action[0], reason: error instanceof Error ? error.message : 'unknown' });
        return fail('season');
      }
    } catch (error) {
      debugBiliup('season command failed', { action: action[0], reason: safeError(error, 'season') });
      return fail('season');
    }
  }

  async function inspect(directory: string) {
    const info = await runtime(directory);
    return { version: info.version, seasonsSupported: supportsBiliupSeasons(info.version) };
  }

  async function listSeasons(directory: string) {
    const result = await runSeasonCommand(directory, ['list']);
    if (!Array.isArray(result)) return fail('input');
    return result.slice(0, 300).flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const item = entry as { season?: { id?: unknown; title?: unknown }; sections?: { sections?: unknown } };
      const id = Number(item.season?.id);
      if (!Number.isSafeInteger(id) || id <= 0) return [];
      const sections = Array.isArray(item.sections?.sections) ? item.sections.sections : [];
      return [{ id, title: typeof item.season?.title === 'string' ? item.season.title.slice(0, 500) : '', sections: sections.flatMap((value) => {
        if (!value || typeof value !== 'object') return [];
        const section = value as { id?: unknown; title?: unknown };
        const sectionId = Number(section.id);
        return Number.isSafeInteger(sectionId) && sectionId > 0 ? [{ id: sectionId, title: typeof section.title === 'string' ? section.title.slice(0, 200) : '' }] : [];
      }) }];
    });
  }

  async function getSeasonContents(directory: string, seasonId: number) {
    if (!Number.isSafeInteger(seasonId) || seasonId <= 0) return fail('input');
    const result = await runSeasonCommand(directory, ['sections', String(seasonId)]);
    if (!result || typeof result !== 'object') return fail('input');
    const data = result as { season?: { id?: unknown; title?: unknown }; sections?: unknown };
    const id = Number(data.season?.id);
    if (!Number.isSafeInteger(id) || id <= 0 || !Array.isArray(data.sections)) return fail('input');
    return {
      id,
      title: typeof data.season?.title === 'string' ? data.season.title.slice(0, 500) : '',
      sections: data.sections.slice(0, 100).flatMap((value) => {
        if (!value || typeof value !== 'object') return [];
        const row = value as { section?: { id?: unknown; title?: unknown }; episodes?: unknown };
        const sectionId = Number(row.section?.id);
        if (!Number.isSafeInteger(sectionId) || sectionId <= 0) return [];
        const episodes = Array.isArray(row.episodes) ? row.episodes : [];
        return [{ id: sectionId, title: typeof row.section?.title === 'string' ? row.section.title.slice(0, 200) : '', episodes: episodes.slice(0, 500).flatMap((episodeValue) => {
          if (!episodeValue || typeof episodeValue !== 'object') return [];
          const episode = episodeValue as { id?: unknown; aid?: unknown; cid?: unknown; title?: unknown };
          const episodeId = Number(episode.id), aid = Number(episode.aid), cid = Number(episode.cid);
          return Number.isSafeInteger(episodeId) && Number.isSafeInteger(aid) && Number.isSafeInteger(cid)
            ? [{ id: episodeId, aid, cid, title: typeof episode.title === 'string' ? episode.title.slice(0, 500) : '' }] : [];
        }) }];
      }),
    };
  }

  async function getVideoParts(videoId: string) {
    if (typeof videoId !== 'string' || !/^(?:BV[0-9A-Za-z]{10}|(?:av)?[0-9]{1,15})$/i.test(videoId.trim())) return fail('input');
    const id = videoId.trim();
    const parameter = /^bv/i.test(id) ? ['bvid', `${id.slice(0, 2).toUpperCase()}${id.slice(2)}`] as const : ['aid', id.replace(/^av/i, '')] as const;
    const url = new URL('https://api.bilibili.com/x/web-interface/view');
    url.searchParams.set(parameter[0], parameter[1]);
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (PomChat)' }, redirect: 'error', signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return fail('network');
    const payload = await response.json() as { code?: number; data?: { aid?: unknown; bvid?: unknown; title?: unknown; pages?: unknown } };
    const data = payload.data;
    if (payload.code !== 0 || !data || !Number.isSafeInteger(Number(data.aid))) return fail('input');
    const pages = Array.isArray(data.pages) ? data.pages : [];
    if (pages.length === 0) return fail('input');
    return {
      aid: Number(data.aid), bvid: typeof data.bvid === 'string' ? data.bvid.slice(0, 32) : '', title: typeof data.title === 'string' ? data.title.slice(0, 500) : '',
      pages: pages.slice(0, 1000).flatMap((value, index) => {
        if (!value || typeof value !== 'object') return [];
        const page = value as { cid?: unknown; page?: unknown; part?: unknown; duration?: unknown };
        const cid = Number(page.cid), pageNumber = Number(page.page);
        return Number.isSafeInteger(cid) && cid > 0 ? [{ cid, page: Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : index + 1, part: typeof page.part === 'string' ? page.part.slice(0, 500) : '', duration: Number.isFinite(Number(page.duration)) ? Number(page.duration) : 0 }] : [];
      }),
    };
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
    const appendSucceeded = job.mode === 'append' && !job.cancelled && !job.forcedError && exitCode === 0;
    const uploadMissingBvid = state.kind === 'upload' && job.mode !== 'append' && !job.cancelled && !job.forcedError && exitCode === 0 && !state.bvid;
    const error = job.forcedError || (!job.cancelled && exitCode !== 0 ? state.kind === 'login' ? 'login' : 'upload' : uploadMissingBvid ? 'upload' : undefined);
    const uploadSucceeded = !error && !job.cancelled && state.kind === 'upload' && (Boolean(state.bvid) || appendSucceeded);
    const bvid = state.bvid || (appendSucceeded ? job.targetVideoId : undefined);
    if (error && state.kind === 'upload' && !extractBiliupFailureDetail(state.logs)) {
      const language = job.postUpload?.language === 'en' ? 'en' : 'zh-CN';
      const message = translate(language, uploadMissingBvid ? 'biliup.uploadMissingBvid' : 'biliup.uploadExitError', { code: exitCode });
      state = { ...state, logs: [...state.logs, `ERROR: ${message}`].slice(-300) };
    }
    if (appendSucceeded && bvid) {
      state = { ...state, logs: [...state.logs, translate(job.postUpload?.language === 'en' ? 'en' : 'zh-CN', 'biliup.append.succeeded', { bvid })].slice(-300) };
    }
    if (uploadSucceeded && bvid && job.mode !== 'append' && job.postUpload?.createProjectFolder) {
      try {
        const folderPath = await createProjectFolder(job.postUpload, bvid, job.originalFile || '', job.templateTitle || '');
        appendUploadLog(bvid, localizedPostUploadMessage(job.postUpload, `已创建项目文件夹：${folderPath}`, `Project folder created: ${folderPath}`), false);
      } catch (folderError) {
        const reason = folderError instanceof Error ? folderError.message : 'unknown error';
        debugBiliup('project folder creation failed', { bvid, reason });
        appendUploadLog(bvid, localizedPostUploadMessage(job.postUpload, '项目文件夹创建失败，上传本身不受影响', 'Could not create the project folder; the upload itself succeeded'), false);
      }
    }
    if (active !== job) return;
    if (uploadSucceeded && bvid && job.mode !== 'append' && job.seasonSectionId && job.directory) {
      try {
        update({ logs: [...state.logs, translate(job.postUpload?.language === 'en' ? 'en' : 'zh-CN', 'biliup.season.adding')].slice(-300) });
        await runSeasonCommand(job.directory, ['add', job.seasonSectionId, '--vid', bvid]);
        state = { ...state, logs: [...state.logs, translate(job.postUpload?.language === 'en' ? 'en' : 'zh-CN', 'biliup.season.added')].slice(-300) };
      } catch {
        state = { ...state, logs: [...state.logs, translate(job.postUpload?.language === 'en' ? 'en' : 'zh-CN', 'biliup.season.addFailed')].slice(-300) };
      }
    }
    if (active !== job) return;
    active = null;
    update({ busy: false, phase: error ? 'failed' : job.cancelled ? 'cancelled' : 'success', error, bvid: bvid || state.bvid,
      errorDetail: error ? extractBiliupFailureDetail(state.logs) || undefined : undefined,
      qrImage: null, captchaUrl: null, captchaStatus: '', progress: uploadSucceeded ? 100 : state.progress, progressText: '' });
    if (uploadSucceeded && bvid && job.mode !== 'append' && job.postUpload?.checkSubmission) void monitorSubmission(bvid, job.postUpload).catch((monitorError) => {
      debugBiliup('submission status monitor stopped unexpectedly', monitorError instanceof Error ? monitorError.message : 'unknown');
    });
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
      job.pty.onExit(({ exitCode }) => { setImmediate(() => { void finish(job, exitCode); }); });
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
    const language = request.postUpload?.language === 'en' ? 'en' : 'zh-CN';
    job.postUpload = normalizePostUploadOptions(request.postUpload, '');
    let stage = 'template';
    const prepare = (nextStage: string) => {
      stage = nextStage;
      update({ logs: [...state.logs, translate(language, 'biliup.uploadPreparing', { stage: translate(language, `biliup.stage.${stage}`) })].slice(-300) });
    };
    try {
      prepare('template');
      const mode = request.mode === 'append' ? 'append' : 'new';
      if (mode === 'append') {
        if (typeof request.targetVideoId !== 'string' || !/^(?:BV[0-9A-Za-z]{10}|(?:av)?[0-9]{1,15})$/i.test(request.targetVideoId.trim())) fail('input');
      } else {
        const error = validateBiliupTemplate(request.template);
        if (error) fail(error);
      }
      prepare('runtime');
      const info = await runtime(request.directory);
      checkJob(job);
      prepare('cookie');
      const auth = await verifyCookieWithRenew(info);
      checkJob(job);
      prepare('video');
      const requestedFiles = Array.isArray(request.filePaths) ? request.filePaths : [request.filePath];
      if (requestedFiles.length < 1 || requestedFiles.length > 100 || requestedFiles.some((item) => typeof item !== 'string' || !path.isAbsolute(item) || !isBiliupVideoPath(item))) fail('file');
      const originals: string[] = [];
      for (const item of requestedFiles) {
        const resolved = await fs.realpath(item);
        const stat = await fs.stat(resolved);
        if (!stat.isFile() || stat.size === 0) fail('file');
        originals.push(resolved);
      }
      const original = originals[0];
      const fallbackProjectName = path.basename(original).replace(/\.[^.]*$/, '') || path.basename(original);
      job.originalFile = original;
      job.templateTitle = request.template.title;
      job.directory = request.directory;
      job.mode = mode;
      job.targetVideoId = typeof request.targetVideoId === 'string' ? request.targetVideoId.trim() : undefined;
      job.seasonSectionId = mode === 'new' && typeof request.seasonSectionId === 'string' && /^\d{1,16}$/.test(request.seasonSectionId) ? request.seasonSectionId : '';
      if (mode === 'new' && request.seasonSectionId && !job.seasonSectionId) fail('input');
      if (job.seasonSectionId) requireSeasonVersion(info.version);
      job.postUpload = normalizePostUploadOptions(request.postUpload, fallbackProjectName);
      let files = originals;
      if (originals.some((item) => Array.from(path.basename(item)).length > 80 || path.basename(item).length > 80)) {
        prepare('staging');
        job.temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'pomchat-biliup-'));
        files = [];
        for (let index = 0; index < originals.length; index += 1) {
          const item = originals[index];
          if (Array.from(path.basename(item)).length <= 80 && path.basename(item).length <= 80) { files.push(item); continue; }
          const extension = path.extname(item).toLowerCase();
          const suffix = `-${index + 1}${extension}`;
          const basename = path.basename(item, path.extname(item));
          const safeStem = Array.from(basename).slice(0, Math.max(1, 80 - Array.from(suffix).length)).join('');
          const staged = path.join(job.temporary, `${safeStem}${suffix}`);
          try { await fs.link(item, staged); }
          catch { await fs.copyFile(item, staged); }
          files.push(staged);
        }
      }
      checkJob(job);
      const template = { ...request.template };
      if (mode === 'new' && template.cover && !/^https?:\/\//i.test(template.cover)) {
        prepare('cover');
        template.cover = path.resolve(info.directory, template.cover);
        if (!(await fs.stat(template.cover)).isFile()) fail('file');
      }
      prepare('arguments');
      const args = buildBiliupUploadArgs(template, files, info.cookie, mode === 'append' ? info.appendHelp : info.help, {
        mode, targetVideoId: job.targetVideoId,
      });
      prepare('spawn');
      const child = spawnPty(job, info, args);
      update({ phase: 'uploading', logs: [...state.logs, `biliup ${mode === 'append' ? `append ${job.targetVideoId}` : 'upload'} ${originals.map((item) => JSON.stringify(path.basename(item))).join(', ')}`] });
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
          const bvid = extractBiliupBvid(line);
          const progress = extractBiliupFailureDetail([line]) ? null : parseBiliupProgress(line);
          if (progress !== null) {
            state = { ...state, bvid: bvid || state.bvid, progress, progressText: extractBiliupProgressDetails(line) };
          } else {
            state = { ...state, bvid: bvid || state.bvid, logs: [...state.logs, line].slice(-300) };
          }
        }
        if (!job.updateTimer) job.updateTimer = setTimeout(() => { job.updateTimer = undefined; if (active === job) publish(); }, 100);
      });
      child.onExit(() => {
        if (partial.trim()) {
          const line = redactBiliupLine(partial, auth.secrets);
          const bvid = extractBiliupBvid(line);
          if (extractBiliupFailureDetail([line]) || parseBiliupProgress(line) === null) state = { ...state, bvid: bvid || state.bvid, logs: [...state.logs, line].slice(-300) };
          else if (bvid) state = { ...state, bvid };
        }
      });
    } catch (error) {
      const fallback = ['video', 'cover', 'staging'].includes(stage) ? 'file' : 'upload';
      job.forcedError = safeError(error, fallback);
      const systemCode = (error as NodeJS.ErrnoException | null)?.code;
      const reason = typeof systemCode === 'string' && /^[A-Z][A-Z0-9_]{1,39}$/.test(systemCode)
        ? systemCode
        : translate(language, `biliup.error.${job.forcedError}`);
      const detail = translate(language, 'biliup.uploadPreparationFailed', { stage: translate(language, `biliup.stage.${stage}`), reason });
      if (active === job) update({ logs: [...state.logs, `ERROR: ${detail}`].slice(-300) });
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
  handle('inspect', inspect, 'binary');
  handle('seasons', listSeasons, 'input');
  handle('season-contents', getSeasonContents, 'input');
  handle('video-parts', getVideoParts, 'input');
  handle('test-lines', testLines, 'network');
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
  app.on('before-quit', () => {
    stop();
    for (const monitor of submissionChecks.values()) monitor.cancelled = true;
    submissionChecks.clear();
  });
  app.on('browser-window-created', (_event, window) => {
    window.on('closed', () => stop());
  });
}
