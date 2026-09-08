/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  emptyBiliupPreferences, idleBiliupState, validateBiliupSchedule, validateBiliupTemplate,
  type BiliupPreferences, type BiliupState, type BiliupResult, type BiliupUploadPlan,
} from '../biliup';
import { type Language } from '../i18n';
import { BiliupModal } from './BiliupModal';

export function unwrapBiliup<T>(result: BiliupResult<T>): T {
  if (!result.ok) throw new Error(result.error || 'input');
  return result.value as T;
}
interface Appearance { language: Language; isDarkMode: boolean; themeColor: string; secondaryThemeColor: string }
interface BiliupContextValue {
  preferences: BiliupPreferences;
  state: BiliupState;
  loaded: boolean;
  autoUpload: boolean;
  error: string;
  canAutoUpload: boolean;
  open: () => void;
  setAutoUpload: (enabled: boolean) => void;
  setError: (error: string) => void;
  setAppearance: (appearance: Appearance) => void;
  save: (preferences: BiliupPreferences) => Promise<void>;
  prepare: (format: string) => Promise<BiliupUploadPlan | null>;
  upload: (plan: BiliupUploadPlan, filePath: string) => Promise<void>;
}
const BiliupContext = createContext<BiliupContextValue | null>(null);
export function useBiliup() {
  const context = useContext(BiliupContext);
  if (!context) throw new Error('BiliupProvider missing');
  return context;
}

export function BiliupProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(emptyBiliupPreferences);
  const [state, setState] = useState(idleBiliupState);
  const [loaded, setLoaded] = useState(false);
  const [autoUpload, setAutoUpload] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState('');
  const [appearance, setAppearance] = useState<Appearance>({ language: 'zh-CN', isDarkMode: false, themeColor: '#9ca4b8', secondaryThemeColor: '#ed7e96' });
  const selected = preferences.templates.find((t) => t.id === preferences.selectedTemplateId);
  const canAutoUpload = Boolean(window.electron && loaded && preferences.directory.trim() && selected && !validateBiliupTemplate(selected) && !validateBiliupSchedule(selected.dtime));

  useEffect(() => {
    if (!window.electron) return;
    let alive = true;
    let receivedState = false;
    const api = window.electron.biliup;
    const unsubscribe = api.onState((next) => { receivedState = true; if (alive) setState(next); });
    void api.load().then(unwrapBiliup).then((next) => { if (alive) { setPreferences(next); setLoaded(true); } })
      .catch(() => { if (alive) setError('settings'); });
    void api.state().then(unwrapBiliup).then((next) => { if (alive && !receivedState) setState(next); })
      .catch(() => { if (alive) setError('input'); });
    return () => { alive = false; unsubscribe(); };
  }, []);

  const save = useCallback(async (next: BiliupPreferences) => {
    if (!window.electron || !loaded) throw new Error('settings');
    setPreferences(unwrapBiliup(await window.electron.biliup.save(next)));
    setAutoUpload(false);
    setError('');
  }, [loaded]);

  const prepare = async (format: string): Promise<BiliupUploadPlan | null> => {
    if (!autoUpload) return null;
    if (!canAutoUpload || !selected) throw new Error(validateBiliupSchedule(selected?.dtime || '') || 'template');
    if (format !== 'mp4') throw new Error('file');
    const check = unwrapBiliup(await window.electron.biliup.check(preferences.directory));
    if (!check.cookieOk) throw new Error(check.error || 'cookie');
    // Snapshot the settings now: edits during a long render must not change its destination.
    return { directory: preferences.directory, template: { ...selected } };
  };
  const upload = async (plan: BiliupUploadPlan, filePath: string) => {
    setIsOpen(true);
    setError('');
    try { unwrapBiliup(await window.electron.biliup.upload({ ...plan, filePath })); }
    catch (failure) {
      const code = failure instanceof Error ? failure.message : 'upload';
      setError(code);
      throw new Error(code);
    }
  };
  const value: BiliupContextValue = {
    preferences, state, loaded, autoUpload, error, canAutoUpload, save, prepare, upload, setError, setAppearance,
    open: () => setIsOpen(true), setAutoUpload: (enabled) => setAutoUpload(enabled && canAutoUpload),
  };
  return <BiliupContext.Provider value={value}>
    {children}
    {isOpen && <BiliupModal {...appearance} onClose={() => setIsOpen(false)} />}
  </BiliupContext.Provider>;
}
