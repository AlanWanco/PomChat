import { useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { DraftGuard } from '../../src/components/ui/DraftGuard';
import { BiliupProvider } from '../../src/components/BiliupProvider';
import { useBiliupActions } from '../../src/components/BiliupContext';
import { emptyBiliupPreferences, idleBiliupState, newBiliupTemplate, type BiliupApi } from '../../src/biliup';
import { translate, type Language } from '../../src/i18n';

const noop = () => {};
let root: Root | null = null;
let previousElectron: unknown;

export async function renderBiliupFeedbackPreview(mode: 'draft' | 'failure', language: Language, isDarkMode: boolean) {
  const appearance = { language, isDarkMode, themeColor: isDarkMode ? '#545454' : '#9ca4b8', secondaryThemeColor: '#ed7e96' };
  document.documentElement.style.setProperty('--podchat-accent', appearance.secondaryThemeColor);
  const globalWindow = window as unknown as { electron?: unknown };
  if (!root) {
    root = createRoot(document.getElementById('root')!);
    previousElectron = globalWindow.electron;
  }
  let element: ReactNode;
  if (mode === 'draft') {
    element = <DraftGuard {...appearance} onSave={noop} onCancel={noop} onDiscard={noop} />;
  } else {
    const preferences = { ...emptyBiliupPreferences, directory: '/synthetic/biliup', selectedTemplateId: 'one', templates: [{ ...newBiliupTemplate(), id: 'one', name: 'Synthetic template', title: 'Synthetic upload', tag: 'synthetic' }] };
    const api = {
      load: async () => ({ ok: true, value: preferences }),
      state: async () => ({ ok: true, value: { ...idleBiliupState, kind: 'upload', phase: 'failed', error: 'file', errorDetail: translate(language, 'biliup.uploadPreparationFailed', { stage: translate(language, 'biliup.stage.video'), reason: 'ENOENT' }), logs: [translate(language, 'biliup.uploadPreparing', { stage: translate(language, 'biliup.stage.video') })] } }),
      onState: () => noop,
    } as BiliupApi;
    globalWindow.electron = { biliup: api, showNotification: async () => true };
    function Preview() {
      const { open, setAppearance } = useBiliupActions();
      useEffect(() => { setAppearance(appearance); open(); }, [open, setAppearance]);
      return null;
    }
    element = <BiliupProvider key={`${language}-${isDarkMode}`}><Preview /></BiliupProvider>;
  }
  flushSync(() => root!.render(element));
  for (let index = 0; index < 12; index += 1) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const label = translate(language, mode === 'draft' ? 'draft.title' : 'biliup.settings');
  const dialog = document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${label}"]`)!;
  const box = dialog.firstElementChild!.getBoundingClientRect();
  const alert = dialog.querySelector<HTMLElement>('[data-testid="biliup-error"]');
  return {
    overflow: document.documentElement.scrollWidth > innerWidth,
    left: box.left, right: box.right, top: box.top, bottom: box.bottom,
    errorVisible: !alert || alert.getBoundingClientRect().top >= 0 && alert.getBoundingClientRect().bottom <= innerHeight,
  };
}

export function closeBiliupFeedbackPreview() {
  flushSync(() => root?.unmount());
  root = null;
  const globalWindow = window as unknown as { electron?: unknown };
  if (previousElectron === undefined) delete globalWindow.electron;
  else globalWindow.electron = previousElectron;
}
