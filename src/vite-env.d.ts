/// <reference types="vite/client" />

interface Window {
  electron: {
    ping: () => Promise<string>;
    exportVideo: (config: any) => Promise<{ success: boolean; error?: string; message?: string; placeholder?: boolean; outputPath?: string; manifestPath?: string | null; elapsedMs?: number; realTimeFactor?: number }>;
    getExportPaths: (options: any) => Promise<{ runtimeDir: string; quickSavePath: string; suggestedPath: string }>;
    showOpenDialog: (options: any) => Promise<any>;
    cacheRemoteAsset: (assetUrl: string) => Promise<string | null>;
    showSaveDialog: (options: any) => Promise<any>;
    showItemInFolder: (filePath: string) => Promise<boolean>;
    getDroppedFilePath: (file: File) => string;
    readFile: (filePath: string) => Promise<string>;
    writeFile: (filePath: string, content: string) => Promise<boolean>;
    captureRectToClipboard: (rect: { x: number; y: number; width: number; height: number }) => Promise<boolean>;
    loadConfig: () => Promise<any>;
    saveConfig: (config: any) => Promise<boolean>;
    onExportProgress: (callback: (progress: { progress: number; elapsedMs: number; estimatedRemainingMs: number | null; stage: string }) => void) => () => void;
  };
}
