/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  ping: () => ipcRenderer.invoke('ping'),
  exportVideo: (config: any) => ipcRenderer.invoke('export-video', config),
  getExportPaths: (options: any) => ipcRenderer.invoke('get-export-paths', options),
  showOpenDialog: (options: any) => ipcRenderer.invoke('show-open-dialog', options),
  getRenderCacheInfo: () => ipcRenderer.invoke('get-render-cache-info'),
  clearRenderCache: (type: 'remote-assets' | 'remotion-temp') => ipcRenderer.invoke('clear-render-cache', type),
  cacheRemoteAsset: (assetUrl: string) => ipcRenderer.invoke('cache-remote-asset', assetUrl),
  saveClipboardImageToCache: (payload: { bytes: number[]; contentType?: string; preferredName?: string }) => ipcRenderer.invoke('save-clipboard-image-to-cache', payload),
  showSaveDialog: (options: any) => ipcRenderer.invoke('show-save-dialog', options),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('show-item-in-folder', filePath),
  getDroppedFilePath: (file: File) => webUtils.getPathForFile(file),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
  backupAssFile: (filePath: string) => ipcRenderer.invoke('backup-ass-file', filePath),
  captureRectToClipboard: (rect: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke('capture-rect-to-clipboard', rect),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),
  setProxy: (proxy: string) => ipcRenderer.invoke('set-proxy', proxy),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onExportProgress: (callback: (progress: any) => void) => {
    const listener = (_event: any, value: any) => callback(value);
    ipcRenderer.on('export-progress', listener);
    return () => ipcRenderer.removeListener('export-progress', listener);
  }
});
