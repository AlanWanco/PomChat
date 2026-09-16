/** Synchronous project history. Rendering and persistence are consumers of this state. */
export const cloneSnapshot = <T,>(value: T): T => structuredClone(value);
export class HistoryController<T> {
  current: T;
  past: T[] = [];
  future: T[] = [];
  revision = 0;
  epoch = 0;
  /** Changes whenever the set of retained snapshots changes. */
  version = 0;
  private group: { key: string; baseline: T } | null = null;
  private serialized = new WeakMap<object, string>();

  private limit: number;
  constructor(initial: T, limit = 80) {
    this.limit = limit;
    this.current = this.clone(initial);
  }
  private serialize(value: T) {
    if (value && typeof value === 'object') {
      const object = value as object;
      const cached = this.serialized.get(object);
      if (cached !== undefined) return cached;
      return JSON.stringify(value) ?? '';
    }
    return JSON.stringify(value) ?? '';
  }
  private clone(value: T) {
    const serialized = this.serialize(value);
    const cloned = cloneSnapshot(value);
    if (cloned && typeof cloned === 'object') {
      this.serialized.set(cloned as object, serialized);
    }
    return cloned;
  }
  private equal(a: T, b: T) { return this.serialize(a) === this.serialize(b); }
  private touch() { this.version++; }
  get canUndo() { return this.past.length > 0 || Boolean(this.group && !this.equal(this.group.baseline, this.current)); }
  get canRedo() { return this.future.length > 0; }
  get pending() { return this.group !== null; }
  get snapshots() { return [this.current, ...this.past, ...this.future, ...(this.group ? [this.group.baseline] : [])]; }
  /** Synchronize derived state without introducing a user edit. */
  sync(next: T) {
    if (this.equal(this.current, next)) return false;
    this.current = this.clone(next);
    // External/derived state changes invalidate redo snapshots. Otherwise a
    // later redo could restore state that no longer has the current snapshot
    // as its baseline (for example, after persisting a playback position).
    this.future = [];
    this.touch();
    return true;
  }
  begin(key: string) {
    if (this.group?.key === key) return;
    this.finish();
    this.group = { key, baseline: this.clone(this.current) };
  }
  preview(key: string, next: T) {
    this.begin(key);
    if (this.equal(this.current, next)) return false;
    this.current = this.clone(next);
    this.future = [];
    this.revision++;
    this.touch();
    return true;
  }
  finish() {
    if (!this.group) return;
    if (!this.equal(this.group.baseline, this.current)) {
      this.past.push(this.group.baseline);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.group = null;
    this.touch();
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
    this.touch();
    return this.clone(previous);
  }
  redo() {
    this.finish();
    const next = this.future.shift();
    if (!next) return null;
    this.past.push(this.current);
    this.current = next;
    this.revision++;
    this.touch();
    return this.clone(next);
  }
  reset(next: T) {
    this.current = this.clone(next);
    this.past = [];
    this.future = [];
    this.group = null;
    this.revision++;
    this.epoch++;
    this.touch();
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
