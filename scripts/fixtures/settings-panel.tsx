import { StrictMode, type ComponentProps } from 'react';
export { runUiInteractionTests } from './ui-interactions';
export { runAppInteractionTests } from './app-interactions';
export { renderWelcomePreview } from './welcome-preview';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { SettingsPanel } from '../../src/components/SettingsPanel';
import { BiliupProvider } from '../../src/components/BiliupProvider';
import { createThemeTokens } from '../../src/theme';
import { translate } from '../../src/i18n';
import type { BackgroundSlideItem } from '../../src/remotion/types';

// Synthetic browser-only fixture: no Electron bridge, user config, files or credentials.
export async function runSettingsPanelTests() {
  const root = createRoot(document.getElementById('root')!);
  const t = (key: string) => translate('en', key);
  const results: string[] = [];
  const scrolls: Array<{ target: Element; left?: number }> = [];
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  const originalScrollTo = HTMLElement.prototype.scrollTo;
  HTMLElement.prototype.scrollIntoView = function () { scrolls.push({ target: this }); };
  HTMLElement.prototype.scrollTo = function (options) {
    scrolls.push({ target: this, left: typeof options === 'object' ? options.left : options });
  };
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  const settle = async () => {
    // Allow passive effects, any follow-up commit, and its layout frame to finish.
    for (let frame = 0; frame < 4; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  };
  const noop = () => {};
  const avatar = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="blue"/></svg>';
  const asset = (id: string, layer?: 'overlay' | 'background', order = 0): BackgroundSlideItem => ({
    id, type: 'text', name: id, text: id, image: '', start: 0, end: 10,
    layer, overlayOrder: order, backgroundOrder: order,
  });
  let props: ComponentProps<typeof SettingsPanel> = {
    config: {
      projectId: 'synthetic-project', fps: 30, dimensions: { width: 1920, height: 1080 }, chatLayout: {},
      background: { slides: [asset('back', undefined), asset('over-low', 'overlay'), asset('over-high', 'overlay', 1)] },
      speakers: {
        A: { name: 'Alice', side: 'left', avatar, style: {} },
        B: { name: 'Bob', side: 'right', avatar, style: {} },
        ANNOTATION: { name: 'Note', type: 'annotation', style: {} },
      },
    },
    isDarkMode: false, language: 'en', themeColor: '#9ca4b8', secondaryThemeColor: '#ed7e96',
    autoSaveProject: false, uiFontScale: 1, proxy: '', settingsPosition: 'right', projectAssetsCacheEnabled: false,
    presets: {}, annotationPresets: {}, fontPresets: {
      f1: { id: 'f1', name: 'Font One', family: 'sans-serif', filePath: 'unused-one.ttf', weight: 'normal', style: 'normal' },
      f2: { id: 'f2', name: 'Font Two', family: 'serif', filePath: 'unused-two.ttf', weight: 'normal', style: 'normal' },
    },
    activeTab: 'global', onClose: noop, onSave: noop, showToast: noop,
    onThemeColorChange: noop, onSecondaryThemeColorChange: noop, onAutoSaveProjectChange: noop,
    onUiFontScaleChange: noop, onProjectAssetsCacheEnabledChange: noop, onProxyChange: noop,
    onLanguageChange: noop, onThemeChange: noop, onPresetsChange: noop, onAnnotationPresetsChange: noop,
    onConfigChange: (config) => patch({ config }),
    onFontPresetsChange: (fontPresets) => patch({ fontPresets }),
    setActiveTab: (activeTab) => patch({ activeTab }),
    onCopyRemoteAssetsToProject: noop,
    projectResourceActionReport: { title: 'report-one', items: ['item-one'] },
  };
  function patch(updates: Partial<typeof props>) {
    props = { ...props, ...updates };
    flushSync(() => root.render(<StrictMode><BiliupProvider><SettingsPanel {...props} /></BiliupProvider></StrictMode>));
  }
  function button(text: string) {
    const found = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);
    if (!found) throw new Error(`Missing button: ${text}`);
    return found;
  }
  function field(label: string) {
    const span = [...document.querySelectorAll('span')].find((item) => item.textContent === label);
    const input = span?.parentElement?.querySelector('input');
    if (!input) throw new Error(`Missing input: ${label}`);
    return input;
  }
  function change(target: HTMLInputElement | HTMLSelectElement, value: string) {
    const prototype = target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(target, value);
    flushSync(() => target.dispatchEvent(new Event(target instanceof HTMLInputElement ? 'input' : 'change', { bubbles: true })));
  }
  const click = (target: HTMLElement) => flushSync(() => target.click());
  const ids = () => [...document.querySelectorAll<HTMLElement>('[data-slide-tab-id]')].map((row) => row.dataset.slideTabId).join(',');
  const row = (id: string) => document.querySelector<HTMLElement>(`[data-slide-tab-id="${id}"]`)!;
  const selectedName = () => document.querySelector<HTMLInputElement>(`input[placeholder="${t('project.insertImageNamePlaceholder')}"]`)?.value;
  const slides = (): BackgroundSlideItem[] => props.config.background.slides;
  function replaceSlides(next: BackgroundSlideItem[]) {
    patch({ config: { ...props.config, background: { ...props.config.background, slides: next } } });
  }
  const drag = (target: Element, type: string) => flushSync(() => {
    target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
  });

  try {
    patch({});
    await settle();
    assert(document.body.textContent?.includes('report-one'), 'Initial resource report is shown');
    const copy = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes(t('global.copyRemoteAssetsToProject')))!;
    click(copy);
    patch({ currentTime: 1 });
    await settle();
    assert(document.body.textContent?.includes(t('global.resourceActionChecking')), 'Unrelated renders retain pending report');
    patch({ projectResourceActionReport: { title: 'report-two', items: ['item-two'] } });
    await settle();
    assert(document.body.textContent?.includes('item-two'), 'New completed report replaces pending message');
    patch({ projectResourceActionReport: null });
    await settle();
    assert(document.body.textContent?.includes('report-two'), 'Null retains the last displayed report');
    patch({ onCopyRemoteAssetsToProject: undefined });
    await settle();
    click(copy);
    assert(document.body.textContent?.includes(t('global.resourceActionUnavailable')), 'Missing runner shows local error');
    patch({ projectResourceActionReport: { title: 'report-three', items: [] } });
    await settle();
    assert(document.body.textContent?.includes('report-three'), 'Next report replaces local error');
    results.push('资源报告：初始化、进行中、完成、空报告、不可用及重渲染');

    const fontSelect = [...document.querySelectorAll('select')].find((select) => [...select.options].some((option) => option.value === 'f1'))!;
    change(fontSelect, 'f1');
    await settle();
    const fontInput = field(t('fontPresets.name'));
    assert(fontInput.value === 'Font One', 'Selecting a font initializes its draft');
    fontInput.focus();
    change(fontInput, 'Uncommitted');
    patch({ currentTime: 2, fontPresets: { ...props.fontPresets, f1: { ...props.fontPresets.f1, weight: '700', filePath: 'changed.ttf' } } });
    await settle();
    assert(fontInput.value === 'Uncommitted' && document.activeElement === fontInput, 'Unrelated preset changes preserve draft and focus');
    change(fontSelect, 'f2');
    await settle();
    assert(field(t('fontPresets.name')).value === 'Font Two', 'Different preset resets name draft');
    change(fontSelect, 'f1');
    await settle();
    assert(field(t('fontPresets.name')).value === 'Font One', 'Returning to a preset must not resurrect discarded draft');
    patch({ fontPresets: { ...props.fontPresets, f1: { ...props.fontPresets.f1, name: 'External Rename' } } });
    await settle();
    assert(field(t('fontPresets.name')).value === 'External Rename', 'External rename updates the draft');
    const name = field(t('fontPresets.name'));
    name.focus();
    change(name, 'Saved Name');
    flushSync(() => name.blur());
    await settle();
    assert(props.fontPresets.f1.name === 'Saved Name', 'Blur commits edited font name');
    patch({ fontPresets: { f2: props.fontPresets.f2 } });
    await settle();
    assert(!document.body.contains(name), 'Removing selected font hides the editor');
    change(fontSelect, 'f2');
    await settle();
    assert(field(t('fontPresets.name')).value === 'Font Two', 'Selection after deletion initializes correctly');
    results.push('字体草稿：切换、返回、外部改名、删除、失焦保存及保留焦点');

    patch({ activeTab: 'assets', activeInsertImageId: 'back' });
    await settle();
    assert(ids() === 'over-high,over-low,back', 'Layers sort overlay first, descending within each layer; missing layer is background');
    assert(selectedName() === 'back', 'Parent selection opens corresponding tab');
    click(row('over-low'));
    patch({ currentTime: 3 });
    await settle();
    assert(selectedName() === 'over-low', 'Unchanged parent selection must not overwrite local tab');
    patch({ activeInsertImageId: null });
    await settle();
    assert(selectedName() === 'over-low', 'Clearing preview selection keeps settings tab');
    patch({ activeInsertImageId: 'back' });
    await settle();
    assert(selectedName() === 'back', 'Re-selecting same ID after null follows new parent request');
    patch({ activeInsertImageId: 'missing' });
    await settle();
    assert(selectedName() === undefined, 'Missing selected asset does not silently select another');
    patch({ activeInsertImageId: 'over-high' });
    await settle();
    results.push('素材选中：外部选择、手动选择、清空、重复选择及失效 ID');

    const beforeDrag = slides();
    drag(row('over-high'), 'dragstart');
    replaceSlides(slides().map((item) => ({ ...item, overlayOrder: item.id === 'over-low' ? 5 : 0 })));
    await settle();
    assert(ids() === 'over-high,over-low,back', 'Order remains frozen during drag');
    replaceSlides([...slides().filter((item) => item.id !== 'back'), asset('new-back')]);
    await settle();
    assert(ids() === 'over-high,over-low', 'Drag snapshot filters removed assets and defers added tabs');
    drag(row('over-high'), 'dragend');
    await settle();
    assert(ids() === 'over-low,over-high,new-back', 'Ending drag reconciles current layers');
    replaceSlides(beforeDrag);
    await settle();
    drag(row('over-high'), 'dragstart');
    drag(row('over-low'), 'drop');
    await settle();
    assert(ids() === 'over-low,over-high,back', 'Drop updates actual same-layer order');
    replaceSlides(beforeDrag);
    await settle();
    assert(ids() === 'over-high,over-low,back', 'External undo-like restore recomputes order');
    const beforeCrossLayer = slides();
    drag(row('over-high'), 'dragstart');
    drag(row('back'), 'drop');
    assert(slides() === beforeCrossLayer, 'Cross-layer drop leaves project order unchanged');
    results.push('素材排序：默认层、同层拖放、跨层拒绝、拖动中增删和外部恢复');

    scrolls.length = 0;
    click(button(t('project.addTextAsset')));
    await settle();
    assert(slides().length === 4 && selectedName() === slides()[3].name, 'Adding selects newly created asset');
    assert(scrolls.some((item) => item.left !== undefined), 'Adding scrolls to new tab');
    const addedId = slides()[3].id;
    click(row(addedId).querySelector<HTMLButtonElement>(`button[title="${t('project.duplicateAsset')}"]`)!);
    await settle();
    assert(slides().length === 5 && selectedName() === slides()[4].name, 'Duplicating selects the copy');
    click(row(slides()[4].id).querySelector<HTMLButtonElement>('button:last-child')!);
    await settle();
    assert(slides().length === 4 && selectedName() === 'back', 'Deletion keeps original fallback selection rule');
    replaceSlides(beforeDrag);
    await settle();
    scrolls.length = 0;
    click(button(t('project.addTextAsset')));
    patch({ activeTab: 'global' });
    await settle();
    assert(!scrolls.some((item) => item.left !== undefined), 'Hiding before the queued frame defers local tab scroll');
    patch({ activeTab: 'assets' });
    await settle();
    assert(scrolls.some((item) => item.left !== undefined), 'Returning to assets resumes pending local scroll');
    replaceSlides(beforeDrag);
    await settle();
    scrolls.length = 0;
    click(button(t('project.addTextAsset')));
    patch({ panelCollapsed: true });
    await settle();
    assert(!scrolls.some((item) => item.left !== undefined), 'Collapsing before the frame defers local tab scroll');
    patch({ panelCollapsed: false });
    await settle();
    assert(scrolls.some((item) => item.left !== undefined), 'Expanding resumes pending local scroll');
    replaceSlides(beforeDrag);
    await settle();
    scrolls.length = 0;
    patch({ activeInsertImageId: 'over-high', focusInsertImageSettingsKey: 1 });
    await settle();
    assert(scrolls.some((item) => item.left !== undefined), 'Parent focus request scrolls after layout');
    scrolls.length = 0;
    patch({ currentTime: 4 });
    await settle();
    assert(scrolls.length === 0, 'Unrelated render does not replay handled focus request');
    patch({ focusInsertImageSettingsKey: 2 });
    await settle();
    assert(scrolls.some((item) => item.left !== undefined), 'Repeated request for same ID still scrolls');
    scrolls.length = 0;
    patch({ activeTab: 'global', focusInsertImageSettingsKey: 3 });
    await settle();
    assert(scrolls.length === 0, 'Hidden asset panel does not scroll');
    patch({ activeTab: 'assets' });
    await settle();
    assert(scrolls.some((item) => item.left !== undefined), 'Returning to assets honors parent focus request');
    results.push('素材定位：新增、复制、删除回退、重复请求、隐藏/折叠后恢复待执行滚动');

    patch({ activeTab: 'project' });
    await settle();
    const nav = document.querySelector<HTMLElement>(`[title="${t('settings.sectionNavigation')}"]`)!.parentElement!;
    const navButtons = [...nav.querySelectorAll('button')];
    assert(navButtons.length === 5, 'Project navigation only contains its five visible sections');
    assert(!navButtons.some((item) => item.textContent?.includes(t('project.insertImages'))), 'Asset navigation was moved out of the project tab');
    const targets = navButtons.map((item) => {
      scrolls.length = 0;
      click(item);
      return scrolls.at(-1)?.target;
    });
    const container = document.querySelector<HTMLElement>('.flex-1.overflow-y-auto.custom-scrollbar')!;
    container.getBoundingClientRect = () => new DOMRect(0, 0, 400, 500);
    targets.forEach((target, index) => {
      if (target) target.getBoundingClientRect = () => new DOMRect(0, index < 2 ? index * 80 : index * 200, 400, 100);
    });
    flushSync(() => container.dispatchEvent(new Event('scroll')));
    const dots = document.querySelector(`[title="${t('settings.sectionNavigation')}"]`)!.children;
    assert((dots[1] as HTMLElement).style.transform === 'scale(1.35)', 'Scroll measurement highlights matching section');
    targets[2]!.getBoundingClientRect = () => new DOMRect(0, 90, 400, 100);
    flushSync(() => window.dispatchEvent(new Event('resize')));
    assert((dots[2] as HTMLElement).style.transform === 'scale(1.35)', 'Resize remeasures navigation');
    patch({ activeTab: 'global' });
    await settle();
    assert(!document.querySelector(`[title="${t('settings.sectionNavigation')}"]`), 'No navigation when sections are empty');
    patch({ activeTab: 'speakers' });
    await settle();
    assert(document.querySelector(`[title="${t('settings.sectionNavigation')}"]`), 'Speaker navigation appears after empty section set');
    patch({ activeTab: 'project' });
    await settle();
    assert([...document.querySelector(`[title="${t('settings.sectionNavigation')}"]`)!.children].filter((dot) => (dot as HTMLElement).style.transform === 'scale(1.35)').length === 1, 'Returning to project remeasures active marker');
    results.push('导航：仅保留项目分组、滚动、窗口尺寸变化、空分组和标签页切换');

    for (const language of ['en', 'zh-CN'] as const) for (const isDarkMode of [false, true]) {
      patch({ language, isDarkMode, activeTab: 'project' });
      const theme = createThemeTokens(props.themeColor, isDarkMode);
      const color = (value: string) => {
        const probe = document.createElement('span');
        probe.style.color = value;
        return probe.style.color;
      };
      const tabKeys = ['global', 'project', 'speakers', 'annotation', 'assets'] as const;
      for (const selected of ['project', 'speakers', 'annotation', 'assets', 'global', 'speakers'] as const) {
        click(button(translate(language, `tab.${selected}`)));
        await settle();
        for (const key of tabKeys) {
          const tab = button(translate(language, `tab.${key}`));
          const active = key === selected;
          assert(tab.style.color === color(active ? theme.text : theme.textSoft), `${language}/${isDarkMode}: ${key} text matches selection`);
          assert(tab.classList.contains('border-b-2') === active, `${key} underline matches selection`);
          if (active) assert(tab.style.borderColor === color(props.secondaryThemeColor), 'Selected underline uses theme color');
          assert(tab.classList.contains('font-medium') && tab.classList.contains('transition-colors'), 'Tab typography and transitions match');
          if (key === 'speakers' || key === 'annotation') {
            assert(tab.getAttribute('aria-pressed') === String(active), `${key} aria-pressed matches selection`);
          }
        }
        const contentKey = {
          project: 'project.layout', speakers: 'speakers.name', annotation: 'annotation.position',
          assets: 'project.addTextAsset', global: 'global.language',
        }[selected];
        assert(document.body.textContent?.includes(translate(language, contentKey)), `${selected} content appears`);
        assert(!!document.querySelector(`input[value="Alice"]`) === (selected === 'speakers'), 'Speaker editor only appears on its tab');
      }
    }
    results.push('标签高亮：项目 → 角色 → 注释 → 其他页签 → 角色，中英文及明暗主题');

    patch({ activeTab: 'assets', focusInsertImageSettingsKey: 4 });
    scrolls.length = 0;
    flushSync(() => root.unmount());
    await settle();
    assert(scrolls.length === 0, 'Unmount cancels queued tab scrolling');
    results.push('生命周期：卸载取消待执行的滚动帧（StrictMode）');
    return results;
  } finally {
    root.unmount();
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    HTMLElement.prototype.scrollTo = originalScrollTo;
  }
}
