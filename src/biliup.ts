export interface BiliupTemplate {
  id: string;
  name: string;
  title: string;
  tag: string;
  tid: number;
  copyright: 1 | 2;
  source: string;
  desc: string;
  dynamic: string;
  cover: string;
  dtime: string;
  line: string;
  limit: number;
  submit: '' | 'app' | 'web' | 'bcutandroid';
  noReprint: boolean;
  dolby: boolean;
  hires: boolean;
  interactive: number;
  missionId: string;
  isOnlySelf: '' | '0' | '1';
  chargingPay: boolean;
  upSelectionReply: boolean;
  closeReply: boolean;
  closeDanmu: boolean;
}

export const BILIUP_MAX_TAGS = 10;
export const BILIUP_MAX_TAG_HISTORY = 100;
export const BILIUP_SCHEDULE_MIN_LEAD_SECONDS = 4 * 60 * 60;
export const BILIUP_SCHEDULE_MAX_AHEAD_SECONDS = 15 * 24 * 60 * 60;

export function splitBiliupTags(value: string): string[] {
  return value.split(/[,，\n]/).map((tag) => tag.trim()).filter(Boolean);
}

export function mergeBiliupTags(...values: string[][]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const tags of values) {
    for (const tag of tags) {
      const normalized = tag.trim();
      const key = normalized.toLocaleLowerCase();
      if (!normalized || seen.has(key)) continue;
      seen.add(key);
      merged.push(normalized);
    }
  }
  return merged;
}

export function validateBiliupSchedule(dtime: string, now = Math.floor(Date.now() / 1000)): string | null {
  if (!dtime) return null;
  if (!/^\d{10}$/.test(dtime)) return 'schedule';
  const timestamp = Number(dtime);
  if (!Number.isSafeInteger(timestamp) || timestamp < now + BILIUP_SCHEDULE_MIN_LEAD_SECONDS || timestamp > now + BILIUP_SCHEDULE_MAX_AHEAD_SECONDS) return 'schedule';
  return null;
}

export interface BiliupAccount {
  id: string;
  name: string;
  directory: string;
}
export interface BiliupPreferences {
  directory: string;
  selectedAccountId: string;
  accounts: BiliupAccount[];
  selectedTemplateId: string;
  templates: BiliupTemplate[];
  tagHistory: string[];
}
export interface BiliupCheck {
  binaryOk: boolean;
  cookieOk: boolean;
  cookieExists: boolean;
  version: string;
  cookieFile: string;
  error?: string;
}
export type BiliupPhase = 'idle' | 'starting' | 'qr' | 'country' | 'phone' | 'code' | 'uploading' | 'success' | 'failed' | 'cancelled';
export interface BiliupState {
  busy: boolean;
  kind: 'login' | 'upload' | null;
  phase: BiliupPhase;
  logs: string[];
  progress: number | null;
  progressText: string;
  qrImage: string | null;
  error?: string;
  bvid?: string;
}
export interface BiliupUploadRequest {
  directory: string;
  template: BiliupTemplate;
  filePath: string;
}
export interface BiliupUploadPlan {
  directory: string;
  template: BiliupTemplate;
}
export interface BiliupResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
}
export interface BiliupApi {
  load: () => Promise<BiliupResult<BiliupPreferences>>;
  save: (preferences: BiliupPreferences) => Promise<BiliupResult<BiliupPreferences>>;
  check: (directory: string) => Promise<BiliupResult<BiliupCheck>>;
  login: (directory: string, method: 'qr' | 'sms') => Promise<BiliupResult<void>>;
  input: (phase: BiliupPhase, value: string) => Promise<BiliupResult<void>>;
  upload: (request: BiliupUploadRequest) => Promise<BiliupResult<void>>;
  cancel: () => Promise<BiliupResult<void>>;
  state: () => Promise<BiliupResult<BiliupState>>;
  onState: (callback: (state: BiliupState) => void) => () => void;
}

export const emptyBiliupPreferences: BiliupPreferences = { directory: '', selectedAccountId: '', accounts: [], selectedTemplateId: '', templates: [], tagHistory: [] };
export const idleBiliupState: BiliupState = {
  busy: false, kind: null, phase: 'idle', logs: [], progress: null, progressText: '', qrImage: null,
};
export const newBiliupTemplate = (): BiliupTemplate => ({
  id: '', name: '', title: '', tag: '', tid: 171, copyright: 1,
  source: '', desc: '', dynamic: '', cover: '', dtime: '', line: '', limit: 3, submit: '',
  noReprint: false, dolby: false, hires: false, interactive: 0, missionId: '', isOnlySelf: '',
  chargingPay: false, upSelectionReply: false, closeReply: false, closeDanmu: false,
});

export const biliupLines = ['', 'bldsa', 'cnbldsa', 'andsa', 'atdsa', 'bda2', 'cnbd', 'anbd', 'atbd', 'tx', 'cntx', 'antx', 'attx', 'txa', 'alia', 'estx', 'akbd'];

export function validateBiliupTemplate(template: BiliupTemplate): string | null {
  if (!template || typeof template !== 'object') return 'template';
  for (const key of ['id', 'name', 'title', 'tag', 'source', 'desc', 'dynamic', 'cover', 'dtime', 'line', 'submit', 'missionId', 'isOnlySelf'] as const) {
    if (typeof template[key] !== 'string' || template[key].includes('\0') || template[key].length > 10000) return 'template';
  }
  if (!template.name.trim() || !template.title.trim() || !template.tag.trim()) return 'template';
  if (!Number.isInteger(template.tid) || template.tid < 1 || template.tid > 65535) return 'template';
  if (![1, 2].includes(template.copyright) || (template.copyright === 2 && !template.source.trim())) return 'template';
  if (!Number.isInteger(template.limit) || template.limit < 1 || template.limit > 32) return 'template';
  if (!Number.isInteger(template.interactive) || template.interactive < 0 || template.interactive > 1) return 'template';
  if (!/^\d*$/.test(template.missionId) || (template.missionId && Number(template.missionId) > 4294967295)) return 'template';
  if (!['', '0', '1'].includes(template.isOnlySelf)) return 'template';
  if (!biliupLines.includes(template.line) || !['', 'app', 'web', 'bcutandroid'].includes(template.submit)) return 'template';
  if (template.dtime && !/^\d{10}$/.test(template.dtime)) return 'schedule';
  if (splitBiliupTags(template.tag).length > BILIUP_MAX_TAGS) return 'template';
  return null;
}

export function normalizeBiliupPreferences(value: unknown): BiliupPreferences {
  if (!value || typeof value !== 'object') return { ...emptyBiliupPreferences };
  const data = value as Partial<BiliupPreferences>;
  const legacyDirectory = typeof data.directory === 'string' ? data.directory.slice(0, 4096) : '';
  const rawAccounts = Array.isArray(data.accounts) ? data.accounts : [];
  const accounts = rawAccounts.slice(0, 50).map((account, index) => {
    const item = account && typeof account === 'object' ? account as Partial<BiliupAccount> : {};
    return {
      id: typeof item.id === 'string' && item.id.trim() ? item.id.slice(0, 120) : `account-${index + 1}`,
      name: typeof item.name === 'string' && item.name.trim() ? item.name.slice(0, 120) : `Account ${index + 1}`,
      directory: typeof item.directory === 'string' ? item.directory.slice(0, 4096) : '',
    };
  });
  if (accounts.length === 0 && legacyDirectory) {
    accounts.push({ id: 'default', name: 'Default account', directory: legacyDirectory });
  }
  const selectedAccount = accounts.find((account) => account.id === data.selectedAccountId) || accounts[0];
  const templates = Array.isArray(data.templates) ? data.templates.slice(0, 100)
    .filter((t) => !validateBiliupTemplate(t) && typeof t.id === 'string' && t.id.length > 0)
    .map((t) => {
      const normalized = Object.fromEntries(Object.keys(newBiliupTemplate()).map((key) => [key, t[key as keyof BiliupTemplate]])) as unknown as BiliupTemplate;
      // Migrate the removed placeholder instead of ever submitting it literally.
      normalized.title = normalized.title.replaceAll('{filename}', '').trim();
      return normalized;
    }) : [];
  const storedTagHistory = Array.isArray(data.tagHistory) ? data.tagHistory.filter((tag): tag is string => typeof tag === 'string') : [];
  const templateTagHistory = templates.flatMap((template) => splitBiliupTags(template.tag));
  const tagHistory = mergeBiliupTags(storedTagHistory, templateTagHistory).slice(0, BILIUP_MAX_TAG_HISTORY);
  return {
    directory: selectedAccount ? selectedAccount.directory : legacyDirectory,
    selectedAccountId: selectedAccount?.id || '',
    accounts,
    selectedTemplateId: templates.some((t) => t.id === data.selectedTemplateId) ? data.selectedTemplateId! : '',
    templates,
    tagHistory,
  };
}
