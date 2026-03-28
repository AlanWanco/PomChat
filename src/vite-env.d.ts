/// <reference types="vite/client" />

interface Window {
  electron: {
    ping: () => Promise<string>;
    exportVideo: (config: any) => Promise<{ success: boolean; error?: string; message?: string; placeholder?: boolean; outputPath?: string; manifestPath?: string | null }>;
    getExportPaths: (options: any) => Promise<{ runtimeDir: string; quickSavePath: string; suggestedPath: string }>;
    showOpenDialog: (options: any) => Promise<any>;
    showSaveDialog: (options: any) => Promise<any>;
    getDroppedFilePath: (file: File) => string;
    readFile: (filePath: string) => Promise<string>;
    writeFile: (filePath: string, content: string) => Promise<boolean>;
    captureRectToClipboard: (rect: { x: number; y: number; width: number; height: number }) => Promise<boolean>;
    onExportProgress: (callback: (progress: { progress: number; elapsedMs: number; estimatedRemainingMs: number | null; stage: string }) => void) => () => void;
  };
}
