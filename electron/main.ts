/* eslint-disable @typescript-eslint/no-explicit-any */
import { app, BrowserWindow, ipcMain, dialog, clipboard, shell, session, nativeImage } from 'electron';
import { execFileSync, fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, fileURLToPath as urlToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';

const GITHUB_REPO_URL = 'https://github.com/AlanWanco/PomChat';
const GITHUB_LATEST_RELEASE_API = 'https://api.github.com/repos/AlanWanco/PomChat/releases/latest';
const require = createRequire(import.meta.url);
let cachedPatchedBinariesDir: string | null = null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');
app.disableHardwareAcceleration();

// Configuration file paths (priority order: ~/.config/pomchat > app folder)
function getConfigFilePath() {
  const userConfigDir = path.join(os.homedir(), '.config', 'pomchat');
  const userConfigFile = path.join(userConfigDir, 'config.json');
  const appConfigFile = path.join(process.env.APP_ROOT || '', 'pomchat-config.json');
  
  // Check if user config exists, otherwise use app folder
  if (fs.existsSync(userConfigFile)) {
    return userConfigFile;
  }
  return appConfigFile;
}

// Ensure config directory exists
function ensureConfigDir() {
  const userConfigDir = path.join(os.homedir(), '.config', 'pomchat');
  if (!fs.existsSync(userConfigDir)) {
    fs.mkdirSync(userConfigDir, { recursive: true });
  }
}

function getRemoteAssetCacheDir() {
  const dir = path.join(os.homedir(), '.config', 'pomchat', 'cache', 'remote-assets');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getAvatarGifTranscodeDir() {
  const dir = path.join(os.homedir(), '.config', 'pomchat', 'cache', 'avatar-gif-transcodes');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getExportLogDir() {
  const dir = path.join(os.homedir(), '.config', 'pomchat', 'export-logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function collectMediaFiles(config: any) {
  const speakerAvatars = Object.entries(config?.speakers || {})
    .map(([speakerId, speaker]: [string, any]) => ({ speakerId, path: speaker?.avatar || '' }))
    .filter((entry) => entry.path);

  return {
    subtitle: config?.assPath || '',
    audio: config?.audioPath || '',
    background: config?.background?.image || '',
    speakerAvatars,
  };
}

function writeExportLog(entry: Record<string, unknown>) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(getExportLogDir(), `export-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
  return filePath;
}

function getCpuCount() {
  return Math.max(1, typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length);
}

function patchMacCompositorBinaries() {
  if (process.platform !== 'darwin') {
    return null;
  }

  if (cachedPatchedBinariesDir) {
    return cachedPatchedBinariesDir;
  }

  const compositorPkgName = process.arch === 'arm64'
    ? '@remotion/compositor-darwin-arm64/package.json'
    : '@remotion/compositor-darwin-x64/package.json';
  const pkgJsonPath = require.resolve(compositorPkgName);
  const sourceDir = path.dirname(pkgJsonPath);
  const hash = crypto.createHash('sha1').update(sourceDir).digest('hex').slice(0, 8);
  const tempRoot = fs.realpathSync.native ? fs.realpathSync.native(os.tmpdir()) : fs.realpathSync(os.tmpdir());
  const targetDir = path.join(tempRoot, `pomchat-remotion-bin-${process.arch}-${hash}-${process.pid}`);
  const marker = path.join(targetDir, '.patched-v2');

  if (!fs.existsSync(marker)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.cpSync(sourceDir, targetDir, { recursive: true });

    const dylibs = fs.readdirSync(targetDir).filter((name) => name.endsWith('.dylib'));
    const patchTarget = (filePath: string) => {
      dylibs.forEach((libName) => {
        execFileSync('install_name_tool', ['-change', libName, `@loader_path/${libName}`, filePath]);
      });
    };

    dylibs.forEach((libName) => {
      const dylibPath = path.join(targetDir, libName);
      execFileSync('install_name_tool', ['-id', `@loader_path/${libName}`, dylibPath]);
      patchTarget(dylibPath);
    });

    ['ffmpeg', 'ffprobe', 'remotion'].forEach((binary) => {
      patchTarget(path.join(targetDir, binary));
    });

    const signTarget = (filePath: string) => {
      execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', filePath]);
    };

    dylibs.forEach((libName) => {
      signTarget(path.join(targetDir, libName));
    });
    ['ffmpeg', 'ffprobe', 'remotion'].forEach((binary) => {
      signTarget(path.join(targetDir, binary));
    });

    fs.writeFileSync(marker, 'ok');
  }

  cachedPatchedBinariesDir = targetDir;
  return cachedPatchedBinariesDir;
}

function getExportWorkerPath() {
  const appRoot = process.env.APP_ROOT || process.cwd();
  const workerCandidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'remotion-worker.cjs') : null,
    path.join(appRoot, 'app.asar.unpacked', 'electron', 'remotion-worker.cjs'),
    path.join(appRoot, 'electron', 'remotion-worker.cjs'),
  ].filter(Boolean) as string[];
  const workerPath = workerCandidates.find((p) => fs.existsSync(p)) || workerCandidates[workerCandidates.length - 1];
  if (!workerPath || !fs.existsSync(workerPath)) {
    throw new Error(`Export worker not found. Tried: ${workerCandidates.join(', ')}`);
  }
  return workerPath;
}

function resolveRemotionBinary(binaryName: 'ffmpeg' | 'ffprobe') {
  const patchedDir = patchMacCompositorBinaries();
  if (patchedDir) {
    const patchedBinaryPath = path.join(patchedDir, process.platform === 'win32' ? `${binaryName}.exe` : binaryName);
    if (fs.existsSync(patchedBinaryPath)) {
      return patchedBinaryPath;
    }
  }

  const appRoot = process.env.APP_ROOT || process.cwd();
  const remotionDirs = [
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@remotion') : null,
    path.join(appRoot, 'app.asar.unpacked', 'node_modules', '@remotion'),
    path.join(appRoot, 'node_modules', '@remotion'),
  ].filter(Boolean) as string[];

  for (const dir of remotionDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.startsWith('compositor-')) continue;
      const binaryPath = path.join(dir, entry, process.platform === 'win32' ? `${binaryName}.exe` : binaryName);
      if (fs.existsSync(binaryPath)) {
        return binaryPath;
      }
    }
  }

  try {
    const pkgPath = require.resolve(`@remotion/compositor-${process.platform}-${process.arch}/package.json`);
    const binaryPath = path.join(path.dirname(pkgPath), process.platform === 'win32' ? `${binaryName}.exe` : binaryName);
    if (fs.existsSync(binaryPath)) {
      return binaryPath;
    }
  } catch (_error) {
    // Fall back to PATH below.
  }

  return process.platform === 'win32' ? `${binaryName}.exe` : binaryName;
}

function probeHasAudioStream(inputPath: string) {
  try {
    const output = execFileSync(resolveRemotionBinary('ffprobe'), [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=index',
      '-of', 'csv=p=0',
      inputPath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    return output.length > 0;
  } catch (_error) {
    return false;
  }
}

function runConcatMp4(segmentPaths: string[], outputPath: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pomchat-concat-'));
  const listPath = path.join(tempDir, 'segments.txt');
  const escapeConcatPath = (value: string) => value.replace(/'/g, `'\\''`);

  fs.writeFileSync(
    listPath,
    segmentPaths.map((segmentPath) => `file '${escapeConcatPath(path.resolve(segmentPath))}'`).join('\n'),
    'utf-8'
  );

  try {
    const ffmpegBinary = resolveRemotionBinary('ffmpeg');

    try {
      execFileSync(ffmpegBinary, [
        '-y',
        '-fflags', '+genpts',
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-c', 'copy',
        '-movflags', '+faststart',
        '-avoid_negative_ts', 'make_zero',
        outputPath,
      ], { stdio: 'pipe' });
      return;
    } catch (_copyError) {
      const hasAudioInAllSegments = segmentPaths.every((segmentPath) => probeHasAudioStream(segmentPath));
      execFileSync(ffmpegBinary, [
        '-y',
        '-i', segmentPaths[0],
        '-i', segmentPaths[1],
        '-filter_complex', hasAudioInAllSegments
          ? '[0:v:0][0:a:0][1:v:0][1:a:0]concat=n=2:v=1:a=1[outv][outa]'
          : '[0:v:0][1:v:0]concat=n=2:v=1:a=0[outv]',
        '-map', '[outv]',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        ...(hasAudioInAllSegments ? ['-map', '[outa]', '-c:a', 'aac', '-b:a', '192k'] : []),
        outputPath,
      ], { stdio: 'pipe' });
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function runWorkerExport(workerPath: string, config: any, onProgress?: (payload: any) => void) {
  return new Promise<any>((resolve, reject) => {
    let workerStdErr = '';
    let workerStdOut = '';

    const workerCwd = app.getPath('userData');
    fs.mkdirSync(workerCwd, { recursive: true });
    const worker = fork(workerPath, [], {
      cwd: workerCwd,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        APP_ROOT: process.env.APP_ROOT || process.cwd(),
        VITE_PUBLIC: process.env.VITE_PUBLIC || '',
      },
    });

    worker.stdout?.on('data', (chunk) => {
      workerStdOut += chunk.toString();
    });

    worker.stderr?.on('data', (chunk) => {
      workerStdErr += chunk.toString();
    });

    const timeout = setTimeout(() => {
      worker.kill();
      reject(new Error('Export timeout: operation took too long'));
    }, 5 * 60 * 60 * 1000);

    worker.on('message', (message: any) => {
      if (!message) return;
      if (message.type === 'progress') {
        onProgress?.(message.payload);
        return;
      }

      if (message.type === 'result') {
        clearTimeout(timeout);
        resolve({
          ...message.payload,
          workerDetails: {
            stdout: workerStdOut.trim() || null,
            stderr: workerStdErr.trim() || null,
          },
        });
        worker.kill();
        return;
      }

      if (message.type === 'error') {
        clearTimeout(timeout);
        const detail = [message.payload?.message, workerStdErr.trim() || '', workerStdOut.trim() || ''].filter(Boolean).join('\n');
        reject(new Error(detail || 'Export failed'));
        worker.kill();
      }
    });

    worker.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    worker.on('exit', (code) => {
      clearTimeout(timeout);
      if (code && code !== 0) {
        const detail = [
          `Export worker exited with code ${code}`,
          workerStdErr.trim() || '',
          workerStdOut.trim() || '',
        ].filter(Boolean).join('\n');
        reject(new Error(detail));
      }
    });

    worker.send({
      type: 'render',
      payload: config,
    });
  });
}

function getPomchatRemotionTempEntries() {
  const tempDir = os.tmpdir();
  if (!fs.existsSync(tempDir)) {
    return [];
  }

  const SAFE_PREFIXES = ['pomchat-remotion-', 'remotion-'];
  return fs.readdirSync(tempDir)
    .filter((name) => SAFE_PREFIXES.some((prefix) => name.startsWith(prefix)))
    .map((name) => path.join(tempDir, name));
}

function getPathSizeStats(targetPath: string): { bytes: number; files: number } {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return { bytes: 0, files: 0 };
  }

  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    return { bytes: stat.size, files: 1 };
  }

  if (!stat.isDirectory()) {
    return { bytes: 0, files: 0 };
  }

  let bytes = 0;
  let files = 0;
  const stack = [targetPath];

  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const name of fs.readdirSync(current)) {
      const child = path.join(current, name);
      const childStat = fs.statSync(child);
      if (childStat.isDirectory()) {
        stack.push(child);
      } else if (childStat.isFile()) {
        bytes += childStat.size;
        files += 1;
      }
    }
  }

  return { bytes, files };
}

async function applyProxySettings(proxy: unknown) {
  const proxyRules = typeof proxy === 'string' ? proxy.trim() : '';

  if (proxyRules) {
    process.env.HTTP_PROXY = proxyRules;
    process.env.HTTPS_PROXY = proxyRules;
    process.env.http_proxy = proxyRules;
    process.env.https_proxy = proxyRules;
  } else {
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
  }

  await session.defaultSession.setProxy({
    proxyRules,
    proxyBypassRules: '<local>'
  });

  if (win) {
    await win.webContents.session.setProxy({
      proxyRules,
      proxyBypassRules: '<local>'
    });
  }
}

function guessExtensionFromContentType(contentType: string | null) {
  const type = (contentType || '').toLowerCase();
  if (type.includes('image/png')) return '.png';
  if (type.includes('image/jpeg')) return '.jpg';
  if (type.includes('image/webp')) return '.webp';
  if (type.includes('image/gif')) return '.gif';
  if (type.includes('image/svg')) return '.svg';
  return '';
}

function saveImageBufferToCache(buffer: Buffer, contentType?: string | null, preferredName?: string | null) {
  const cacheDir = getRemoteAssetCacheDir();
  const preferredExtension = preferredName ? path.extname(preferredName).toLowerCase() : '';
  const extension = guessExtensionFromContentType(contentType || null) || preferredExtension || '.png';
  const hash = crypto.createHash('sha1').update(buffer).digest('hex');
  const outputPath = path.join(cacheDir, `${hash}${extension}`);

  if (!fs.existsSync(outputPath)) {
    fs.writeFileSync(outputPath, buffer);
  }

  return outputPath;
}

function ensureProjectAssetsDir(projectFilePath: string) {
  const projectDir = path.dirname(resolveAppFilePath(projectFilePath));
  const assetsDir = path.join(projectDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  return assetsDir;
}

function createUniqueProjectAssetPath(projectFilePath: string, preferredName?: string | null, fallbackExtension?: string | null) {
  const assetsDir = ensureProjectAssetsDir(projectFilePath);
  const rawName = (preferredName || '').trim();
  const parsed = rawName ? path.parse(rawName) : null;
  const extension = (parsed?.ext || fallbackExtension || '.bin').toLowerCase();
  const baseName = sanitizeFileStem(parsed?.name || 'asset');
  let attempt = 0;

  while (true) {
    const fileName = attempt === 0 ? `${baseName}${extension}` : `${baseName}-${attempt + 1}${extension}`;
    const outputPath = path.join(assetsDir, fileName);
    if (!fs.existsSync(outputPath)) {
      return outputPath;
    }
    attempt += 1;
  }
}

function importFileToProjectAssets(projectFilePath: string, sourcePath: string, preferredName?: string | null) {
  const resolvedSourcePath = resolveProjectResourcePath(projectFilePath, sourcePath);
  if (!resolvedSourcePath || !fs.existsSync(resolvedSourcePath)) {
    throw new Error('Source file does not exist');
  }

  const stat = fs.statSync(resolvedSourcePath);
  if (!stat.isFile()) {
    throw new Error('Source path is not a file');
  }

  const normalizedSource = path.resolve(resolvedSourcePath);
  const assetsDir = ensureProjectAssetsDir(projectFilePath);
  const normalizedAssetsDir = path.resolve(assetsDir);
  if (normalizedSource === normalizedAssetsDir || normalizedSource.startsWith(`${normalizedAssetsDir}${path.sep}`)) {
    return {
      storedPath: toProjectRelativePath(projectFilePath, normalizedSource),
      absolutePath: normalizedSource,
    };
  }

  const outputPath = createUniqueProjectAssetPath(projectFilePath, preferredName || path.basename(normalizedSource), path.extname(normalizedSource));
  fs.copyFileSync(normalizedSource, outputPath);
  return {
    storedPath: toProjectRelativePath(projectFilePath, outputPath),
    absolutePath: outputPath,
  };
}

function saveImageBufferToProjectAssets(projectFilePath: string, buffer: Buffer, contentType?: string | null, preferredName?: string | null) {
  const preferredExtension = preferredName ? path.extname(preferredName).toLowerCase() : '';
  const extension = guessExtensionFromContentType(contentType || null) || preferredExtension || '.png';
  const outputPath = createUniqueProjectAssetPath(projectFilePath, preferredName || 'clipboard-image', extension);
  fs.writeFileSync(outputPath, buffer);
  return {
    storedPath: toProjectRelativePath(projectFilePath, outputPath),
    absolutePath: outputPath,
  };
}

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null;

function resolveAppFilePath(filePath: string) {
  if (!filePath) {
    return filePath;
  }

  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.startsWith('/projects/') || normalized.startsWith('projects/')) {
    return path.join(process.env.VITE_PUBLIC || process.env.APP_ROOT || '', normalized.replace(/^\//, ''));
  }

  return filePath;
}

function resolveProjectResourcePath(projectFilePath: string, resourcePath: string) {
  if (!resourcePath) return resourcePath;
  const trimmed = resourcePath.trim();
  if (!trimmed) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
  if (trimmed.startsWith('file://')) {
    try {
      return urlToPath(trimmed);
    } catch {
      return trimmed;
    }
  }

  const baseDir = path.dirname(resolveAppFilePath(projectFilePath));
  if (path.isAbsolute(trimmed) || trimmed.startsWith('\\\\')) {
    return trimmed;
  }
  return path.resolve(baseDir, trimmed);
}

function toProjectRelativePath(projectFilePath: string, absolutePath: string) {
  const baseDir = path.dirname(resolveAppFilePath(projectFilePath));
  const relativePath = path.relative(baseDir, absolutePath);
  return relativePath.replace(/\\/g, '/');
}

function isPathInsideProjectDir(projectFilePath: string, absolutePath: string) {
  const baseDir = path.resolve(path.dirname(resolveAppFilePath(projectFilePath)));
  const targetPath = path.resolve(absolutePath);
  const relativePath = path.relative(baseDir, targetPath);
  if (!relativePath) {
    return true;
  }
  return relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && relativePath !== path.parse(relativePath).root;
}

function findSiblingFileByBasename(projectFilePath: string, resourcePath: string) {
  const baseDir = path.dirname(resolveAppFilePath(projectFilePath));
  const targetBasename = path.basename(resourcePath);
  if (!targetBasename || !fs.existsSync(baseDir)) {
    return null;
  }

  for (const entry of fs.readdirSync(baseDir)) {
    if (entry !== targetBasename) {
      continue;
    }
    const candidate = path.join(baseDir, entry);
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile()) {
        return candidate;
      }
    } catch {
      // Ignore race conditions while scanning sibling files.
    }
  }

  return null;
}

async function inspectProjectResources(projectFilePath: string, resources: Array<{ id: string; value: string }>) {
  const results: Array<{ id: string; state: 'ok' | 'updated-relative' | 'missing'; resolvedValue: string; suggestedValue?: string }> = [];

  for (const resource of resources) {
    const originalValue = String(resource.value || '').trim();
    if (!originalValue) continue;

    const resolvedValue = resolveProjectResourcePath(projectFilePath, originalValue);
    if (/^https?:\/\//i.test(resolvedValue)) {
      try {
        const response = await fetch(resolvedValue, { method: 'HEAD', redirect: 'follow' });
        if (response.ok) {
          results.push({ id: resource.id, state: 'ok', resolvedValue });
          continue;
        }
      } catch {
        // fall through to GET retry
      }

      try {
        const response = await fetch(resolvedValue, { method: 'GET', redirect: 'follow' });
        results.push({ id: resource.id, state: response.ok ? 'ok' : 'missing', resolvedValue });
      } catch {
        results.push({ id: resource.id, state: 'missing', resolvedValue });
      }
      continue;
    }

    if (fs.existsSync(resolvedValue)) {
      if (isPathInsideProjectDir(projectFilePath, resolvedValue)) {
        const suggestedValue = toProjectRelativePath(projectFilePath, resolvedValue);
        results.push({ id: resource.id, state: suggestedValue && suggestedValue !== originalValue ? 'updated-relative' : 'ok', resolvedValue, suggestedValue });
      } else {
        results.push({ id: resource.id, state: 'ok', resolvedValue });
      }
      continue;
    }

    const siblingMatch = findSiblingFileByBasename(projectFilePath, resolvedValue);
    if (siblingMatch) {
      results.push({
        id: resource.id,
        state: 'updated-relative',
        resolvedValue: siblingMatch,
        suggestedValue: toProjectRelativePath(projectFilePath, siblingMatch),
      });
      continue;
    }

    results.push({ id: resource.id, state: 'missing', resolvedValue });
  }

  return results;
}

function getRuntimeDirectory() {
  return process.env.APP_ROOT || path.dirname(app.getPath('exe'));
}

function sanitizeFileStem(value: string) {
  const trimmed = value.trim();
  const base = trimmed || 'pomchat-export';
  return base.replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '-');
}

function normalizeVersionTag(version: string) {
  return (version || '').trim().replace(/^v/i, '');
}

function compareVersions(a: string, b: string) {
  const tokenize = (value: string) => normalizeVersionTag(value).split(/[-.]/g).map((part) => {
    const numeric = Number(part);
    return Number.isFinite(numeric) ? numeric : part;
  });
  const left = tokenize(a);
  const right = tokenize(b);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    if (typeof l === 'number' && typeof r === 'number') {
      if (l !== r) return l > r ? 1 : -1;
      continue;
    }
    const ls = String(l);
    const rs = String(r);
    if (ls !== rs) return ls > rs ? 1 : -1;
  }

  return 0;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: false, // For local files
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform !== 'darwin') {
    win.setMenuBarVisibility(false);
  }

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  win.webContents.on('console-message', (...args: any[]) => {
    const eventOrLevel = args[0];
    const details = args[1] && typeof args[1] === 'object'
      ? args[1]
      : null;

    if (details) {
      console.log(`[Renderer:${details.level}] ${details.message} (at ${details.sourceId}:${details.lineNumber})`);
      return;
    }

    const [, level, message, lineNumber, sourceId] = args;
    console.log(`[Renderer:${level}] ${message} (at ${sourceId}:${lineNumber})`, eventOrLevel ? '' : '');
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Renderer gone]', details.reason, details.exitCode);
  });

  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[Preload error]', preloadPath, error);
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(async () => {
  try {
    const configPath = getConfigFilePath();
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content);
      await applyProxySettings(parsed?.ui?.proxy);
    } else {
      await applyProxySettings('');
    }
  } catch (error) {
    console.error('Failed to apply proxy on startup:', error);
  }

  createWindow();
});

// IPC Handlers
ipcMain.handle('ping', () => 'pong');

ipcMain.handle('open-external', async (_event, url: string) => {
  if (!url) return false;
  await shell.openExternal(url);
  return true;
});

ipcMain.handle('check-for-updates', async () => {
  try {
    const response = await fetch(GITHUB_LATEST_RELEASE_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'PomChat-Studio'
      }
    });

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }

    const release = await response.json() as { tag_name?: string; html_url?: string; published_at?: string };
    const currentVersion = app.getVersion();
    const latestVersion = normalizeVersionTag(release.tag_name || currentVersion);
    return {
      ok: true,
      currentVersion,
      latestVersion,
      htmlUrl: release.html_url || `${GITHUB_REPO_URL}/releases`,
      publishedAt: release.published_at,
      hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('export-video', async (_event, config) => {
  const outputPath = typeof config?.outputPath === 'string' ? config.outputPath : '';
  const exportStartedAt = Date.now();
  if (!outputPath) {
    return {
      success: false,
      error: 'Missing output path',
    };
  }

  try {
    const exportMetaBase = {
      outputPath,
      outputFilename: path.basename(outputPath),
      exportType: config?.exportFormat === 'mov-alpha' || config?.exportFormat === 'webm-alpha' ? config.exportFormat : 'mp4',
      exportQuality: config?.exportQuality || 'balance',
      exportHardware: config?.exportHardware || 'auto',
      exportParallelSegments: Boolean(config?.exportParallelSegments),
      exportRange: config?.exportRange || null,
      exportDurationSeconds: typeof config?.exportRange?.start === 'number' && typeof config?.exportRange?.end === 'number'
        ? Math.max(0, config.exportRange.end - config.exportRange.start)
        : null,
      dimensions: config?.dimensions || null,
      fps: config?.fps || null,
      mediaFiles: collectMediaFiles(config),
      projectTitle: config?.projectTitle || '',
      subtitleCount: Array.isArray(config?.content) ? config.content.length : 0,
      startedAt: new Date(exportStartedAt).toISOString(),
    };

    const workerPath = getExportWorkerPath();
    const exportRange = config?.exportRange || null;
    const fps = typeof config?.fps === 'number' && Number.isFinite(config.fps) ? config.fps : 30;
    const canUseParallelSegments = Boolean(
      config?.exportParallelSegments &&
      config?.exportFormat !== 'mov-alpha' &&
      config?.exportFormat !== 'webm-alpha' &&
      exportRange &&
      typeof exportRange.start === 'number' &&
      typeof exportRange.end === 'number' &&
      exportRange.end > exportRange.start
    );

    let result: any = null;

    if (canUseParallelSegments) {
      const totalFrames = Math.max(1, Math.round((exportRange.end - exportRange.start) * fps));
      const firstSegmentFrames = Math.floor(totalFrames / 2);

      if (firstSegmentFrames >= 1 && totalFrames - firstSegmentFrames >= 1) {
        const splitTime = exportRange.start + firstSegmentFrames / fps;
        const tempRoot = fs.realpathSync.native ? fs.realpathSync.native(os.tmpdir()) : fs.realpathSync(os.tmpdir());
        const tempDir = fs.mkdtempSync(path.join(tempRoot, 'pomchat-parallel-export-'));
        const outputExt = path.extname(outputPath) || '.mp4';
        const segmentAPath = path.join(tempDir, `segment-a${outputExt}`);
        const segmentBPath = path.join(tempDir, `segment-b${outputExt}`);
        const renderConcurrency = Math.max(1, Math.floor(getCpuCount() / 2));
        const workerProgress = [0, 0];

        try {
          const aggregateProgress = (segmentIndex: number, payload: any) => {
            workerProgress[segmentIndex] = Math.max(0, Math.min(1, payload?.progress || 0));
            const combined = (workerProgress[0] + workerProgress[1]) / 2;
            win?.webContents.send('export-progress', {
              ...payload,
              progress: Math.min(0.94, combined * 0.94),
              stage: `Parallel render ${segmentIndex + 1}/2: ${payload?.stage || 'Rendering'}`,
            });
          };

          const segmentResults = await Promise.allSettled([
            runWorkerExport(workerPath, {
              ...config,
              outputPath: segmentAPath,
              exportRange: {
                start: exportRange.start,
                end: splitTime,
              },
              renderConcurrency,
            }, (payload) => aggregateProgress(0, payload)),
            runWorkerExport(workerPath, {
              ...config,
              outputPath: segmentBPath,
              exportRange: {
                start: splitTime,
                end: exportRange.end,
              },
              renderConcurrency,
            }, (payload) => aggregateProgress(1, payload)),
          ]);

          const firstRejected = segmentResults.find((entry) => entry.status === 'rejected') as PromiseRejectedResult | undefined;
          if (firstRejected) {
            throw firstRejected.reason;
          }

          win?.webContents.send('export-progress', {
            progress: 0.97,
            elapsedMs: Date.now() - exportStartedAt,
            estimatedRemainingMs: null,
            stage: 'Concatenating parallel segments',
          });

          runConcatMp4([segmentAPath, segmentBPath], outputPath);
          const elapsedMs = Date.now() - exportStartedAt;
          const durationSeconds = Math.max(0.1, exportRange.end - exportRange.start);
          result = {
            success: true,
            outputPath,
            elapsedMs,
            realTimeFactor: elapsedMs / (durationSeconds * 1000),
            message: `Exported with parallel segments in ${(elapsedMs / 1000).toFixed(2)}s`,
            workerDetails: {
              stdout: null,
              stderr: null,
            },
          };
        } finally {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }
    }

    if (!result) {
      result = await runWorkerExport(workerPath, config, (payload) => {
        win?.webContents.send('export-progress', payload);
      });
    }

    const workerDetails = result?.workerDetails || null;

    const successPayload = {
      success: true,
      placeholder: false,
      outputPath: result.outputPath,
      elapsedMs: result.elapsedMs,
      realTimeFactor: result.realTimeFactor,
      message: result.message,
    };
    if (config?.exportLogEnabled) {
      writeExportLog({
        ...exportMetaBase,
        success: true,
        finishedAt: new Date().toISOString(),
        elapsedMs: result.elapsedMs ?? Date.now() - exportStartedAt,
        realTimeFactor: result.realTimeFactor ?? null,
        resultMessage: result.message || '',
        workerStdOut: workerDetails?.stdout ?? null,
        workerStdErr: workerDetails?.stderr ?? null,
      });
    }
    return successPayload;
  } catch (error: any) {
    if (config?.exportLogEnabled) {
      writeExportLog({
        outputPath,
        outputFilename: path.basename(outputPath),
        exportType: config?.exportFormat === 'mov-alpha' || config?.exportFormat === 'webm-alpha' ? config.exportFormat : 'mp4',
        exportQuality: config?.exportQuality || 'balance',
        exportHardware: config?.exportHardware || 'auto',
        exportParallelSegments: Boolean(config?.exportParallelSegments),
        exportRange: config?.exportRange || null,
        exportDurationSeconds: typeof config?.exportRange?.start === 'number' && typeof config?.exportRange?.end === 'number'
          ? Math.max(0, config.exportRange.end - config.exportRange.start)
          : null,
        dimensions: config?.dimensions || null,
        fps: config?.fps || null,
        mediaFiles: collectMediaFiles(config),
        projectTitle: config?.projectTitle || '',
        subtitleCount: Array.isArray(config?.content) ? config.content.length : 0,
        startedAt: new Date(exportStartedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        elapsedMs: Date.now() - exportStartedAt,
        success: false,
        error: error?.message || 'Export failed',
      });
    }
    return {
      success: false,
      error: error?.message || 'Export failed',
    };
  }
});

ipcMain.handle('get-export-paths', async (_event, options) => {
  const runtimeDir = getRuntimeDirectory();
  const projectPath = typeof options?.projectPath === 'string' && options.projectPath ? resolveAppFilePath(options.projectPath) : '';
  const projectDir = projectPath ? path.dirname(projectPath) : runtimeDir;
  const fileStem = sanitizeFileStem(options?.projectTitle || 'pomchat-export');
  return {
    runtimeDir,
    quickSavePath: projectDir,
    suggestedPath: projectDir,
    suggestedFilename: `${fileStem}.mp4`
  };
});

ipcMain.handle('get-render-cache-info', async () => {
  const remoteAssetsDir = getRemoteAssetCacheDir();
  const avatarGifDir = getAvatarGifTranscodeDir();
  const remoteStats = getPathSizeStats(remoteAssetsDir);
  const avatarGifStats = getPathSizeStats(avatarGifDir);

  const remotionEntries = getPomchatRemotionTempEntries();
  const remotionStats = remotionEntries.reduce((acc, entryPath) => {
    const stat = getPathSizeStats(entryPath);
    return {
      bytes: acc.bytes + stat.bytes,
      files: acc.files + stat.files,
    };
  }, { bytes: 0, files: 0 });

  return {
    remoteAssets: {
      path: remoteAssetsDir,
      files: remoteStats.files + avatarGifStats.files,
      bytes: remoteStats.bytes + avatarGifStats.bytes,
    },
    remotionTemp: {
      path: os.tmpdir(),
      entries: remotionEntries,
      files: remotionStats.files,
      bytes: remotionStats.bytes,
    }
  };
});

ipcMain.handle('clear-render-cache', async (_event, type: 'remote-assets' | 'remotion-temp') => {
  if (type === 'remote-assets') {
    const dirs = [getRemoteAssetCacheDir(), getAvatarGifTranscodeDir()];
    dirs.forEach((dir) => {
      if (fs.existsSync(dir)) {
        for (const name of fs.readdirSync(dir)) {
          fs.rmSync(path.join(dir, name), { recursive: true, force: true });
        }
      }
    });
    return { cleared: true, type };
  }

  if (type === 'remotion-temp') {
    const targets = getPomchatRemotionTempEntries();
    targets.forEach((entryPath) => {
      fs.rmSync(entryPath, { recursive: true, force: true });
    });
    return { cleared: true, type, targets };
  }

  return { cleared: false, type };
});

ipcMain.handle('show-open-dialog', async (_event, options) => {
  if (!win) return null;
  return await dialog.showOpenDialog(win, options);
});

ipcMain.handle('cache-remote-asset', async (_event, assetUrl: string) => {
  if (!assetUrl || !/^https?:\/\//i.test(assetUrl)) {
    return null;
  }

  const url = new URL(assetUrl);
  const cacheDir = getRemoteAssetCacheDir();
  const hash = crypto.createHash('sha1').update(assetUrl).digest('hex');
  const urlExtension = path.extname(url.pathname || '').toLowerCase();

  const existing = fs.readdirSync(cacheDir).find((name) => name.startsWith(`${hash}.`));
  if (existing) {
    return path.join(cacheDir, existing);
  }

  const response = await fetch(assetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 PomChat/1.0',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Referer': `${url.origin}/`
    },
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`Failed to cache remote asset: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type');
  const extension = guessExtensionFromContentType(contentType) || urlExtension || '.bin';
  const outputPath = path.join(cacheDir, `${hash}${extension}`);
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
  return outputPath;
});

ipcMain.handle('save-clipboard-image-to-cache', async (_event, payload: { bytes: number[]; contentType?: string; preferredName?: string }) => {
  if (!payload || !Array.isArray(payload.bytes) || payload.bytes.length === 0) {
    return null;
  }

  return saveImageBufferToCache(Buffer.from(payload.bytes), payload.contentType, payload.preferredName);
});

ipcMain.handle('import-project-asset', async (_event, payload: { projectFilePath: string; sourcePath: string; preferredName?: string }) => {
  if (!payload?.projectFilePath || !payload?.sourcePath) {
    return null;
  }

  return importFileToProjectAssets(payload.projectFilePath, payload.sourcePath, payload.preferredName);
});

ipcMain.handle('save-clipboard-image-to-project-assets', async (_event, payload: { projectFilePath: string; bytes: number[]; contentType?: string; preferredName?: string }) => {
  if (!payload?.projectFilePath || !Array.isArray(payload.bytes) || payload.bytes.length === 0) {
    return null;
  }

  return saveImageBufferToProjectAssets(payload.projectFilePath, Buffer.from(payload.bytes), payload.contentType, payload.preferredName);
});

ipcMain.handle('show-save-dialog', async (_event, options) => {
  if (!win) return null;
  return await dialog.showSaveDialog(win, options);
});

ipcMain.handle('show-item-in-folder', async (_event, filePath) => {
  if (!filePath) return false;
  shell.showItemInFolder(resolveAppFilePath(filePath));
  return true;
});

ipcMain.handle('open-export-log-dir', async () => {
  const result = await shell.openPath(getExportLogDir());
  return result === '';
});

ipcMain.handle('read-file', async (_event, filePath) => {
  try {
    return fs.readFileSync(resolveAppFilePath(filePath), 'utf-8');
  } catch (error: any) {
    throw new Error(`Failed to read file: ${error.message}`);
  }
});

ipcMain.handle('inspect-project-resources', async (_event, payload: { projectFilePath: string; resources: Array<{ id: string; value: string }> }) => {
  return inspectProjectResources(payload.projectFilePath, payload.resources || []);
});

ipcMain.handle('write-file', async (_event, filePath, content) => {
  try {
    fs.writeFileSync(resolveAppFilePath(filePath), content, 'utf-8');
    return true;
  } catch (error: any) {
    throw new Error(`Failed to write file: ${error.message}`);
  }
});

ipcMain.handle('write-binary-file', async (_event, payload: { filePath: string; bytes: number[] }) => {
  try {
    if (!payload?.filePath || !Array.isArray(payload.bytes)) {
      return false;
    }
    fs.writeFileSync(resolveAppFilePath(payload.filePath), Buffer.from(payload.bytes));
    return true;
  } catch (error: any) {
    throw new Error(`Failed to write binary file: ${error.message}`);
  }
});

ipcMain.handle('copy-image-bytes-to-clipboard', async (_event, payload: { bytes: number[] }) => {
  try {
    if (!payload || !Array.isArray(payload.bytes) || payload.bytes.length === 0) {
      return false;
    }
    const image = nativeImage.createFromBuffer(Buffer.from(payload.bytes));
    clipboard.writeImage(image);
    return true;
  } catch (error: any) {
    throw new Error(`Failed to copy image to clipboard: ${error.message}`);
  }
});

ipcMain.handle('copy-image-data-url-to-clipboard', async (_event, payload: { dataUrl: string }) => {
  try {
    if (!payload?.dataUrl) {
      return false;
    }
    const image = nativeImage.createFromDataURL(payload.dataUrl);
    clipboard.writeImage(image);
    return true;
  } catch (error: any) {
    throw new Error(`Failed to copy image data URL to clipboard: ${error.message}`);
  }
});

ipcMain.handle('write-image-data-url-to-file', async (_event, payload: { filePath: string; dataUrl: string }) => {
  try {
    if (!payload?.filePath || !payload?.dataUrl) {
      return false;
    }
    const image = nativeImage.createFromDataURL(payload.dataUrl);
    fs.writeFileSync(resolveAppFilePath(payload.filePath), image.toPNG());
    return true;
  } catch (error: any) {
    throw new Error(`Failed to write image data URL to file: ${error.message}`);
  }
});

ipcMain.handle('render-svg-data-url-to-png', async (_event, payload: { dataUrl: string; width: number; height: number }) => {
  let tempWindow: BrowserWindow | null = null;
  try {
    if (!payload?.dataUrl || !Number.isFinite(payload.width) || !Number.isFinite(payload.height)) {
      return null;
    }
    const width = Math.max(1, Math.ceil(payload.width));
    const height = Math.max(1, Math.ceil(payload.height));

    tempWindow = new BrowserWindow({
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      useContentSize: true,
      width,
      height,
      webPreferences: {
        sandbox: false,
      },
    });

    const html = `
      <!doctype html>
      <html>
        <body style="margin:0;padding:0;overflow:hidden;background:transparent;">
          <img src="${payload.dataUrl.replace(/"/g, '&quot;')}" style="display:block;width:${width}px;height:${height}px;" />
        </body>
      </html>
    `;
    await tempWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((resolve) => setTimeout(resolve, 60));
    const image = await tempWindow.webContents.capturePage({ x: 0, y: 0, width, height });
    return Array.from(image.toPNG());
  } catch (error: any) {
    throw new Error(`Failed to render SVG data URL to PNG: ${error.message}`);
  } finally {
    if (tempWindow && !tempWindow.isDestroyed()) {
      tempWindow.destroy();
    }
  }
});

 ipcMain.handle('render-html-to-png', async (_event, payload: { html: string; width: number; height: number; scale?: number }) => {
  let tempWindow: BrowserWindow | null = null;
  try {
    if (!payload?.html || !Number.isFinite(payload.width) || !Number.isFinite(payload.height)) {
      return null;
    }
    const width = Math.max(1, Math.ceil(payload.width));
    const height = Math.max(1, Math.ceil(payload.height));
    const scale = Number.isFinite(payload.scale) ? Math.max(0.1, Math.min(8, Number(payload.scale))) : 1;

    tempWindow = new BrowserWindow({
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      useContentSize: true,
      width,
      height,
      webPreferences: {
        sandbox: false,
      },
    });

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            html, body {
              margin: 0;
              padding: 0;
              width: ${width}px;
              height: ${height}px;
              overflow: hidden;
              background: transparent;
            }
            body > div {
              width: ${width}px;
              height: ${height}px;
            }
          </style>
        </head>
        <body>${payload.html}</body>
      </html>
    `;
    await tempWindow.loadURL('about:blank');
    await tempWindow.webContents.executeJavaScript(`
      document.open();
      document.write(${JSON.stringify(html)});
      document.close();
      true;
    `);
    await tempWindow.webContents.executeJavaScript(`
      (async () => {
        const waitForImages = (images) => Promise.all(images.map((image) => new Promise((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          const done = () => {
            image.removeEventListener('load', done);
            image.removeEventListener('error', done);
            resolve();
          };
          image.addEventListener('load', done, { once: true });
          image.addEventListener('error', done, { once: true });
        })));
        const preloadUrls = async (urls) => {
          await Promise.all(Array.from(urls).map((url) => new Promise((resolve) => {
            const image = new Image();
            const done = () => resolve();
            image.onload = done;
            image.onerror = done;
            image.src = url;
          })));
        };
        const collectBackgroundUrls = () => {
          const urls = new Set();
          const nodes = [document.body, ...Array.from(document.body.querySelectorAll('*'))];
          const pattern = /url\\((["']?)(.*?)\\1\\)/g;
          nodes.forEach((node) => {
            const value = window.getComputedStyle(node).backgroundImage;
            if (!value || value === 'none') {
              return;
            }
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(value))) {
              if (match[2]) {
                urls.add(match[2]);
              }
            }
          });
          return urls;
        };
        if (document.fonts?.ready) {
          try {
            await document.fonts.ready;
          } catch {}
        }
        await waitForImages(Array.from(document.images));
        await preloadUrls(collectBackgroundUrls());
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return true;
      })();
    `);
    const image = await tempWindow.webContents.capturePage({ x: 0, y: 0, width, height });
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const normalizedImage = image.getSize().width === targetWidth && image.getSize().height === targetHeight
      ? image
      : image.resize({ width: targetWidth, height: targetHeight, quality: 'best' });
    return Array.from(normalizedImage.toPNG());
  } catch (error: any) {
    throw new Error(`Failed to render HTML to PNG: ${error.message}`);
  } finally {
    if (tempWindow && !tempWindow.isDestroyed()) {
      tempWindow.destroy();
    }
  }
});

ipcMain.handle('backup-ass-file', async (_event, filePath) => {
  try {
    const resolvedPath = resolveAppFilePath(filePath);
    if (!resolvedPath || !/\.ass$/i.test(resolvedPath)) {
      return null;
    }

    const runtimeDir = getRuntimeDirectory();
    const backupDir = path.join(runtimeDir, 'backup');
    fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = path.basename(resolvedPath).replace(/\.ass$/i, '');
    const backupPath = path.join(backupDir, `${baseName}.${timestamp}.backup.ass`);

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    fs.writeFileSync(backupPath, content, 'utf-8');
    return backupPath;
  } catch (error: any) {
    throw new Error(`Failed to backup ASS file: ${error.message}`);
  }
});

ipcMain.handle('capture-rect-to-clipboard', async (_event, rect) => {
  if (!win) return false;

  try {
    const image = await win.webContents.capturePage(rect);
    clipboard.writeImage(image);
    return true;
  } catch (error: any) {
    throw new Error(`Failed to capture rect: ${error.message}`);
  }
});

// Config file handling
ipcMain.handle('load-config', async () => {
  try {
    const configPath = getConfigFilePath();
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    }
    return null;
  } catch (error: any) {
    console.error('Failed to load config:', error);
    return null;
  }
});

ipcMain.handle('save-config', async (_event, config) => {
  try {
    ensureConfigDir();
    const userConfigDir = path.join(os.homedir(), '.config', 'pomchat');
    const configPath = path.join(userConfigDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    await applyProxySettings(config?.ui?.proxy);
    return true;
  } catch (error: any) {
    console.error('Failed to save config:', error);
    return false;
  }
});

ipcMain.handle('set-proxy', async (_event, proxy) => {
  try {
    await applyProxySettings(proxy);
    return true;
  } catch (error: any) {
    console.error('Failed to set proxy:', error);
    return false;
  }
});
