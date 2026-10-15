import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import App from '../../src/App';
import { BiliupProvider } from '../../src/components/BiliupProvider';
import { emptyBiliupPreferences, idleBiliupState, newBiliupTemplate, normalizeBiliupPreferences, type BiliupPreferences } from '../../src/biliup';
import { translate } from '../../src/i18n';
import { AVATAR_PLACEHOLDER } from '../../src/utils/avatarFallback';

const clone = <T,>(value: T): T => structuredClone(value);
let testLanguage: 'en' | 'zh-CN' = 'en';
const t = (key: string) => translate(testLanguage, key);
const assert = (value: unknown, message: string) => { if (!value) throw new Error(`${message}: ${document.body.textContent?.slice(0, 800)}`); };
const settle = async () => {
  for (let index = 0; index < 6; index += 1) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};
const waitFor = async (predicate: () => boolean, message: string) => {
  for (let index = 0; index < 160; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`${message}: ${document.body.textContent?.slice(0, 1100)}`);
};
const project = (id: string) => ({
  projectId: id, projectTitle: id, language: 'en', fps: 30,
  dimensions: { width: 640, height: 360 }, subtitleFormat: 'srt', audioPath: '', assPath: '',
  background: { image: AVATAR_PLACEHOLDER, slides: [] },
  speakers: { A: { name: 'Alice', side: 'left', avatar: AVATAR_PLACEHOLDER, style: {} } },
  content: [{ type: 'text', start: 0, end: 10, text: 'Synthetic subtitle', speaker: 'A' }],
  exportRange: { start: 0, end: 10 },
  exportQuality: 'balance', exportHardware: 'auto', exportFormat: 'mp4', exportParallelSegments: false, exportLogEnabled: true,
  filenameTemplate: 'default', customFilename: '',
});

export async function runExportPersistenceTests() {
  const originalElectron = Object.getOwnPropertyDescriptor(window, 'electron');
  const originalConfirm = window.confirm;
  let root: Root | undefined;
  let renderError: unknown;
  let requestedClose: (() => void) | undefined;
  let closeConfirmed = false;
  let configWrites = 0;
  let configLoads = 0;
  let projectNumber = 0;
  let selectedDirectory = '/synthetic/exports';
  let busySave = false;
  let overlap = false;
  const paths = new Map<string, string>();
  let diskConfig = {
    ...project('project-one'),
    ui: { recentProject: '/synthetic/one.pomchat', recentProjects: ['/synthetic/one.pomchat'], presets: {}, annotationPresets: {}, fontPresets: {}, autoSaveProject: false },
  };
  paths.set('/synthetic/one.pomchat', JSON.stringify(project('project-one')));
  let diskBiliup: BiliupPreferences = normalizeBiliupPreferences({
    ...emptyBiliupPreferences, directory: '/synthetic/biliup', autoUpload: false,
    accounts: [{ id: 'account', name: 'Synthetic user', directory: '/synthetic/biliup' }], selectedAccountId: 'account',
    selectedTemplateId: 'first', templates: [
      { ...newBiliupTemplate(), id: 'first', name: 'First template', title: 'First synthetic title', tag: 'test' },
      { ...newBiliupTemplate(), id: 'second', name: 'Second template', title: 'Second synthetic title', tag: 'test' },
    ],
  });
  const ok = <T,>(value: T) => Promise.resolve({ ok: true, value: clone(value) });
  const noop = async () => {};
  const bridge = {
    loadConfig: async () => { configLoads += 1; await new Promise((resolve) => setTimeout(resolve, 90)); return clone(diskConfig); },
    saveConfig: async (config: typeof diskConfig) => { configWrites += 1; diskConfig = clone(config); return true; },
    readFile: async (path: string) => paths.get(path) || '',
    writeFile: async (path: string, content: string) => { paths.set(path, content); return true; },
    inspectProjectResources: async () => [],
    setProxy: noop,
    checkForUpdates: async () => ({ ok: true, hasUpdate: false }),
    getRenderCacheInfo: async () => ({ remoteAssets: { path: '/synthetic/cache', files: 0, bytes: 0 }, remotionTemp: { path: '/synthetic/temp', entries: [], files: 0, bytes: 0 } }),
    // Deliberately different so the test proves which fallback wins.
    getExportPaths: async () => ({ runtimeDir: '/synthetic/runtime', quickSavePath: '/synthetic', suggestedPath: '/synthetic/suggested' }),
    onExportProgress: () => () => {},
    onAppCloseRequested: (callback: () => void) => { requestedClose = callback; return () => { requestedClose = undefined; }; },
    setAppCloseListenerReady: noop,
    confirmAppClose: async () => { closeConfirmed = true; },
    cancelAppClose: noop,
    onProjectOpenRequested: () => () => {},
    setProjectOpenListenerReady: noop,
    showOpenDialog: async () => ({ canceled: false, filePaths: [selectedDirectory] }),
    showSaveDialog: async () => ({ canceled: false, filePath: `/synthetic/new-${++projectNumber}.pomchat` }),
    cancelExport: noop,
    biliup: {
      load: () => ok(diskBiliup), state: () => ok(idleBiliupState), onState: () => () => {},
      save: async (preferences: BiliupPreferences) => {
        if (busySave) { overlap = true; throw new Error('busy'); }
        busySave = true;
        try {
          await new Promise((resolve) => setTimeout(resolve, 55));
          diskBiliup = normalizeBiliupPreferences(preferences);
          return { ok: true, value: clone(diskBiliup) };
        } finally { busySave = false; }
      },
    },
  };
  Object.defineProperty(window, 'electron', { configurable: true, value: bridge });
  window.confirm = () => true;
  const click = async (node: HTMLElement | undefined | null) => {
    assert(node, 'Missing click target');
    flushSync(() => node!.click());
    await settle();
    if (renderError) throw renderError;
  };
  const button = (text: string, scope: ParentNode = document) => [...scope.querySelectorAll<HTMLButtonElement>('button')].find((node) => node.textContent?.trim() === text);
  const change = async (input: HTMLInputElement | HTMLSelectElement, value: string) => {
    assert(input, 'Missing input');
    const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
    flushSync(() => input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })));
    await settle();
  };
  const exportDialog = () => document.querySelector<HTMLElement>(`[aria-label="${t('export.title')}"]`)!;
  const closeExport = async () => {
    const modal = exportDialog();
    await click(modal.querySelector<HTMLButtonElement>('button .lucide-x')?.closest('button'));
  };
  const openExport = async () => {
    await click(button(t('menu.export')));
    await click(button(t('menu.exportVideo')));
    await waitFor(() => Boolean(exportDialog()), 'Export dialog must open');
  };
  const mount = async () => {
    root = createRoot(document.getElementById('root')!, { onUncaughtError: (error) => { renderError = error; console.error(String(error)); } });
    flushSync(() => root!.render(<BiliupProvider><App /></BiliupProvider>));
    await waitFor(() => Boolean(document.querySelector('[role="button"]')), `Recent project must hydrate (load calls ${configLoads})`);
    // Wait beyond the delayed Electron config, so defaults can never replace it.
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (renderError) throw renderError;
    const recent = [...document.querySelectorAll<HTMLElement>('[role="button"]')].find((node) => node.textContent?.includes('one.pomchat'));
    await click(recent);
    await waitFor(() => document.body.textContent?.includes('Synthetic subtitle') === true, 'Project must load');
    await openExport();
  };
  const pressed = (label: string) => button(label, exportDialog())?.getAttribute('aria-pressed') === 'true';
  const outputInput = () => exportDialog().querySelector<HTMLInputElement>(`input[placeholder="${t('export.pathPlaceholder')}"]`)!;
  const checkbox = (label: string) => [...exportDialog().querySelectorAll('label')].find((node) => node.textContent?.includes(label))?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  const results: string[] = [];
  try {
    await mount();
    assert(outputInput(), 'Output directory input must exist');
    assert(outputInput().value === '/synthetic', `A fresh profile must default to the quick save directory, got ${outputInput().value}`);
    await change(outputInput(), selectedDirectory);
    await click(button(t('export.qualityHigh'), exportDialog()));
    await click(button(t('export.hardware.cpu'), exportDialog()));
    await click(checkbox(t('export.parallelSegments')));
    await click(checkbox(t('export.logEnabled')));
    await click(button(t('export.filenameModeSimple'), exportDialog()));
    await change(exportDialog().querySelector<HTMLInputElement>(`input[placeholder="${t('export.customFilenamePlaceholder')}"]`)!, '{$ProjectName}_test');
    // A template click and the automatic-upload toggle can happen before either save resolves.
    const template = exportDialog().querySelector<HTMLSelectElement>(`select[aria-label="${t('biliup.templateSettings')}"]`)!;
    await change(template, 'second');
    await click(exportDialog().querySelector<HTMLButtonElement>(`[role="switch"][aria-label="${t('biliup.autoUpload')}"]`));
    await waitFor(() => diskBiliup.selectedTemplateId === 'second' && diskBiliup.autoUpload, 'Template and enabled state must both persist');
    assert(!overlap, 'Biliup preference writes must not overlap');
    await click(button(t('export.format.mov-alpha'), exportDialog()));
    await waitFor(() => (diskConfig.ui as unknown as { exportPreferences?: { exportFormat: string } }).exportPreferences?.exportFormat === 'mov-alpha', 'Export preferences must auto-save without project save/export');
    results.push('导出偏好：目录、命名模式、质量、硬件、双实例、格式、日志即时记忆');
    await closeExport();
    await openExport();
    assert(outputInput().value === selectedDirectory && pressed(t('export.format.mov-alpha')) && pressed(t('export.hardware.cpu')), 'Closing and reopening the dialog must retain settings');
    await closeExport();
    await click(button(t('menu.file')));
    await click(button(t('menu.newProject')));
    await settle();
    const discardProject = button(t('app.unsavedProjectDiscard'));
    if (discardProject) await click(discardProject);
    await waitFor(() => Boolean([...paths.keys()].find((path) => path.includes('new-'))), 'A new project must be created');
    await settle();
    testLanguage = 'zh-CN';
    await openExport();
    assert(outputInput().value === selectedDirectory && pressed(t('export.qualityHigh')) && pressed(t('export.hardware.cpu')) && pressed(t('export.format.mov-alpha')), 'A blank project must keep machine export preferences');
    assert(checkbox(t('export.parallelSegments'))?.checked === true && checkbox(t('export.logEnabled'))?.checked === false, 'Boolean export preferences survive project switches');
    results.push('新建项目、重开导出面板不会用默认值覆盖导出偏好');
    // Close immediately after editing, before the 500 ms config debounce.
    selectedDirectory = '/synthetic/last-second';
    await change(outputInput(), selectedDirectory);
    await closeExport();
    requestedClose?.();
    await settle();
    const discard = button(t('app.unsavedProjectDiscard'));
    if (discard) await click(discard);
    await waitFor(() => closeConfirmed, 'App close must flush current preferences');
    assert((diskConfig.ui as unknown as { exportPreferences: { outputPath: string } }).exportPreferences.outputPath === selectedDirectory, 'Exit before debounce must still save the latest directory');
    assert(configWrites > 0, 'Preferences must have reached the app config');
    flushSync(() => root!.unmount()); root = undefined;
    // Reload the actual App/Provider instances using only their persisted config.
    testLanguage = 'en';
    diskConfig = { ...diskConfig, language: 'en', ui: { ...diskConfig.ui, recentProject: '/synthetic/one.pomchat', recentProjects: ['/synthetic/one.pomchat'] } };
    await mount();
    assert(outputInput().value === selectedDirectory, 'Restart must restore export directory');
    assert(pressed(t('export.qualityHigh')) && pressed(t('export.hardware.cpu')) && pressed(t('export.format.mov-alpha')), 'Restart must restore quality/hardware/format');
    assert(checkbox(t('export.parallelSegments'))?.checked === true && checkbox(t('export.logEnabled'))?.checked === false, 'Restart must preserve enabled and disabled states');
    assert(button(t('export.filenameModeAdvanced'), exportDialog()), 'Restart must restore the advanced filename mode');
    assert(exportDialog().querySelector<HTMLInputElement>(`input[placeholder="${t('export.customFilenamePlaceholder')}"]`)?.value === '{$ProjectName}_test', 'Restart must restore custom filename');
    assert(exportDialog().querySelector<HTMLSelectElement>(`select[aria-label="${t('biliup.templateSettings')}"]`)?.value === 'second', 'Restart must restore the upload template');
    assert(exportDialog().querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'true', 'Restart must keep auto-upload enabled even on a non-MP4 format');
    results.push('重启恢复全部导出设置与 biliup 模板/启用状态，退出前会冲刷最后修改');
    return results;
  } finally {
    if (root) flushSync(() => root!.unmount());
    window.confirm = originalConfirm;
    if (originalElectron) Object.defineProperty(window, 'electron', originalElectron);
    else delete window.electron;
  }
}
