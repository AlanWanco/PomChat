export interface ExportProgressState {
  progress: number;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  stage: string;
}

type Listener = () => void;

let snapshot: ExportProgressState | null = null;
const listeners = new Set<Listener>();

export function getExportProgressSnapshot(): ExportProgressState | null {
  return snapshot;
}

export function subscribeExportProgress(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setExportProgressSnapshot(next: ExportProgressState | null): void {
  if (snapshot === next) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}
