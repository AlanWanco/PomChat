const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  ping: () => ipcRenderer.invoke('ping'),
  exportVideo: (config: any) => ipcRenderer.invoke('export-video', config),
  getExportPaths: (options: any) => ipcRenderer.invoke('get-export-paths', options),
  showOpenDialog: (options: any) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options: any) => ipcRenderer.invoke('show-save-dialog', options),
  getDroppedFilePath: (file: File) => webUtils.getPathForFile(file),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
  captureRectToClipboard: (rect: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke('capture-rect-to-clipboard', rect),
  onExportProgress: (callback: (progress: any) => void) => {
    const listener = (_event: any, value: any) => callback(value);
    ipcRenderer.on('export-progress', listener);
    return () => ipcRenderer.removeListener('export-progress', listener);
  }
});
