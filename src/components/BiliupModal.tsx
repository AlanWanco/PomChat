import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, Clock3, FolderOpen, ImagePlus, Info, Trash2, Upload, X } from 'lucide-react';
import {
  BILIUP_MAX_TAG_HISTORY,
  BILIUP_MAX_TAGS,
  BILIUP_VIDEO_EXTENSIONS,
  BILIUP_SCHEDULE_MAX_AHEAD_SECONDS,
  BILIUP_SCHEDULE_MIN_LEAD_SECONDS,
  biliupLines,
  isBiliupVideoPath,
  mergeBiliupTags,
  newBiliupTemplate,
  splitBiliupTags,
  validateBiliupSchedule,
  validateBiliupTemplate,
  type BiliupCheck,
  type BiliupLineTestResult,
  type BiliupTemplate,
} from '../biliup';
import { translate, type Language } from '../i18n';
import { createThemeTokens } from '../theme';
import { Tooltip } from './ui/Tooltip';
import { unwrapBiliup, useBiliup } from './BiliupContext';

interface Appearance { language: Language; isDarkMode: boolean; themeColor: string; secondaryThemeColor: string }

const BILIUP_PROJECT_URL = 'https://github.com/biliup/biliup-rs';
const BILIUP_TID_OPTIONS = [
  { id: 1, label: 'biliup.tid.animation' },
  { id: 3, label: 'biliup.tid.music' },
  { id: 4, label: 'biliup.tid.game' },
  { id: 5, label: 'biliup.tid.entertainment' },
  { id: 13, label: 'biliup.tid.anime' },
  { id: 11, label: 'biliup.tid.tv' },
  { id: 23, label: 'biliup.tid.movie' },
  { id: 36, label: 'biliup.tid.knowledge' },
  { id: 119, label: 'biliup.tid.kichiku' },
  { id: 129, label: 'biliup.tid.dance' },
  { id: 155, label: 'biliup.tid.fashion' },
  { id: 160, label: 'biliup.tid.life' },
  { id: 167, label: 'biliup.tid.guochuang' },
  { id: 177, label: 'biliup.tid.documentary' },
  { id: 181, label: 'biliup.tid.filmTv' },
  { id: 188, label: 'biliup.tid.technology' },
  { id: 211, label: 'biliup.tid.food' },
  { id: 217, label: 'biliup.tid.animals' },
  { id: 223, label: 'biliup.tid.automotive' },
  { id: 234, label: 'biliup.tid.sports' },
  { id: 17, label: 'biliup.tid.singlePlayer' },
  { id: 65, label: 'biliup.tid.onlineGame' },
  { id: 171, label: 'biliup.tid.esports' },
  { id: 172, label: 'biliup.tid.mobileGame' },
  { id: 71, label: 'biliup.tid.variety' },
  { id: 201, label: 'biliup.tid.science' },
  { id: 76, label: 'biliup.tid.foodMaking' },
] as const;

function normalizeLocalPath(value: string) {
  const path = value.trim().replace(/^(['"])(.*)\1$/s, '$2').trim();
  if (!path.toLowerCase().startsWith('file://')) return path;
  try {
    const url = new URL(path);
    const pathname = decodeURIComponent(url.pathname);
    if (url.hostname && url.hostname !== 'localhost') return `//${url.hostname}${pathname}`;
    return /^[A-Za-z]:\//.test(pathname.slice(1)) ? pathname.slice(1) : pathname;
  } catch {
    return path;
  }
}

function isVideoPath(value: string) {
  const path = normalizeLocalPath(value);
  return !/^(?:https?|blob|data):/i.test(path) && isBiliupVideoPath(path);
}

function getVideoPathFromFile(file: File | null | undefined) {
  const directPath = file && window.electron ? window.electron.getDroppedFilePath(file) : '';
  return directPath && isVideoPath(directPath) ? directPath : '';
}

function extractUriListPath(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).find((item) => item && !item.startsWith('#')) || '';
}

function extractClipboardVideoPath(event: ClipboardEvent<HTMLInputElement>) {
  const fileItem = Array.from(event.clipboardData?.items || []).find((item) => item.kind === 'file');
  const directPath = getVideoPathFromFile(fileItem?.getAsFile());
  if (directPath) return directPath;
  const uriPath = normalizeLocalPath(extractUriListPath(event.clipboardData?.getData('text/uri-list') || ''));
  if (isVideoPath(uriPath)) return uriPath;
  const textPath = normalizeLocalPath(event.clipboardData?.getData('text/plain')?.trim() || '');
  return isVideoPath(textPath) ? textPath : '';
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

function getScheduleBounds() {
  const now = Math.floor(Date.now() / 1000);
  return {
    min: Math.ceil((now + BILIUP_SCHEDULE_MIN_LEAD_SECONDS) / 60) * 60,
    max: Math.floor((now + BILIUP_SCHEDULE_MAX_AHEAD_SECONDS) / 60) * 60,
  };
}

function clampScheduleTimestamp(timestamp: number, minTimestamp: number, maxTimestamp: number) {
  const minuteTimestamp = Math.floor(timestamp / 60) * 60;
  return Math.min(maxTimestamp, Math.max(minTimestamp, minuteTimestamp));
}

interface BiliupDateTimePickerProps {
  value: string;
  minTimestamp: number;
  maxTimestamp: number;
  language: Language;
  isDarkMode: boolean;
  themeColor: string;
  secondaryThemeColor: string;
  placeholder: string;
  previousMonthLabel: string;
  nextMonthLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

function BiliupDateTimePicker({ value, minTimestamp, maxTimestamp, language, isDarkMode, themeColor, secondaryThemeColor, placeholder, previousMonthLabel, nextMonthLabel, disabled = false, onChange }: BiliupDateTimePickerProps) {
  const theme = createThemeTokens(themeColor, isDarkMode);
  const pickerRef = useRef<HTMLDivElement>(null);
  const fallbackTimestamp = clampScheduleTimestamp(minTimestamp, minTimestamp, maxTimestamp);
  const parsedTimestamp = /^\d{10}$/.test(value) && Number.isFinite(Number(value)) ? Number(value) : fallbackTimestamp;
  const currentTimestamp = clampScheduleTimestamp(parsedTimestamp, minTimestamp, maxTimestamp);
  const currentDate = new Date(currentTimestamp * 1000);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
  const inputStyle = { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text, outline: 'none', boxShadow: 'none' };
  const monthLabel = new Intl.DateTimeFormat(language === 'zh-CN' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long' }).format(viewMonth);
  const displayLabel = value
    ? new Intl.DateTimeFormat(language === 'zh-CN' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(currentDate) + ` ${padDatePart(currentDate.getHours())}:${padDatePart(currentDate.getMinutes())}`
    : placeholder;
  const weekdayLabels = language === 'zh-CN' ? ['日', '一', '二', '三', '四', '五', '六'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const minDate = new Date(minTimestamp * 1000);
  const maxDate = new Date(maxTimestamp * 1000);
  const minMonth = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const maxMonth = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const firstWeekday = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();
  const dates = Array.from({ length: firstWeekday + daysInMonth }, (_, index) => index < firstWeekday ? null : index - firstWeekday + 1);
  const updateTimestamp = (nextDate: Date) => {
    const timestamp = clampScheduleTimestamp(Math.floor(nextDate.getTime() / 1000), minTimestamp, maxTimestamp);
    onChange(String(timestamp));
  };
  const selectDate = (day: number) => {
    const nextDate = new Date(currentDate);
    nextDate.setFullYear(viewMonth.getFullYear(), viewMonth.getMonth(), day);
    updateTimestamp(nextDate);
  };
  const selectTime = (hours: number, minutes: number) => {
    const nextDate = new Date(currentDate);
    nextDate.setHours(hours, minutes, 0, 0);
    updateTimestamp(nextDate);
  };
  const canSelectTime = (hours: number, minutes: number) => {
    const nextDate = new Date(currentDate);
    nextDate.setHours(hours, minutes, 0, 0);
    const timestamp = Math.floor(nextDate.getTime() / 1000);
    return timestamp >= minTimestamp && timestamp <= maxTimestamp;
  };

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown, true);
    return () => document.removeEventListener('mousedown', handlePointerDown, true);
  }, [open]);

  return <div ref={pickerRef} className="relative min-w-0 flex-1">
    <button type="button" disabled={disabled} className="flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors focus:outline-none focus:ring-0 disabled:opacity-50" style={inputStyle} onClick={() => { if (!open) setViewMonth(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)); setOpen((previous) => !previous); }} aria-haspopup="dialog" aria-expanded={open}>
      <CalendarDays size={17} style={{ color: secondaryThemeColor }} />
      <span className={value ? '' : 'opacity-60'}>{displayLabel}</span>
    </button>
    {open && <div role="dialog" aria-label={placeholder} className="absolute left-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-3rem))] rounded-2xl border p-4 shadow-2xl" style={{ background: `linear-gradient(180deg, ${theme.panelBgElevated} 0%, ${theme.panelBg} 100%)`, borderColor: `${secondaryThemeColor}55`, color: theme.text }}>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className="rounded-lg p-2 transition-colors hover:opacity-80 focus:outline-none focus:ring-0 disabled:opacity-30" style={{ color: secondaryThemeColor }} aria-label={previousMonthLabel} disabled={viewMonth.getTime() <= minMonth.getTime()} onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}>‹</button>
        <span className="text-sm font-semibold">{monthLabel}</span>
        <button type="button" className="rounded-lg p-2 transition-colors hover:opacity-80 focus:outline-none focus:ring-0 disabled:opacity-30" style={{ color: secondaryThemeColor }} aria-label={nextMonthLabel} disabled={viewMonth.getTime() >= maxMonth.getTime()} onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}>›</button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[0.6875rem] font-medium opacity-60">{weekdayLabels.map((label) => <span key={label}>{label}</span>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {dates.map((day, index) => {
          if (day === null) return <span key={`empty-${index}`} className="h-9" />;
          const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
          const dayStart = Math.floor(date.getTime() / 1000);
          const dayEnd = dayStart + 24 * 60 * 60 - 1;
          const dayDisabled = dayEnd < minTimestamp || dayStart > maxTimestamp;
          const selected = currentDate.getFullYear() === date.getFullYear() && currentDate.getMonth() === date.getMonth() && currentDate.getDate() === date.getDate();
          const today = new Date();
          const isToday = today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth() && today.getDate() === date.getDate();
          return <button key={day} type="button" className="h-9 rounded-lg text-xs font-medium transition-colors focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-25" disabled={disabled || dayDisabled} onClick={() => selectDate(day)} style={selected ? { backgroundColor: secondaryThemeColor, color: '#ffffff', boxShadow: `0 5px 14px ${secondaryThemeColor}44` } : isToday ? { color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}14` } : { color: theme.text }}>{day}</button>;
        })}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-xl border p-2.5" style={{ backgroundColor: `${secondaryThemeColor}${isDarkMode ? '0c' : '06'}`, borderColor: `${secondaryThemeColor}33` }}>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: secondaryThemeColor }}><Clock3 size={15} />{language === 'zh-CN' ? '时间' : 'Time'}</span>
        <select aria-label={language === 'zh-CN' ? '小时' : 'Hour'} disabled={disabled} className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-0 disabled:opacity-50" style={inputStyle} value={currentDate.getHours()} onChange={(event) => selectTime(Number(event.target.value), currentDate.getMinutes())}>
          {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour} disabled={!canSelectTime(hour, currentDate.getMinutes())}>{padDatePart(hour)}</option>)}
        </select>
        <span className="text-sm opacity-60">:</span>
        <select aria-label={language === 'zh-CN' ? '分钟' : 'Minute'} disabled={disabled} className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-0 disabled:opacity-50" style={inputStyle} value={currentDate.getMinutes()} onChange={(event) => selectTime(currentDate.getHours(), Number(event.target.value))}>
          {Array.from({ length: 60 }, (_, minute) => <option key={minute} value={minute} disabled={!canSelectTime(currentDate.getHours(), minute)}>{padDatePart(minute)}</option>)}
        </select>
      </div>
      <div className="mt-3 flex items-center justify-between text-[0.6875rem] opacity-60"><span>{language === 'zh-CN' ? '可选范围' : 'Available range'}</span><span>{new Intl.DateTimeFormat(language === 'zh-CN' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }).format(minDate)} – {new Intl.DateTimeFormat(language === 'zh-CN' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }).format(maxDate)}</span></div>
    </div>}
  </div>;
}

export function BiliupDirectorySettings({ language, isDarkMode, themeColor, secondaryThemeColor }: Appearance) {
  const biliup = useBiliup();
  const t = (key: string) => translate(language, key);
  const theme = createThemeTokens(themeColor, isDarkMode);
  const accentStyle = { backgroundColor: `${secondaryThemeColor}18`, borderColor: `${secondaryThemeColor}55`, color: secondaryThemeColor };
  const [directoryDraft, setDirectoryDraft] = useState<{ base: string; value: string } | null>(null);
  const directory = directoryDraft?.base === biliup.preferences.directory ? directoryDraft.value : biliup.preferences.directory;
  const [saving, setSaving] = useState(false);
  const accounts = biliup.preferences.accounts;
  const selectedAccount = accounts.find((account) => account.id === biliup.preferences.selectedAccountId) || accounts[0];
  const savePreferences = (next: typeof biliup.preferences) => {
    setSaving(true);
    void biliup.save(next).catch((error: Error) => biliup.setError(error.message)).finally(() => setSaving(false));
  };
  const switchAccount = (id: string) => {
    const account = accounts.find((item) => item.id === id);
    if (!account) return;
    setDirectoryDraft(null);
    savePreferences({ ...biliup.preferences, selectedAccountId: account.id, directory: account.directory });
  };
  const addAccount = () => {
    const id = crypto.randomUUID();
    const account = { id, name: `${t('biliup.account.defaultName')} ${accounts.length + 1}`, directory: '' };
    savePreferences({ ...biliup.preferences, accounts: [...accounts, account], selectedAccountId: id, directory: '' });
  };
  const removeAccount = () => {
    if (!selectedAccount || accounts.length <= 1 || !window.confirm(t('biliup.account.deleteConfirm'))) return;
    const remaining = accounts.filter((account) => account.id !== selectedAccount.id);
    const next = remaining[0];
    savePreferences({ ...biliup.preferences, accounts: remaining, selectedAccountId: next.id, directory: next.directory });
  };
  const saveDirectoryValue = (value: string) => {
    if (value === biliup.preferences.directory) return;
    const nextAccounts = selectedAccount
      ? accounts.map((account) => account.id === selectedAccount.id ? { ...account, directory: value } : account)
      : value ? [{ id: 'default', name: t('biliup.account.defaultName'), directory: value }] : [];
    savePreferences({ ...biliup.preferences, accounts: nextAccounts, selectedAccountId: selectedAccount?.id || (nextAccounts[0]?.id || ''), directory: value });
  };
  const saveDirectory = () => saveDirectoryValue(directory);
  const chooseDirectory = () => void (async () => {
    if (!window.electron) return;
    try {
      const result = await window.electron.showOpenDialog({ title: t('biliup.chooseDirectory'), properties: ['openDirectory'] });
      if (!result.canceled && result.filePaths?.[0]) {
        setDirectoryDraft(null);
        saveDirectoryValue(result.filePaths[0]);
      }
    } catch (error) {
      biliup.setError(error instanceof Error ? error.message : 'settings');
    }
  })();
  return <div className="space-y-3">
    <label className="block text-xs font-medium">{t('biliup.account')}</label>
    <div className="flex min-w-0 items-center gap-2">
      {accounts.length > 0 && <select aria-label={t('biliup.account')} value={selectedAccount?.id || ''} onChange={(event) => switchAccount(event.target.value)} disabled={!window.electron || !biliup.loaded || biliup.state.busy || saving} className="my-[3px] min-w-0 flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0" style={{ background: theme.inputBg, borderColor: theme.border, color: theme.text, outline: 'none', boxShadow: 'none', colorScheme: isDarkMode ? 'dark' : 'light' }}>
        {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
      </select>}
      <button type="button" className="shrink-0 border rounded px-2.5 py-1.5 text-xs transition-opacity hover:opacity-80 disabled:opacity-40" style={accentStyle} disabled={!window.electron || !biliup.loaded || biliup.state.busy || saving} onClick={addAccount}>{t('biliup.account.add')}</button>
      <button type="button" className="shrink-0 border rounded px-2.5 py-1.5 text-xs transition-opacity hover:opacity-80 disabled:opacity-40" style={{ ...accentStyle, backgroundColor: theme.panelBgSubtle, color: theme.text }} disabled={!selectedAccount || accounts.length <= 1 || biliup.state.busy || saving} onClick={removeAccount}>{t('biliup.account.delete')}</button>
    </div>
    <label className="block text-xs font-medium">{t('biliup.directory')}</label>
    <div className="flex min-w-0 gap-2">
      <input aria-label={t('biliup.directory')} value={directory} onChange={(event) => setDirectoryDraft({ base: biliup.preferences.directory, value: event.target.value })} onBlur={saveDirectory}
        disabled={!window.electron || !biliup.loaded || biliup.state.busy || saving}
        className="my-[3px] min-w-0 flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0" style={{ background: theme.inputBg, borderColor: theme.border, color: theme.text, outline: 'none', boxShadow: 'none' }} />
      <button type="button" className="inline-flex shrink-0 items-center gap-1.5 border rounded px-3 py-2 text-xs transition-opacity hover:opacity-80 disabled:opacity-40" style={{ ...accentStyle, backgroundColor: theme.panelBgSubtle, color: theme.text }} disabled={!window.electron || !biliup.loaded || biliup.state.busy || saving} onClick={chooseDirectory}><FolderOpen size={14} />{t('biliup.chooseDirectory')}</button>
    </div>
    <p className="text-xs opacity-70">{t(window.electron ? 'biliup.directoryHint' : 'biliup.desktopOnly')}</p>
    {window.electron && <p className="text-xs opacity-70">{t('biliup.directoryLoginHint')}</p>}
    {biliup.error && <p role="alert" className="text-xs text-red-500">{t(`biliup.error.${biliup.error}`)}</p>}
  </div>;
}

export function BiliupExportControls({ language, isDarkMode, themeColor, secondaryThemeColor, isExporting, exportFormat }: { language: Language; isDarkMode: boolean; themeColor: string; secondaryThemeColor: string; isExporting: boolean; exportFormat: string }) {
  const biliup = useBiliup();
  const t = (key: string) => translate(language, key);
  const theme = createThemeTokens(themeColor, isDarkMode);
  const buttonStyle = { backgroundColor: `${secondaryThemeColor}18`, borderColor: `${secondaryThemeColor}55`, color: secondaryThemeColor };
  const templateSelectionDisabled = !window.electron || !biliup.loaded || isExporting || biliup.state.busy;
  const autoUploadDisabled = !biliup.canAutoUpload || isExporting || biliup.state.busy || exportFormat !== 'mp4';
  const selectTemplate = (id: string) => {
    void biliup.save({ ...biliup.preferences, selectedTemplateId: id }).catch((error: Error) => biliup.setError(error.message));
  };
  return <div className="space-y-3 rounded-lg border p-3 text-sm" style={{ borderColor: `${secondaryThemeColor}33`, backgroundColor: `${secondaryThemeColor}${isDarkMode ? '0c' : '06'}`, color: theme.text }}>
    <div className="flex min-w-0 gap-2">
      <select aria-label={t('biliup.templateSettings')} className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0" style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text, colorScheme: isDarkMode ? 'dark' : 'light' }} disabled={templateSelectionDisabled} value={biliup.preferences.selectedTemplateId} onChange={(event) => selectTemplate(event.target.value)}>
        <option value="">{t('biliup.newTemplate')}</option>
        {biliup.preferences.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
      </select>
      <button type="button" className="shrink-0 rounded border px-3 py-2 text-xs transition-opacity hover:opacity-80 disabled:opacity-40" style={buttonStyle} disabled={!window.electron} onClick={biliup.open}>{t('biliup.templateSettings')}</button>
    </div>
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{t('biliup.autoUpload')}</span>
      <button type="button" role="switch" aria-checked={biliup.autoUpload} aria-label={t('biliup.autoUpload')} disabled={autoUploadDisabled} onClick={() => biliup.setAutoUpload(!biliup.autoUpload)} className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition-colors duration-200 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-40" style={{ backgroundColor: biliup.autoUpload ? secondaryThemeColor : theme.panelBgSubtle, borderColor: biliup.autoUpload ? secondaryThemeColor : theme.border, boxShadow: biliup.autoUpload ? `0 4px 12px ${secondaryThemeColor}55` : 'none' }}>
        <span className="h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out" style={{ transform: biliup.autoUpload ? 'translateX(20px)' : 'translateX(0)' }} />
      </button>
    </div>
    <p className="text-xs opacity-70">{t('biliup.autoHint')}</p>
    {biliup.autoUpload && <p className="text-xs">{t('biliup.account')}: {biliup.preferences.accounts.find((item) => item.id === biliup.preferences.selectedAccountId)?.name || '—'} · {biliup.preferences.templates.find((item) => item.id === biliup.preferences.selectedTemplateId)?.name || '—'}</p>}
    {biliup.error && <p role="alert" className="text-xs text-red-500">{t(`biliup.error.${biliup.error}`)}</p>}
  </div>;
}

export function BiliupModal({ language, isDarkMode, themeColor, secondaryThemeColor, focusUpload = false, onClose }: Appearance & { focusUpload?: boolean; onClose: () => void }) {
  const biliup = useBiliup();
  const { preferences, state } = biliup;
  const t = useCallback((key: string, vars?: Record<string, string | number>) => translate(language, key, vars), [language]);
  const theme = createThemeTokens(themeColor, isDarkMode);
  const [draft, setDraft] = useState<BiliupTemplate>(() => ({ ...(preferences.templates.find((item) => item.id === preferences.selectedTemplateId) || newBiliupTemplate()) }));
  const [check, setCheck] = useState<BiliupCheck | null>(null);
  const [lineTests, setLineTests] = useState<BiliupLineTestResult[] | null>(null);
  const [working, setWorking] = useState(false);
  const [input, setInput] = useState('');
  const [countryInput, setCountryInput] = useState('86');
  const [phoneInput, setPhoneInput] = useState('');
  const [pendingPhone, setPendingPhone] = useState('');
  const [pendingSchedule, setPendingSchedule] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [uploadFilePath, setUploadFilePath] = useState('');
  const [uploadFileError, setUploadFileError] = useState('');
  const [uploadConfirmation, setUploadConfirmation] = useState<{ template: BiliupTemplate; filePath: string } | null>(null);
  const [activeUploadTitle, setActiveUploadTitle] = useState('');
  const [saved, setSaved] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const uploadSectionRef = useRef<HTMLDivElement>(null);
  const captchaViewRef = useRef<HTMLWebViewElement>(null);
  const busy = working || state.busy;
  const templateBusy = working || (state.busy && state.kind === 'login');
  const surface = { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text, outline: 'none', boxShadow: 'none', colorScheme: isDarkMode ? 'dark' : 'light' };
  const inputClass = 'w-full border rounded-md px-3 py-2 text-sm disabled:opacity-50 transition-colors focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0';
  const singleLineInputClass = `${inputClass} my-[3px]`;
  const buttonClass = 'border rounded px-3 py-2 text-xs transition-opacity hover:opacity-80 disabled:opacity-40';
  const buttonStyle = { backgroundColor: `${secondaryThemeColor}18`, borderColor: `${secondaryThemeColor}55`, color: secondaryThemeColor };
  const primaryButtonStyle = { backgroundColor: secondaryThemeColor, borderColor: secondaryThemeColor, color: '#ffffff' };

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [state.logs]);
  useEffect(() => {
    if (!focusUpload) return;
    const frame = window.requestAnimationFrame(() => uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [focusUpload]);
  useEffect(() => {
    if (import.meta.env.DEV && state.captchaStatus) console.debug('[biliup captcha]', state.captchaStatus);
  }, [state.captchaStatus]);
  useEffect(() => { if (!['country', 'phone'].includes(state.phase)) setInput(''); }, [state.phase]);
  useEffect(() => { setCheck(null); setLineTests(null); }, [preferences.directory]);
  useEffect(() => {
    if (!state.captchaUrl || !window.electron) return;
    const view = captchaViewRef.current;
    if (!view) return;
    let attached = false;
    const attach = () => {
      if (attached) return;
      try {
        const webContentsId = view.getWebContentsId();
        if (!Number.isInteger(webContentsId)) return;
        attached = true;
        void window.electron.biliup.attachCaptchaView(webContentsId).then((result) => {
          if (!result.ok) attached = false;
        });
      } catch { /* The guest webview is not attached yet. */ }
    };
    view.addEventListener('did-attach', attach);
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (attached || attempts++ > 50) { window.clearInterval(timer); return; }
      attach();
    }, 100);
    return () => { window.clearInterval(timer); view.removeEventListener('did-attach', attach); };
  }, [state.captchaUrl]);
  const requestClose = useCallback(() => {
    if (state.busy) {
      if (!window.confirm(t('biliup.closeConfirm'))) return;
      void window.electron.biliup.cancel();
    }
    onClose();
  }, [onClose, state.busy, t]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (uploadConfirmation) setUploadConfirmation(null);
      else requestClose();
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [requestClose, uploadConfirmation]);

  const perform = useCallback(async (action: () => Promise<void>) => {
    setWorking(true); biliup.setError('');
    try { await action(); } catch (error) { biliup.setError(error instanceof Error ? error.message : 'input'); }
    finally { setWorking(false); }
  }, [biliup]);
  useEffect(() => {
    if (state.phase !== 'phone' || !pendingPhone || working) return;
    const phone = pendingPhone;
    setPendingPhone('');
    void perform(async () => { unwrapBiliup(await window.electron.biliup.input('phone', phone)); });
  }, [perform, pendingPhone, state.phase, working]);
  const submitSmsContact = () => {
    const country = countryInput.trim();
    const phone = phoneInput.trim();
    if (state.phase === 'country') {
      setPendingPhone(phone);
      void perform(async () => { unwrapBiliup(await window.electron.biliup.input('country', country)); });
    } else if (state.phase === 'phone') {
      void perform(async () => { unwrapBiliup(await window.electron.biliup.input('phone', phone)); });
    }
  };
  const resetSmsInputs = () => { setCountryInput('86'); setPhoneInput(''); setPendingPhone(''); };
  const applyDetectedUsername = async (result: BiliupCheck) => {
    setCheck(result);
    const username = result.username;
    if (!username) return;
    const accountId = preferences.selectedAccountId || preferences.accounts[0]?.id || 'default';
    const currentAccount = preferences.accounts.find((account) => account.id === accountId);
    if (currentAccount && currentAccount.name === username && preferences.selectedAccountId === accountId) return;
    const accounts = preferences.accounts.length > 0
      ? preferences.accounts.map((account) => account.id === accountId ? { ...account, name: username } : account)
      : [{ id: accountId, name: username, directory: preferences.directory }];
    const account = accounts.find((item) => item.id === accountId);
    if (!account) return;
    await biliup.save({ ...preferences, accounts, selectedAccountId: accountId, directory: account.directory });
  };
  const chooseCover = () => void perform(async () => {
    if (!window.electron) return;
    const result = await window.electron.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: t('biliup.coverFiles'), extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }],
    });
    if (!result.canceled && result.filePaths?.[0]) set('cover', result.filePaths[0]);
  });
  const handleCoverPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const imageItem = Array.from(event.clipboardData?.items || []).find((item) => item.kind === 'file' && item.type.startsWith('image/'));
    const file = imageItem?.getAsFile();
    if (!file || !window.electron) return;
    event.preventDefault();
    void perform(async () => {
      const directPath = window.electron.getDroppedFilePath(file);
      if (directPath) { set('cover', directPath); return; }
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      const cachedPath = await window.electron.saveClipboardImageToCache({ bytes, contentType: file.type, preferredName: file.name });
      if (!cachedPath) throw new Error('file');
      set('cover', cachedPath);
    });
  };
  const set = <K extends keyof BiliupTemplate>(key: K, value: BiliupTemplate[K]) => { setSaved(false); setDraft((previous) => ({ ...previous, [key]: value })); };
  const textFields = ['name', 'title', 'tag', 'cover', 'dynamic', 'missionId'] as const;
  const savedTemplate = preferences.templates.find((item) => item.id === preferences.selectedTemplateId);
  const draftValidationError = validateBiliupTemplate(draft) || validateBiliupSchedule(draft.dtime);
  const canUploadDraft = Boolean(window.electron && biliup.loaded && preferences.directory.trim() && !draftValidationError);
  const showManualCaptchaInput = ['captchaChallenge', 'captchaValidate'].includes(state.phase) && ['attachFailed', 'viewClosed'].includes(state.captchaStatus);
  const selectedTags = splitBiliupTags(draft.tag);
  const addTags = (values: string[]) => {
    const next = mergeBiliupTags(selectedTags, values).slice(0, BILIUP_MAX_TAGS);
    set('tag', next.join(','));
  };
  const addTagsFromInput = () => {
    const values = splitBiliupTags(tagInput);
    if (values.length > 0) addTags(values);
    setTagInput('');
  };
  const toggleHistoryTag = (tag: string) => {
    const selected = selectedTags.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase());
    set('tag', (selected ? selectedTags.filter((item) => item.toLocaleLowerCase() !== tag.toLocaleLowerCase()) : [...selectedTags, tag].slice(0, BILIUP_MAX_TAGS)).join(','));
  };
  const removeTag = (tag: string) => set('tag', selectedTags.filter((item) => item.toLocaleLowerCase() !== tag.toLocaleLowerCase()).join(','));
  const chooseUploadFile = () => void perform(async () => {
    if (!window.electron) return;
    const result = await window.electron.showOpenDialog({ properties: ['openFile'], filters: [{ name: t('biliup.videoFiles'), extensions: [...BILIUP_VIDEO_EXTENSIONS] }] });
    if (!result.canceled && result.filePaths?.[0]) {
      const path = result.filePaths[0];
      setUploadFilePath(path);
      setUploadFileError(isVideoPath(path) ? '' : t('biliup.videoInvalid'));
    }
  });
  const handleUploadPathPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const clipboardItems = Array.from(event.clipboardData?.items || []);
    const hasFile = clipboardItems.some((item) => item.kind === 'file');
    const text = event.clipboardData?.getData('text/plain')?.trim() || '';
    const uriList = event.clipboardData?.getData('text/uri-list')?.trim() || '';
    if (!hasFile && !text && !uriList) return;
    event.preventDefault();
    const path = extractClipboardVideoPath(event);
    if (!path) {
      setUploadFilePath('');
      setUploadFileError(t('biliup.videoInvalid'));
      return;
    }
    setUploadFilePath(path);
    setUploadFileError('');
  };
  const handleUploadPathDrop = (event: DragEvent<HTMLInputElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer.files[0] || Array.from(event.dataTransfer.items).find((item) => item.kind === 'file')?.getAsFile();
    const directPath = getVideoPathFromFile(file);
    const uriPath = normalizeLocalPath(extractUriListPath(event.dataTransfer.getData('text/uri-list') || ''));
    const textPath = normalizeLocalPath(event.dataTransfer.getData('text/plain')?.trim() || '');
    const path = directPath || (isVideoPath(uriPath) ? uriPath : '') || (isVideoPath(textPath) ? textPath : '');
    if (!path) {
      setUploadFilePath('');
      setUploadFileError(t('biliup.videoInvalid'));
      return;
    }
    setUploadFilePath(path);
    setUploadFileError('');
  };
  const uploadSelectedFile = () => {
    if (!canUploadDraft || !isVideoPath(uploadFilePath)) return;
    setUploadConfirmation({ template: { ...draft }, filePath: uploadFilePath });
  };
  const confirmUpload = () => {
    if (!uploadConfirmation) return;
    const { template, filePath } = uploadConfirmation;
    setUploadConfirmation(null);
    setActiveUploadTitle(template.title);
    void perform(async () => {
      await biliup.upload({ directory: preferences.directory, template }, filePath);
    });
  };
  const testUploadLines = () => void perform(async () => {
    setLineTests(unwrapBiliup(await window.electron.biliup.testLines()));
  });
  const scheduleBounds = getScheduleBounds();
  const confirmationTid = uploadConfirmation ? BILIUP_TID_OPTIONS.find((option) => option.id === uploadConfirmation.template.tid) : undefined;
  const confirmationDetails = uploadConfirmation ? [
    { label: t('biliup.field.name'), value: uploadConfirmation.template.name || '—' },
    { label: t('biliup.field.title'), value: uploadConfirmation.template.title || '—', wide: true },
    { label: t('biliup.field.tag'), value: uploadConfirmation.template.tag || t('biliup.default'), wide: true },
    { label: t('biliup.field.desc'), value: uploadConfirmation.template.desc || t('biliup.default'), wide: true },
    { label: t('biliup.field.tid'), value: confirmationTid ? `${uploadConfirmation.template.tid} · ${t(confirmationTid.label)}` : String(uploadConfirmation.template.tid) },
    { label: t('biliup.field.copyright'), value: uploadConfirmation.template.copyright === 1 ? t('biliup.original') : t('biliup.repost') },
    ...(uploadConfirmation.template.copyright === 2 ? [{ label: t('biliup.field.source'), value: uploadConfirmation.template.source || '—', wide: true }] : []),
    { label: t('biliup.field.line'), value: uploadConfirmation.template.line || t('biliup.default') },
    { label: t('biliup.field.submit'), value: uploadConfirmation.template.submit || 'app' },
    { label: t('biliup.field.dtime'), value: uploadConfirmation.template.dtime || t('biliup.default') },
    { label: t('biliup.field.limit'), value: String(uploadConfirmation.template.limit) },
    { label: t('biliup.field.interactive'), value: uploadConfirmation.template.interactive === 1 ? t('biliup.yes') : t('biliup.no') },
    { label: t('biliup.field.isOnlySelf'), value: uploadConfirmation.template.isOnlySelf === '1' ? t('biliup.onlySelf') : t('biliup.public') },
  ] : [];

  return createPortal(<div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm" onMouseDown={(event) => event.stopPropagation()}>
    <section role="dialog" aria-modal="true" aria-label={t('biliup.settings')} className="flex w-full max-w-3xl max-h-[92vh] flex-col overflow-hidden rounded-[28px] border shadow-2xl"
      style={{ background: `linear-gradient(180deg, ${theme.panelBgElevated} 0%, ${theme.panelBg} 68%, ${secondaryThemeColor}${isDarkMode ? '12' : '08'} 100%)`, borderColor: `${secondaryThemeColor}33`, color: theme.text }}>
      <header className="flex flex-none items-start justify-between gap-4 border-b px-6 py-5" style={{ borderColor: theme.border, backgroundColor: isDarkMode ? `${themeColor}10` : `${themeColor}06` }}><div><div className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: `${secondaryThemeColor}14`, color: secondaryThemeColor, border: `1px solid ${secondaryThemeColor}24` }}>biliup</div><h2 className="text-xl font-semibold" style={{ color: theme.text }}>{t('biliup.settings')}</h2><button type="button" className="mt-1 block max-w-full truncate text-left text-xs underline decoration-current/40 underline-offset-2 transition-opacity hover:opacity-80" style={{ color: secondaryThemeColor }} onClick={() => { if (window.electron) void window.electron.openExternal(BILIUP_PROJECT_URL); }}>{BILIUP_PROJECT_URL}</button></div><button type="button" className="rounded-full p-2 transition-colors" style={{ backgroundColor: isDarkMode ? `${themeColor}16` : `${themeColor}08`, color: theme.textMuted }} aria-label={t('settings.close')} onClick={requestClose}><X size={16} /></button></header>
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto" style={{ '--podchat-scrollbar-thumb': `${secondaryThemeColor}66`, '--podchat-scrollbar-thumb-hover': `${secondaryThemeColor}99` } as React.CSSProperties}>
        <div className="space-y-5 p-6 sm:p-8">
        <BiliupDirectorySettings language={language} isDarkMode={isDarkMode} themeColor={themeColor} secondaryThemeColor={secondaryThemeColor} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} style={buttonStyle} disabled={busy || !preferences.directory || !biliup.loaded} onClick={() => void perform(async () => { await applyDetectedUsername(unwrapBiliup(await window.electron.biliup.check(preferences.directory))); })}>{t('biliup.check')}</button>
        <button type="button" className={buttonClass} style={buttonStyle} disabled={busy || !preferences.directory || !biliup.loaded} onClick={() => void perform(async () => { if (check?.cookieExists && !window.confirm(t('biliup.loginOverwriteConfirm'))) return; resetSmsInputs(); setInput(''); setCheck(null); unwrapBiliup(await window.electron.biliup.login(preferences.directory, 'qr')); })}>{t('biliup.qrLogin')}</button>
        <button type="button" className={buttonClass} style={buttonStyle} disabled={busy || !preferences.directory || !biliup.loaded} onClick={() => void perform(async () => { if (check?.cookieExists && !window.confirm(t('biliup.loginOverwriteConfirm'))) return; resetSmsInputs(); setInput(''); setCheck(null); unwrapBiliup(await window.electron.biliup.login(preferences.directory, 'sms')); })}>{t('biliup.smsLogin')}</button>
      </div>
      {check && <p className="text-sm" role="status">{check.version} · {check.cookieFile} · {t(check.cookieOk ? 'biliup.cookieValid' : `biliup.error.${check.error || 'cookie'}`)}{check.username && <> · {t('biliup.detectedUser')}: {check.username}</>}</p>}
      {state.kind === 'login' && <div className="space-y-2">
        {!['captchaChallenge', 'captchaValidate'].includes(state.phase) && <p role="status" className="text-sm" style={{ color: secondaryThemeColor }}>{t(`biliup.phase.${state.phase}`)}</p>}
        {state.qrImage && <img src={state.qrImage} alt={t('biliup.qrLogin')} className="w-56 h-56 bg-white p-2" style={{ imageRendering: 'pixelated' }} />}
        {state.captchaUrl && <div className="space-y-2 rounded-lg border p-3 text-xs" style={{ borderColor: `${secondaryThemeColor}55`, backgroundColor: `${secondaryThemeColor}0c` }}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p>{t('biliup.captchaHint')}</p>
            </div>
            <button type="button" aria-label={t('biliup.closeCaptcha')} title={t('biliup.closeCaptcha')} className="shrink-0 rounded-full p-1 transition-opacity hover:opacity-70 focus:outline-none focus:ring-0" style={{ color: theme.textMuted }} onClick={() => { void window.electron.biliup.dismissCaptchaView(); }}><X size={14} /></button>
          </div>
          <webview ref={captchaViewRef} src={state.captchaUrl} partition="persist:pomchat-biliup-captcha" className="mx-auto h-[350px] w-[350px] max-w-full rounded-md border" style={{ borderColor: theme.border }} />
          <button type="button" className={buttonClass} style={buttonStyle} onClick={() => { if (state.captchaUrl) void window.electron.openExternal(state.captchaUrl); }}>{t('biliup.openCaptcha')}</button>
          <code className="block max-h-20 select-all break-all opacity-70">{state.captchaUrl}</code>
        </div>}
        {['country', 'phone'].includes(state.phase) && <form className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]" onSubmit={(event) => { event.preventDefault(); submitSmsContact(); }}>
          <label className="space-y-1 text-xs"><span>{t('biliup.phase.country')}</span><input autoFocus={state.phase === 'country'} autoComplete="off" inputMode="numeric" aria-label={t('biliup.phase.country')} value={countryInput} disabled={state.phase !== 'country' || working} onChange={(event) => setCountryInput(event.target.value)} className={singleLineInputClass} style={surface} /></label>
          <label className="space-y-1 text-xs"><span>{t('biliup.phase.phone')}</span><input autoFocus={state.phase === 'phone'} autoComplete="off" inputMode="tel" aria-label={t('biliup.phase.phone')} value={phoneInput} disabled={working} onChange={(event) => setPhoneInput(event.target.value)} className={singleLineInputClass} style={surface} /></label>
          <button type="submit" aria-label={t('biliup.send')} title={t('biliup.send')} className={`${buttonClass} inline-flex h-9 w-10 items-center justify-center !px-0`} style={buttonStyle} disabled={working || !countryInput.trim() || !phoneInput.trim()}><Check size={16} strokeWidth={2.5} /></button>
        </form>}
        {(state.phase === 'code' || showManualCaptchaInput) && <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const value = input; setInput(''); void perform(async () => { unwrapBiliup(await window.electron.biliup.input(state.phase, value)); }); }}>
          <input autoFocus autoComplete="off" inputMode={state.phase === 'code' ? 'numeric' : 'text'} aria-label={t(`biliup.phase.${state.phase}`)} value={input} onChange={(event) => setInput(event.target.value)} className={singleLineInputClass} style={surface} />
          <button type="submit" className={buttonClass} style={buttonStyle} disabled={working || !input}>{t('biliup.send')}</button>
        </form>}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs opacity-70">{t('biliup.loginHint')}</p>
          <button type="button" className={`${buttonClass} shrink-0`} style={buttonStyle} disabled={!state.busy} onClick={() => { void window.electron.biliup.cancel(); }}>{t('biliup.cancelLogin')}</button>
        </div>
      </div>}
      <hr style={{ borderColor: theme.border }} />
      <div className="flex gap-2">
        <select aria-label={t('biliup.templateSettings')} className={singleLineInputClass} style={surface} value={draft.id} disabled={templateBusy} onChange={(event) => {
          setSaved(false); setPendingSchedule(null); setDraft({ ...(preferences.templates.find((item) => item.id === event.target.value) || newBiliupTemplate()) });
        }}>
          <option value="">{t('biliup.newTemplate')}</option>
          {preferences.templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <Tooltip content={t('biliup.delete')} placement="top" width={96} backgroundColor={isDarkMode ? 'rgba(17, 24, 39, 0.94)' : 'rgba(255, 255, 255, 0.96)'} borderColor={`${secondaryThemeColor}55`} textColor={theme.text} className="inline-flex shrink-0">
          <button type="button" aria-label={t('biliup.delete')} title={t('biliup.delete')} className="inline-flex h-9 w-9 items-center justify-center rounded-md border transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40" style={{ backgroundColor: `${secondaryThemeColor}12`, borderColor: `${secondaryThemeColor}44`, color: secondaryThemeColor }} disabled={templateBusy || !draft.id} onClick={() => void perform(async () => {
            if (!window.confirm(t('biliup.deleteConfirm'))) return;
            await biliup.save({ ...preferences, templates: preferences.templates.filter((item) => item.id !== draft.id), selectedTemplateId: preferences.selectedTemplateId === draft.id ? '' : preferences.selectedTemplateId });
            setDraft(newBiliupTemplate());
          })}><Trash2 size={16} /></button>
        </Tooltip>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {textFields.map((key) => {
          if (key === 'cover') return <label key={key} className="space-y-1 text-xs sm:col-span-2"><span>{t(`biliup.field.${key}`)}</span>
            <div className="flex min-w-0 gap-2">
              <input className={`${singleLineInputClass} min-w-0 flex-1`} style={surface} disabled={templateBusy} value={draft[key]} onChange={(event) => set(key, event.target.value)} onPaste={handleCoverPaste} />
              <button type="button" className={`${buttonClass} inline-flex shrink-0 items-center gap-1.5`} style={buttonStyle} disabled={templateBusy || !window.electron} onClick={chooseCover}><ImagePlus size={14} />{t('biliup.chooseCover')}</button>
            </div>
          </label>;
          if (key === 'tag') return <label key={key} className="space-y-1 text-xs sm:col-span-2"><div className="flex items-center justify-between gap-2"><span>{t(`biliup.field.${key}`)}</span><span className="opacity-70">{t('biliup.tagCount', { count: selectedTags.length, max: BILIUP_MAX_TAGS })}</span></div>
            <div className="flex min-h-[2.75rem] flex-wrap items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors focus-within:border-current" style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}>
              {selectedTags.map((tag) => <span key={tag.toLocaleLowerCase()} className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-xs" style={{ backgroundColor: `${secondaryThemeColor}18`, border: `1px solid ${secondaryThemeColor}44`, color: secondaryThemeColor }}><span className="max-w-[15rem] truncate">{tag}</span><button type="button" className="rounded-full p-0.5 transition-opacity hover:opacity-70 focus:outline-none focus:ring-0" aria-label={`${t('biliup.tagRemove')}: ${tag}`} disabled={templateBusy} onClick={() => removeTag(tag)}><X size={12} /></button></span>)}
              <input value={tagInput} disabled={templateBusy || selectedTags.length >= BILIUP_MAX_TAGS} placeholder={selectedTags.length >= BILIUP_MAX_TAGS ? '' : t('biliup.tagPlaceholder')} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTagsFromInput(); } }} className="min-w-[10rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none placeholder:opacity-50" />
            </div>
            <p className="opacity-70">{t('biliup.tagHint')}</p>
            <div className="space-y-1.5"><span className="block opacity-70">{t('biliup.tagHistory')}</span><div className="flex flex-wrap gap-1.5">{preferences.tagHistory.length > 0 ? preferences.tagHistory.map((tag) => { const selected = selectedTags.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase()); return <button key={tag.toLocaleLowerCase()} type="button" className="rounded-full border px-2.5 py-1 text-xs transition-colors focus:outline-none focus:ring-0 disabled:opacity-40" disabled={templateBusy} onClick={() => toggleHistoryTag(tag)} style={selected ? { backgroundColor: secondaryThemeColor, borderColor: secondaryThemeColor, color: '#ffffff' } : { backgroundColor: theme.panelBgSubtle, borderColor: theme.border, color: theme.textMuted }}>{tag}</button>; }) : <span className="opacity-50">—</span>}</div></div>
          </label>;
          return <label key={key} className="space-y-1 text-xs"><span>{t(`biliup.field.${key}`)}</span>
            <input className={singleLineInputClass} style={surface} disabled={templateBusy} value={draft[key]} onChange={(event) => set(key, event.target.value)} />
          </label>;
        })}
        <label className="text-xs space-y-1 sm:col-span-2"><span>{t('biliup.field.dtime')}</span>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <BiliupDateTimePicker value={pendingSchedule ?? draft.dtime} minTimestamp={scheduleBounds.min} maxTimestamp={scheduleBounds.max} language={language} isDarkMode={isDarkMode} themeColor={themeColor} secondaryThemeColor={secondaryThemeColor} placeholder={t('biliup.schedulePlaceholder')} previousMonthLabel={t('biliup.previousMonth')} nextMonthLabel={t('biliup.nextMonth')} disabled={templateBusy} onChange={(value) => setPendingSchedule(value)} />
              <button type="button" className={`${buttonClass} shrink-0`} style={buttonStyle} disabled={templateBusy || (pendingSchedule === null && !draft.dtime)} onClick={() => setPendingSchedule('')}>{t('biliup.clearSchedule')}</button>
            </div>
            <button type="button" className={`${buttonClass} w-full !rounded-full py-2`} style={pendingSchedule !== null ? primaryButtonStyle : buttonStyle} disabled={templateBusy || pendingSchedule === null} onClick={() => { if (pendingSchedule === null) return; set('dtime', pendingSchedule); setPendingSchedule(null); }}>{t('biliup.confirmSchedule')}</button>
          </div>
          <span className="block opacity-70">{t('biliup.scheduleHint')}</span>
        </label>
        <label className="space-y-1 text-xs"><span className="flex min-h-4 items-center gap-1">{t('biliup.field.tid')}<Tooltip content={t('biliup.tidHint')} placement="top" width={360} backgroundColor={isDarkMode ? 'rgba(17, 24, 39, 0.94)' : 'rgba(255, 255, 255, 0.96)'} borderColor={`${secondaryThemeColor}55`} textColor={theme.text}><span tabIndex={0} className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full p-0 focus:outline-none" style={{ color: secondaryThemeColor }}><Info size={13} /></span></Tooltip></span>
          <select className={singleLineInputClass} style={surface} disabled={templateBusy} value={draft.tid} onChange={(event) => set('tid', Number(event.target.value))}>
            {!BILIUP_TID_OPTIONS.some((option) => option.id === draft.tid) && <option value={draft.tid}>{t('biliup.tidCurrent', { id: draft.tid })}</option>}
            {BILIUP_TID_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.id} · {t(option.label)}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs"><span className="flex min-h-4 items-center gap-1">{t('biliup.field.limit')}<Tooltip content={t('biliup.limitHint')} placement="top" width={300} backgroundColor={isDarkMode ? 'rgba(17, 24, 39, 0.94)' : 'rgba(255, 255, 255, 0.96)'} borderColor={`${secondaryThemeColor}55`} textColor={theme.text}><span tabIndex={0} className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full p-0 focus:outline-none" style={{ color: secondaryThemeColor }}><Info size={13} /></span></Tooltip></span>
          <input type="number" min={1} max={32} className={singleLineInputClass} style={surface} disabled={templateBusy} value={draft.limit} onChange={(event) => set('limit', Number(event.target.value))} />
        </label>
        <button type="button" role="switch" aria-checked={draft.interactive === 1} aria-label={t('biliup.field.interactive')} disabled={templateBusy} onClick={() => set('interactive', draft.interactive === 1 ? 0 : 1)} className="flex min-h-[2.5rem] w-full items-center justify-between gap-2 self-end rounded-md border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50" style={{ backgroundColor: draft.interactive === 1 ? `${secondaryThemeColor}14` : theme.panelBgSubtle, borderColor: draft.interactive === 1 ? `${secondaryThemeColor}55` : theme.border, color: theme.text }}>
          <span className="flex min-h-4 items-center gap-1 text-left">{t('biliup.field.interactive')}<Tooltip content={t('biliup.interactiveHint')} placement="top" width={300} backgroundColor={isDarkMode ? 'rgba(17, 24, 39, 0.94)' : 'rgba(255, 255, 255, 0.96)'} borderColor={`${secondaryThemeColor}55`} textColor={theme.text}><span tabIndex={0} className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full p-0 focus:outline-none" style={{ color: secondaryThemeColor }}><Info size={13} /></span></Tooltip></span>
          <span className="shrink-0 opacity-70">{draft.interactive === 1 ? t('biliup.yes') : t('biliup.no')}</span>
        </button>
        <div className="text-xs space-y-1"><span className="block">{t('biliup.field.isOnlySelf')}</span>
          <div role="radiogroup" aria-label={t('biliup.field.isOnlySelf')} className="relative flex overflow-hidden rounded-lg border p-1" style={{ backgroundColor: theme.inputBg, borderColor: theme.border }}>
            <span aria-hidden="true" className="pointer-events-none absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-md transition-transform duration-200 ease-out" style={{ backgroundColor: secondaryThemeColor, boxShadow: `0 4px 12px ${secondaryThemeColor}44`, transform: draft.isOnlySelf === '1' ? 'translateX(100%)' : 'translateX(0)' }} />
            <label className="relative z-10 flex-1 cursor-pointer rounded-md px-3 py-2 text-center transition-colors duration-200 focus-within:outline-none" style={draft.isOnlySelf !== '1' ? { color: '#ffffff' } : { color: theme.textMuted }}>
              <input type="radio" name="biliup-visibility" value="public" checked={draft.isOnlySelf !== '1'} disabled={templateBusy} onChange={() => set('isOnlySelf', '')} className="sr-only" />{t('biliup.public')}
            </label>
            <label className="relative z-10 flex-1 cursor-pointer rounded-md px-3 py-2 text-center transition-colors duration-200 focus-within:outline-none" style={draft.isOnlySelf === '1' ? { color: '#ffffff' } : { color: theme.textMuted }}>
              <input type="radio" name="biliup-visibility" value="only-self" checked={draft.isOnlySelf === '1'} disabled={templateBusy} onChange={() => set('isOnlySelf', '1')} className="sr-only" />{t('biliup.onlySelf')}
            </label>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
          <div className="space-y-1 text-xs"><span className="block">{t('biliup.field.copyright')}</span>
            <div className="relative flex overflow-hidden rounded-lg border p-1" style={{ backgroundColor: theme.inputBg, borderColor: theme.border }} role="group" aria-label={t('biliup.field.copyright')}>
              <span aria-hidden="true" className="pointer-events-none absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-md transition-transform duration-200 ease-out" style={{ backgroundColor: secondaryThemeColor, boxShadow: `0 4px 12px ${secondaryThemeColor}44`, transform: draft.copyright === 2 ? 'translateX(100%)' : 'translateX(0)' }} />
              {([1, 2] as const).map((value) => <button key={value} type="button" aria-pressed={draft.copyright === value} className="relative z-10 flex-1 rounded-md px-3 py-2 transition-colors duration-200 focus:outline-none focus:ring-0" style={draft.copyright === value ? { color: '#ffffff' } : { color: theme.textMuted }} disabled={templateBusy} onClick={() => { set('copyright', value); if (value === 1) set('source', ''); }}>{value === 1 ? t('biliup.original') : t('biliup.repost')}</button>)}
            </div>
          </div>
          <label className="space-y-1 text-xs"><span>{t('biliup.field.source')}</span><input className={singleLineInputClass} style={{ ...surface, opacity: draft.copyright === 2 ? 1 : 0.5 }} disabled={templateBusy || draft.copyright !== 2} value={draft.source} onChange={(event) => set('source', event.target.value)} /></label>
        </div>
        <label className="space-y-1 text-xs"><span className="flex min-h-4 items-center gap-1">{t('biliup.field.line')}<Tooltip content={t('biliup.lineHint')} placement="top" width={300} backgroundColor={isDarkMode ? 'rgba(17, 24, 39, 0.94)' : 'rgba(255, 255, 255, 0.96)'} borderColor={`${secondaryThemeColor}55`} textColor={theme.text}><span tabIndex={0} className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full p-0 focus:outline-none" style={{ color: secondaryThemeColor }}><Info size={13} /></span></Tooltip></span>
          <div className="flex min-w-0 gap-2">
            <select className={`${singleLineInputClass} min-w-0 flex-1`} style={surface} disabled={templateBusy} value={draft.line} onChange={(event) => set('line', event.target.value)}>
              {biliupLines.map((line) => <option key={line} value={line}>{line || t('biliup.default')}</option>)}
            </select>
            <button type="button" className={`${buttonClass} shrink-0`} style={buttonStyle} disabled={templateBusy || !window.electron} onClick={testUploadLines}>{t('biliup.testLines')}</button>
          </div>
          {lineTests && <div className="space-y-1 rounded-md border p-2 text-[0.6875rem]" style={{ borderColor: theme.border, backgroundColor: theme.panelBgSubtle }}>
            <p className="opacity-70">{t('biliup.lineTestHint')}</p>
            {lineTests.map((result) => <div key={result.name} className="flex items-center justify-between gap-2"><span>{result.name}</span><span style={{ color: result.ok ? secondaryThemeColor : theme.textMuted }}>{result.ok ? `✓ ${result.status ?? 0} · ${result.elapsedMs ?? 0} ms` : `✕ ${t(result.error === 'tls' ? 'biliup.lineTestTls' : 'biliup.lineTestNetwork')}`}</span></div>)}
          </div>}
        </label>
        <label className="text-xs space-y-1"><span className="flex min-h-4 items-center gap-1">{t('biliup.field.submit')}<Tooltip content={t('biliup.submitHint')} placement="top" width={300} backgroundColor={isDarkMode ? 'rgba(17, 24, 39, 0.94)' : 'rgba(255, 255, 255, 0.96)'} borderColor={`${secondaryThemeColor}55`} textColor={theme.text}><span tabIndex={0} className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full p-0 focus:outline-none" style={{ color: secondaryThemeColor }}><Info size={13} /></span></Tooltip></span><select className={singleLineInputClass} style={surface} disabled={templateBusy} value={draft.submit} onChange={(event) => set('submit', event.target.value as BiliupTemplate['submit'])}>
          <option value="app">app</option></select></label>
      </div>
      <label className="block text-xs space-y-1"><span>{t('biliup.field.desc')}</span><textarea rows={3} className={`${inputClass} my-[3px]`} style={surface} disabled={templateBusy} value={draft.desc} onChange={(event) => set('desc', event.target.value)} /></label>
      <div className="flex flex-wrap gap-3 text-xs">{(['noReprint', 'dolby', 'hires', 'chargingPay', 'upSelectionReply', 'closeReply', 'closeDanmu'] as const).map((key) => <label key={key} className="flex gap-1 items-center">
        <input type="checkbox" disabled={templateBusy} checked={draft[key]} onChange={(event) => set(key, event.target.checked)} />{t(`biliup.field.${key}`)}</label>)}</div>
      <p className="text-xs opacity-70">{t('biliup.templateHint')}</p>
      <div className="space-y-3">
        <div className="space-y-2">
          <button type="button" className={`${buttonClass} w-full !rounded-full py-2.5`} style={primaryButtonStyle} disabled={busy || !biliup.loaded} onClick={() => void perform(async () => {
            const error = validateBiliupTemplate(draft) || validateBiliupSchedule(draft.dtime); if (error) throw new Error(error);
            const next = { ...draft, id: draft.id || crypto.randomUUID() };
            const tagHistory = mergeBiliupTags(splitBiliupTags(next.tag), preferences.tagHistory).slice(0, BILIUP_MAX_TAG_HISTORY);
            await biliup.save({ ...preferences, selectedTemplateId: next.id, templates: [...preferences.templates.filter((item) => item.id !== next.id), next], tagHistory });
            setDraft(next); setSaved(true);
          })}>{t('biliup.saveTemplate')}</button>
          {saved && <p className="text-center text-xs" style={{ color: secondaryThemeColor }}>{t('biliup.saved')}</p>}
        </div>
        <hr className="my-[27px]" style={{ borderColor: theme.border }} />
        <div className="flex min-w-0 flex-col gap-2">
          <div className="text-sm font-medium">{t('biliup.uploadVideo')}</div>
          <div className="flex min-w-0 gap-2">
            <input value={uploadFilePath} placeholder={t('biliup.videoPlaceholder')} title={uploadFilePath} onChange={(event) => { setUploadFilePath(event.target.value); setUploadFileError(''); }} onPaste={handleUploadPathPaste} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }} onDrop={handleUploadPathDrop} className={`${singleLineInputClass} min-w-0 flex-1`} style={surface} />
            <button type="button" className={`${buttonClass} inline-flex shrink-0 items-center gap-1.5`} style={buttonStyle} disabled={busy || !window.electron} onClick={chooseUploadFile}><FolderOpen size={14} />{t('biliup.chooseVideo')}</button>
          </div>
          <button type="button" className={`${buttonClass} w-full !rounded-full py-2.5`} style={buttonStyle} disabled={busy || !canUploadDraft || !isVideoPath(uploadFilePath) || Boolean(uploadFileError)} onClick={uploadSelectedFile}>{t('biliup.uploadSelectedFile')}</button>
        </div>
        {uploadFileError && <p className="text-xs text-red-500">{uploadFileError}</p>}
        <p className="text-xs opacity-70">{t('biliup.uploadHint')}</p>
      </div>
      <p className="text-xs opacity-70">{t('biliup.activeTemplate')}: {draft.name || '—'}</p>
      <div ref={uploadSectionRef} className="space-y-2">
        <div className="flex justify-between text-sm"><span>{t('biliup.console')}</span><span>{state.kind === 'upload' && state.phase === 'success' ? t('biliup.uploadSuccess') : t(`biliup.phase.${state.phase}`)}</span></div>
        {state.kind === 'upload' && <>
          <div role="progressbar" aria-label={t('biliup.progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.progress ?? undefined} className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: theme.panelBgSubtle }}>
            <div className="h-full rounded-full transition-[width]" style={{ width: `${state.progress ?? 0}%`, backgroundColor: secondaryThemeColor, boxShadow: `0 0 12px ${secondaryThemeColor}66` }} />
          </div>
          <p className="text-xs font-mono" style={{ color: theme.textMuted }}>{state.progress === null ? t('biliup.waitProgress') : <>{state.progress.toFixed(1)}%{state.progressText && <span className="ml-2 opacity-80">{state.progressText}</span>}</>}</p>
        </>}
        <pre ref={logRef} role="log" aria-label={t('biliup.console')} className="h-40 select-text overflow-auto whitespace-pre-wrap break-all rounded p-3 text-xs font-mono border" style={{ backgroundColor: theme.appBg, borderColor: theme.border, color: theme.textMuted }}>{state.logs.join('\n') || t('biliup.consoleHint')}</pre>
        {state.error && <p role="alert" className="text-sm text-red-500">{t(`biliup.error.${state.error}`)}</p>}
        {state.bvid && <p className="text-sm select-text">{[state.bvid, activeUploadTitle || savedTemplate?.title].filter(Boolean).join(' · ')}</p>}
        <button className={`${buttonClass} w-full !rounded-full py-2.5`} style={buttonStyle} disabled={!state.busy} onClick={() => void perform(async () => { unwrapBiliup(await window.electron.biliup.cancel()); })}>{t('biliup.cancel')}</button>
        </div>
        </div>
      </div>
    </section>
    {uploadConfirmation && <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm" onMouseDown={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) setUploadConfirmation(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="biliup-upload-confirm-title" className="flex w-full max-w-2xl max-h-[86vh] flex-col overflow-hidden rounded-[26px] border shadow-2xl" style={{ background: `linear-gradient(180deg, ${theme.panelBgElevated} 0%, ${theme.panelBg} 100%)`, borderColor: `${secondaryThemeColor}44`, color: theme.text }} onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex flex-none items-start justify-between gap-4 border-b px-6 py-5" style={{ borderColor: theme.border, backgroundColor: isDarkMode ? `${themeColor}10` : `${themeColor}06` }}>
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: `${secondaryThemeColor}18`, border: `1px solid ${secondaryThemeColor}35`, color: secondaryThemeColor }}><Upload size={18} /></span>
            <div className="min-w-0">
              <h3 id="biliup-upload-confirm-title" className="text-xl font-semibold">{t('biliup.uploadConfirmTitle')}</h3>
              <p className="mt-1 text-sm" style={{ color: theme.textMuted }}>{t('biliup.uploadConfirm')}</p>
            </div>
          </div>
          <button type="button" className="rounded-full p-2 transition-colors hover:opacity-75" style={{ backgroundColor: isDarkMode ? `${themeColor}16` : `${themeColor}08`, color: theme.textMuted }} aria-label={t('settings.close')} onClick={() => setUploadConfirmation(null)}><X size={16} /></button>
        </header>
        <div className="min-h-0 space-y-4 overflow-y-auto p-6">
          <div className="rounded-2xl border p-4" style={{ borderColor: `${secondaryThemeColor}35`, backgroundColor: `${secondaryThemeColor}${isDarkMode ? '0c' : '06'}` }}>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: secondaryThemeColor }}><span className="inline-flex h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: `${secondaryThemeColor}20` }}><Check size={13} /></span>{t('biliup.uploadConfirmConfig')}</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {confirmationDetails.map((item) => <div key={item.label} className={item.wide ? 'sm:col-span-2' : ''}>
                <div className="mb-1 text-xs" style={{ color: theme.textMuted }}>{item.label}</div>
                <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-xl border px-3 py-2 text-sm break-words" style={{ backgroundColor: theme.inputBg, borderColor: theme.border }}>{item.value}</div>
              </div>)}
            </div>
          </div>
          <div className="rounded-2xl border p-4" style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Upload size={15} style={{ color: secondaryThemeColor }} />{t('biliup.uploadConfirmFile')}</div>
            <div className="rounded-xl border px-3 py-3 text-sm leading-6 break-all font-mono" style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}>{uploadConfirmation.filePath}</div>
          </div>
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:justify-end" style={{ borderColor: theme.border, backgroundColor: isDarkMode ? `${themeColor}08` : `${themeColor}04` }}>
          <button type="button" className="inline-flex items-center justify-center rounded-full border px-5 py-2.5 text-sm transition-opacity hover:opacity-80" style={{ backgroundColor: theme.panelBgSubtle, borderColor: theme.border, color: theme.text }} onClick={() => setUploadConfirmation(null)}>{t('biliup.editUpload')}</button>
          <button type="button" className="inline-flex items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40" style={primaryButtonStyle} disabled={busy} onClick={confirmUpload}><Check size={15} />{t('biliup.confirmUpload')}</button>
        </footer>
      </section>
    </div>}
  </div>, document.body);
}
