/** Synchronous project history. Rendering and persistence are consumers of this state. */
export const cloneSnapshot = <T,>(value: T): T => structuredClone(value);
const equal = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

export class HistoryController<T> {
  current: T;
  past: T[] = [];
  future: T[] = [];
  revision = 0;
  epoch = 0;
  private group: { key: string; baseline: T } | null = null;

  private limit: number;
  constructor(initial: T, limit = 80) { this.current = cloneSnapshot(initial); this.limit = limit; }
  get canUndo() { return this.past.length > 0 || Boolean(this.group && !equal(this.group.baseline, this.current)); }
  get canRedo() { return this.future.length > 0; }
  get pending() { return this.group !== null; }
  get snapshots() { return [this.current, ...this.past, ...this.future, ...(this.group ? [this.group.baseline] : [])]; }
  /** Synchronize derived state without introducing a user edit. */
  sync(next: T) { this.current = cloneSnapshot(next); }
  begin(key: string) {
    if (this.group?.key === key) return;
    this.finish();
    this.group = { key, baseline: cloneSnapshot(this.current) };
  }
  preview(key: string, next: T) {
    this.begin(key);
    if (equal(this.current, next)) return false;
    this.current = cloneSnapshot(next);
    this.future = [];
    this.revision++;
    return true;
  }
  finish() {
    if (!this.group) return;
    if (!equal(this.group.baseline, this.current)) {
      this.past.push(this.group.baseline);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.group = null;
  }
  commit(next: T) {
    this.finish();
    const changed = this.preview('commit', next);
    this.finish();
    return changed;
  }
  undo() {
    this.finish();
    const previous = this.past.pop();
    if (!previous) return null;
    this.future.unshift(this.current);
    this.current = previous;
    this.revision++;
    return cloneSnapshot(previous);
  }
  redo() {
    this.finish();
    const next = this.future.shift();
    if (!next) return null;
    this.past.push(this.current);
    this.current = next;
    this.revision++;
    return cloneSnapshot(next);
  }
  reset(next: T) {
    this.current = cloneSnapshot(next);
    this.past = [];
    this.future = [];
    this.group = null;
    this.revision++;
    this.epoch++;
  }
  saveToken() { return { revision: this.revision, epoch: this.epoch }; }
  isSaveCurrent(token: ReturnType<HistoryController<T>['saveToken']>) {
    return token.revision === this.revision && token.epoch === this.epoch;
  }
}

/** Own only URLs created by this app; imported URL strings are never revoked. */
export class MediaUrlRegistry {
  private owned = new Set<string>();
  private revoke: (url: string) => void;
  constructor(revoke: (url: string) => void = URL.revokeObjectURL) { this.revoke = revoke; }
  add(url: string) { this.owned.add(url); return url; }
  retain(snapshots: unknown[]) {
    const referenced = new Set<string>();
    const visit = (value: unknown) => {
      if (typeof value === 'string') referenced.add(value);
      else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    };
    snapshots.forEach(visit);
    for (const url of this.owned) {
      if (!referenced.has(url)) { this.revoke(url); this.owned.delete(url); }
    }
  }
  dispose() { this.retain([]); }
}

export function usesNativeTextUndo(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const editable = target.closest('[contenteditable]');
  if (target.isContentEditable || (editable && ['', 'true', 'plaintext-only'].includes(editable.getAttribute('contenteditable') || ''))) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && ['text', 'number', 'search', 'email', 'url', 'tel', 'password'].includes(target.type);
}
