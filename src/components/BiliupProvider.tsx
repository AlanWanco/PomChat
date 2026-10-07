/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  emptyBiliupPreferences, getBiliupPostUploadOptions, idleBiliupState, validateBiliupSchedule, validateBiliupTemplate,
  type BiliupPreferences, type BiliupState, type BiliupUploadPlan,
} from '../biliup';
import { translate } from '../i18n';
import { BiliupActionsContext, BiliupContext, BiliupFlowStateContext, BiliupProgressContext, type BiliupActionsContextValue, type BiliupAppearance, type BiliupContextValue, type BiliupFlowState, type BiliupProgressState, unwrapBiliup } from './BiliupContext';
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
  const stateRef = useRef(state);
  const updateState = useCallback((next: BiliupState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  const selected = preferences.templates.find((t) => t.id === preferences.selectedTemplateId);
  const canAutoUpload = Boolean(window.electron && loaded && preferences.directory.trim() && selected && !validateBiliupTemplate(selected) && !validateBiliupSchedule(selected.dtime));

  useEffect(() => {
    if (!window.electron) return;
    let alive = true;
    let receivedState = false;
    const api = window.electron.biliup;
    const unsubscribe = api.onState((next) => { receivedState = true; if (alive) updateState(next); });
    void api.load().then(unwrapBiliup).then((next) => { if (alive) { setPreferences(next); setAutoUploadState(next.autoUpload); setLoaded(true); } })
      .catch(() => { if (alive) setError('settings'); });
    void api.state().then(unwrapBiliup).then((next) => { if (alive && !receivedState) updateState(next); })
      .catch(() => { if (alive) setError('input'); });
    return () => { alive = false; unsubscribe(); };
  }, [updateState]);

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

  const getState = useCallback(() => stateRef.current, []);
  const open = useCallback(() => {
    const current = stateRef.current;
    setFocusUpload(current.kind === 'upload' && current.busy);
    setIsOpen(true);
  }, []);
  const prepare = useCallback(async (format: string, projectName = ''): Promise<BiliupUploadPlan | null> => {
    if (!autoUpload) return null;
    if (!canAutoUpload || !selected) throw new Error(validateBiliupSchedule(selected?.dtime || '') || 'template');
    if (format !== 'mp4') throw new Error('file');
    const check = unwrapBiliup(await window.electron.biliup.check(preferences.directory));
    if (!check.cookieOk) throw new Error(check.error || 'cookie');
    // Snapshot the settings now: edits during a long render must not change its destination.
    return {
      directory: preferences.directory,
      template: { ...selected },
      postUpload: getBiliupPostUploadOptions(preferences, projectName, appearance.language),
    };
  }, [appearance.language, autoUpload, canAutoUpload, preferences, selected]);
  const upload = useCallback(async (plan: BiliupUploadPlan, filePath: string) => {
    setFocusUpload(true);
    setIsOpen(true);
    setError('');
    try {
      const postUpload = plan.postUpload || getBiliupPostUploadOptions(preferences, '', appearance.language);
      unwrapBiliup(await window.electron.biliup.upload({ ...plan, filePath, postUpload }));
    }
    catch (failure) {
      const code = failure instanceof Error ? failure.message : 'upload';
      setError(code);
      throw new Error(code);
    }
  }, [appearance.language, preferences]);
  const actionsValue = useMemo<BiliupActionsContextValue>(() => ({
    preferences, loaded, autoUpload, error, canAutoUpload, open, setAutoUpload, setError, setAppearance, save, prepare, upload, getState,
  }), [preferences, loaded, autoUpload, error, canAutoUpload, open, setAutoUpload, save, prepare, upload, getState]);
  const flowState = useMemo<BiliupFlowState>(() => ({
    busy: state.busy,
    kind: state.kind,
    phase: state.phase,
    qrImage: state.qrImage,
    captchaUrl: state.captchaUrl,
    captchaStatus: state.captchaStatus,
    error: state.error,
    bvid: state.bvid,
  }), [state.busy, state.kind, state.phase, state.qrImage, state.captchaUrl, state.captchaStatus, state.error, state.bvid]);
  const progressState = useMemo<BiliupProgressState>(() => ({
    logs: state.logs,
    progress: state.progress,
    progressText: state.progressText,
  }), [state.logs, state.progress, state.progressText]);
  const value = useMemo<BiliupContextValue>(() => ({
    ...actionsValue,
    state,
  }), [actionsValue, state]);
  const closeModal = useCallback(() => {
    setIsOpen(false);
    setFocusUpload(false);
  }, []);
  return <BiliupActionsContext.Provider value={actionsValue}>
    <BiliupFlowStateContext.Provider value={flowState}>
      <BiliupProgressContext.Provider value={progressState}>
        <BiliupContext.Provider value={value}>
          {children}
          {isOpen && <BiliupModal {...appearance} focusUpload={focusUpload} onClose={closeModal} />}
        </BiliupContext.Provider>
      </BiliupProgressContext.Provider>
    </BiliupFlowStateContext.Provider>
  </BiliupActionsContext.Provider>;
}
