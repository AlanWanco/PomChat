/// <reference types="vite/client" />
/* eslint-disable @typescript-eslint/no-explicit-any */

declare const __APP_VERSION__: string;

interface Window {
  electron: {
    ping: () => Promise<string>;
    exportVideo: (config: any) => Promise<{ success: boolean; error?: string; message?: string; placeholder?: boolean; outputPath?: string; manifestPath?: string | null; elapsedMs?: number; realTimeFactor?: number }>;
    getExportPaths: (options: any) => Promise<{ runtimeDir: string; quickSavePath: string; suggestedPath: string }>;
    showOpenDialog: (options: any) => Promise<any>;
    getRenderCacheInfo: () => Promise<{
      remoteAssets: { path: string; files: number; bytes: number };
      remotionTemp: { path: string; entries: string[]; files: number; bytes: number };
    }>;
    clearRenderCache: (type: 'remote-assets' | 'remotion-temp') => Promise<{ cleared: boolean; type: string; targets?: string[] }>;
    cacheRemoteAsset: (assetUrl: string) => Promise<string | null>;
    saveClipboardImageToCache: (payload: { bytes: number[]; contentType?: string; preferredName?: string }) => Promise<string | null>;
    importProjectAsset: (payload: { projectFilePath: string; sourcePath: string; preferredName?: string }) => Promise<{ storedPath: string; absolutePath: string } | null>;
    saveClipboardImageToProjectAssets: (payload: { projectFilePath: string; bytes: number[]; contentType?: string; preferredName?: string }) => Promise<{ storedPath: string; absolutePath: string } | null>;
    showSaveDialog: (options: any) => Promise<any>;
    showItemInFolder: (filePath: string) => Promise<boolean>;
    openExportLogDir: () => Promise<boolean>;
    getDroppedFilePath: (file: File) => string;
    readFile: (filePath: string) => Promise<string>;
    inspectProjectResources: (payload: { projectFilePath: string; resources: Array<{ id: string; value: string }> }) => Promise<Array<{ id: string; state: 'ok' | 'updated-relative' | 'missing'; resolvedValue: string; suggestedValue?: string }>>;
    writeFile: (filePath: string, content: string) => Promise<boolean>;
    backupAssFile: (filePath: string) => Promise<string | null>;
    captureRectToClipboard: (rect: { x: number; y: number; width: number; height: number }) => Promise<boolean>;
    loadConfig: () => Promise<any>;
    saveConfig: (config: any) => Promise<boolean>;
    setProxy: (proxy: string) => Promise<boolean>;
    openExternal: (url: string) => Promise<boolean>;
    checkForUpdates: () => Promise<{ ok: boolean; latestVersion?: string; currentVersion?: string; htmlUrl?: string; publishedAt?: string; hasUpdate?: boolean; error?: string }>;
    onExportProgress: (callback: (progress: { progress: number; elapsedMs: number; estimatedRemainingMs: number | null; stage: string }) => void) => () => void;
  };
}
