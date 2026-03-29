/* eslint-disable @typescript-eslint/no-explicit-any */
import { app, BrowserWindow, ipcMain, dialog, clipboard, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { fork } from 'node:child_process';
import os from 'node:os';
import crypto from 'node:crypto';

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

function guessExtensionFromContentType(contentType: string | null) {
  const type = (contentType || '').toLowerCase();
  if (type.includes('image/png')) return '.png';
  if (type.includes('image/jpeg')) return '.jpg';
  if (type.includes('image/webp')) return '.webp';
  if (type.includes('image/gif')) return '.gif';
  if (type.includes('image/svg')) return '.svg';
  return '';
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

function getRuntimeDirectory() {
  return process.env.APP_ROOT || path.dirname(app.getPath('exe'));
}

function sanitizeFileStem(value: string) {
  const trimmed = value.trim();
  const base = trimmed || 'pomchat-export';
  return base.replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '-');
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

  win.webContents.on('console-message', (_event, level, message, lineNumber, sourceId) => {
    console.log(`[Renderer:${level}] ${message} (at ${sourceId}:${lineNumber})`);
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

app.whenReady().then(createWindow);

// IPC Handlers
ipcMain.handle('ping', () => 'pong');

ipcMain.handle('export-video', async (_event, config) => {
  const outputPath = typeof config?.outputPath === 'string' ? config.outputPath : '';
  if (!outputPath) {
    return {
      success: false,
      error: 'Missing output path',
    };
  }

  try {
    const workerPath = path.join(process.env.APP_ROOT || process.cwd(), 'electron', 'remotion-worker.cjs');
    if (!fs.existsSync(workerPath)) {
      return {
        success: false,
        error: `Export worker not found: ${workerPath}`,
      };
    }
    const result = await new Promise<any>((resolve, reject) => {
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

      // Set timeout for export (5 hours max)
      const timeout = setTimeout(() => {
        worker.kill();
        reject(new Error('Export timeout: operation took too long'));
      }, 5 * 60 * 60 * 1000);

      worker.on('message', (message: any) => {
        if (!message) return;
        if (message.type === 'progress') {
          win?.webContents.send('export-progress', message.payload);
          return;
        }

        if (message.type === 'result') {
          clearTimeout(timeout);
          resolve(message.payload);
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
            workerStdOut.trim() || ''
          ].filter(Boolean).join('\n');
          reject(new Error(detail));
        }
      });

      worker.send({
        type: 'render',
        payload: config,
      });
    });

    return {
      success: true,
      placeholder: false,
      outputPath: result.outputPath,
      elapsedMs: result.elapsedMs,
      realTimeFactor: result.realTimeFactor,
      message: result.message,
    };
  } catch (error: any) {
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

ipcMain.handle('show-save-dialog', async (_event, options) => {
  if (!win) return null;
  return await dialog.showSaveDialog(win, options);
});

ipcMain.handle('show-item-in-folder', async (_event, filePath) => {
  if (!filePath) return false;
  shell.showItemInFolder(resolveAppFilePath(filePath));
  return true;
});

ipcMain.handle('read-file', async (_event, filePath) => {
  try {
    return fs.readFileSync(resolveAppFilePath(filePath), 'utf-8');
  } catch (error: any) {
    throw new Error(`Failed to read file: ${error.message}`);
  }
});

ipcMain.handle('write-file', async (_event, filePath, content) => {
  try {
    fs.writeFileSync(resolveAppFilePath(filePath), content, 'utf-8');
    return true;
  } catch (error: any) {
    throw new Error(`Failed to write file: ${error.message}`);
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
    return true;
  } catch (error: any) {
    console.error('Failed to save config:', error);
    return false;
  }
});
