/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  emptyBiliupPreferences, idleBiliupState, validateBiliupSchedule, validateBiliupTemplate,
  type BiliupPreferences, type BiliupUploadPlan,
} from '../biliup';
import { translate } from '../i18n';
import { BiliupContext, type BiliupAppearance, type BiliupContextValue, unwrapBiliup } from './BiliupContext';
import { BiliupModal } from './BiliupModal';

// Keep the old import path available during Vite HMR and for existing consumers.
export { unwrapBiliup, useBiliup } from './BiliupContext';

type Appearance = BiliupAppearance;

export function BiliupProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(emptyBiliupPreferences);
  const [state, setState] = useState(idleBiliupState);
  const [loaded, setLoaded] = useState(false);
  const [autoUpload, setAutoUploadState] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [focusUpload, setFocusUpload] = useState(false);
  const [error, setError] = useState('');
  const notifiedUploadBvid = useRef('');
  const [appearance, setAppearance] = useState<Appearance>({ language: 'zh-CN', isDarkMode: false, themeColor: '#9ca4b8', secondaryThemeColor: '#ed7e96' });
  const selected = preferences.templates.find((t) => t.id === preferences.selectedTemplateId);
  const canAutoUpload = Boolean(window.electron && loaded && preferences.directory.trim() && selected && !validateBiliupTemplate(selected) && !validateBiliupSchedule(selected.dtime));

  useEffect(() => {
    if (!window.electron) return;
    let alive = true;
    let receivedState = false;
    const api = window.electron.biliup;
    const unsubscribe = api.onState((next) => { receivedState = true; if (alive) setState(next); });
    void api.load().then(unwrapBiliup).then((next) => { if (alive) { setPreferences(next); setAutoUploadState(next.autoUpload); setLoaded(true); } })
      .catch(() => { if (alive) setError('settings'); });
    void api.state().then(unwrapBiliup).then((next) => { if (alive && !receivedState) setState(next); })
      .catch(() => { if (alive) setError('input'); });
    return () => { alive = false; unsubscribe(); };
  }, []);

  const save = useCallback(async (next: BiliupPreferences) => {
    if (!window.electron || !loaded) throw new Error('settings');
    const normalized = unwrapBiliup(await window.electron.biliup.save(next));
    setPreferences(normalized);
    setAutoUploadState(normalized.autoUpload);
    setError('');
  }, [loaded]);
  const setAutoUpload = useCallback((enabled: boolean) => {
    const nextEnabled = enabled && canAutoUpload;
    const previousEnabled = preferences.autoUpload;
    setAutoUploadState(nextEnabled);
    if (!window.electron || !loaded) return;
    void save({ ...preferences, autoUpload: nextEnabled }).catch((failure) => {
      setAutoUploadState(previousEnabled);
      setError(failure instanceof Error ? failure.message : 'settings');
    });
  }, [canAutoUpload, loaded, preferences, save]);

  useEffect(() => {
    if (state.kind !== 'upload') return;
    if (state.phase === 'uploading') {
      notifiedUploadBvid.current = '';
      return;
    }
    if (state.phase !== 'success' || !state.bvid || notifiedUploadBvid.current === state.bvid || !window.electron) return;
    notifiedUploadBvid.current = state.bvid;
    void window.electron.showNotification({ title: 'PomChat', body: translate(appearance.language, 'biliup.uploadSuccess') }).catch(() => {});
  }, [appearance.language, state.bvid, state.kind, state.phase]);

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
    setFocusUpload(true);
    setIsOpen(true);
    setError('');
    try {
      unwrapBiliup(await window.electron.biliup.upload({ ...plan, filePath }));
    }
    catch (failure) {
      const code = failure instanceof Error ? failure.message : 'upload';
      setError(code);
      throw new Error(code);
    }
  };
  const value: BiliupContextValue = {
    preferences, state, loaded, autoUpload, error, canAutoUpload, save, prepare, upload, setError, setAppearance,
    open: () => { setFocusUpload(false); setIsOpen(true); }, setAutoUpload,
  };
  return <BiliupContext.Provider value={value}>
    {children}
    {isOpen && <BiliupModal {...appearance} focusUpload={focusUpload} onClose={() => { setIsOpen(false); setFocusUpload(false); }} />}
  </BiliupContext.Provider>;
}
