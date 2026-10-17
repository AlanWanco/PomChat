import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { SettingsPanel } from '../../src/components/SettingsPanel';
import { BiliupProvider } from '../../src/components/BiliupProvider';
import type { Language } from '../../src/i18n';

const noop = () => {};
let root: Root | undefined;

/** The asset tab header must give the three insert buttons the same width. */
export async function renderAssetInsertRowPreview(language: Language, isDarkMode: boolean, panelWidth = 400) {
  root ??= createRoot(document.getElementById('root')!);
  const panel = (width: number) => (
    <div style={{ width, height: 720 }}>
      <BiliupProvider>
        <SettingsPanel
          config={{ projectId: 'synthetic-project', fps: 30, dimensions: { width: 1920, height: 1080 }, chatLayout: {}, background: { slides: [] }, speakers: { A: { name: 'Alice', side: 'left', style: {} } } }}
          onConfigChange={noop} isDarkMode={isDarkMode} language={language} themeColor="#9ca4b8" secondaryThemeColor="#ed7e96"
          autoSaveProject={false} uiFontScale={1} proxy="" settingsPosition="right" projectAssetsCacheEnabled={false}
          presets={{}} annotationPresets={{}} fontPresets={{}}
          onThemeColorChange={noop} onSecondaryThemeColorChange={noop} onAutoSaveProjectChange={noop} onUiFontScaleChange={noop}
          onProjectAssetsCacheEnabledChange={noop} onProxyChange={noop} onLanguageChange={noop} onThemeChange={noop}
          onPresetsChange={noop} onAnnotationPresetsChange={noop} onFontPresetsChange={noop}
          activeTab="assets" setActiveTab={noop} onClose={noop} onSave={noop} showToast={noop}
        />
      </BiliupProvider>
    </div>
  );
  const probe = async (width: number) => {
    flushSync(() => root!.render(panel(width)));
    for (let frame = 0; frame < 6; frame += 1) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const row = document.querySelector<HTMLElement>('[data-testid="add-image-asset"]')!.parentElement!;
    const buttons = ['add-image-asset', 'add-text-asset', 'add-audio-viz'].map((id) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!);
    const widths = buttons.map((button) => button.getBoundingClientRect().width);
    const labels = buttons.map((button) => {
      const label = button.querySelector('span')!;
      return { clipped: label.scrollWidth > label.clientWidth + 1, lines: Math.round(label.clientHeight / parseFloat(getComputedStyle(label).lineHeight || '16')), text: label.textContent || '' };
    });
    return {
      panelWidth: width,
      widths,
      rowWidth: row.getBoundingClientRect().width,
      sameWidth: widths.every((width) => Math.abs(width - widths[0]) <= 0.5),
      fits: row.scrollWidth <= row.clientWidth + 1,
      labels,
    };
  };
  return probe(panelWidth);
}

export function closeAssetInsertRowPreview() {
  flushSync(() => root?.unmount());
  root = undefined;
  document.querySelector('#root')?.replaceChildren();
}
