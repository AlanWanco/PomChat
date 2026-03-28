import { app, BrowserWindow, ipcMain, dialog, clipboard } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');
app.disableHardwareAcceleration();

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
  const base = trimmed || 'podchat-export';
  return base.replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '-');
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: false, // For local files
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

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
  console.log('Received export video request with config:', config);
  const startTime = Date.now();
  const rangeStart = Number(config?.exportRange?.start || 0);
  const rangeEnd = Number(config?.exportRange?.end || 0);
  const spanSeconds = Math.max(0.5, rangeEnd - rangeStart);
  const totalDurationMs = Math.max(1800, Math.min(12000, Math.round(spanSeconds * 320)));
  const stages = [
    { until: 0.12, label: 'Preparing timeline' },
    { until: 0.34, label: 'Collecting assets' },
    { until: 0.78, label: 'Rendering frames' },
    { until: 0.96, label: 'Packaging output' },
    { until: 1, label: 'Done' }
  ];

  const sendProgress = (progress: number) => {
    const elapsedMs = Date.now() - startTime;
    const stage = stages.find((item) => progress <= item.until)?.label || 'Rendering';
    const estimatedRemainingMs = progress > 0 ? Math.max(0, Math.round(elapsedMs * ((1 - progress) / progress))) : null;
    win?.webContents.send('export-progress', {
      progress,
      elapsedMs,
      estimatedRemainingMs,
      stage
    });
  };

  sendProgress(0);
  await new Promise<void>((resolve) => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / totalDurationMs);
      sendProgress(progress);
      if (progress >= 1) {
        clearInterval(interval);
        resolve();
      }
    }, 140);
  });

  const outputPath = typeof config?.outputPath === 'string' ? config.outputPath : '';
  let manifestPath: string | null = null;
  if (outputPath) {
    manifestPath = `${outputPath}.podchat-render.json`;
    fs.writeFileSync(manifestPath, JSON.stringify({
      note: 'Video renderer is not wired yet. This file records the queued export payload for verification.',
      requestedOutputPath: outputPath,
      createdAt: new Date().toISOString(),
      payload: config
    }, null, 2), 'utf-8');
  }

  return {
    success: true,
    placeholder: true,
    outputPath,
    manifestPath,
    message: manifestPath
      ? `Export workflow finished. Placeholder render manifest saved to ${manifestPath}`
      : 'Export workflow finished.'
  };
});

ipcMain.handle('get-export-paths', async (_event, options) => {
  const runtimeDir = getRuntimeDirectory();
  const projectPath = typeof options?.projectPath === 'string' && options.projectPath ? resolveAppFilePath(options.projectPath) : '';
  const projectDir = projectPath ? path.dirname(projectPath) : runtimeDir;
  const fileStem = sanitizeFileStem(options?.projectTitle || 'podchat-export');
  return {
    runtimeDir,
    quickSavePath: path.join(runtimeDir, `${fileStem}.mp4`),
    suggestedPath: path.join(projectDir, `${fileStem}.mp4`)
  };
});

ipcMain.handle('show-open-dialog', async (_event, options) => {
  if (!win) return null;
  return await dialog.showOpenDialog(win, options);
});

ipcMain.handle('show-save-dialog', async (_event, options) => {
  if (!win) return null;
  return await dialog.showSaveDialog(win, options);
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
