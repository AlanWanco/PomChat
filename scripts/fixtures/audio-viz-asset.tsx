import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import App from '../../src/App';
import { BiliupProvider } from '../../src/components/BiliupProvider';
import { AVATAR_PLACEHOLDER } from '../../src/utils/avatarFallback';
import { translate } from '../../src/i18n';
import { AudioVizAsset } from '../../src/remotion/AudioVizAsset';
import { AUDIO_VIZ_SAMPLE_RATE, buildAudioVizGrid, decodeAudioVizGrid, getAudioVizLevels, type AudioVizGrid } from '../../src/remotion/audioVizGrid';
import type { BackgroundSlideItem } from '../../src/remotion/types';

const SAMPLE_RATE = 16000;
const TONE_FROM = 0.5;
const TONE_TO = 1.0;

/** Synthetic audio: silence, a loud tone, then silence again. */
const createBurstWav = () => {
  const duration = 1.6;
  const samples = new Float32Array(Math.round(SAMPLE_RATE * duration));
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / SAMPLE_RATE;
    if (time < TONE_FROM || time >= TONE_TO) continue;
    samples[index] = 0.6 * Math.sin(2 * Math.PI * 440 * time);
  }
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  text(0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.round(sample * 32767), true));
  return { buffer, samples };
};

/** Exactly the slide the export comparison uses, so both renders can be compared pixel by pixel. */
export const AUDIO_VIZ_EXPORT_SLIDE: BackgroundSlideItem = {
  id: 'viz-export',
  type: 'audio-viz',
  name: 'Viz',
  start: 0,
  end: 2,
  layer: 'overlay',
  backgroundOrder: 0,
  overlayOrder: 0,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  opacity: 1,
  inheritBackgroundFilters: false,
  animationStyle: 'none',
  animationDuration: 0,
  visible: true,
  audioVizMode: 'spectrum',
  audioVizColorMode: 'solid',
  audioVizColor: '#FF0000',
  audioVizCornerStyle: 'square',
  audioVizAlignment: 'bottom',
  audioVizBars: 24,
  audioVizGain: 5,
  audioVizSmoothing: 0,
  audioVizWidth: 480,
  audioVizHeight: 200,
};

const AUDIO_VIZ_SLIDE: BackgroundSlideItem = {
  id: 'viz-1',
  type: 'audio-viz',
  name: 'Viz',
  start: 0,
  end: 5,
  layer: 'overlay',
  backgroundOrder: 0,
  overlayOrder: 0,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  opacity: 1,
  inheritBackgroundFilters: false,
  animationStyle: 'none',
  animationDuration: 0,
  visible: true,
  audioVizMode: 'spectrum',
  audioVizColorMode: 'solid',
  audioVizColor: '#FF0000',
  audioVizColors: ['#FF0000', '#0000FF'],
  audioVizCornerStyle: 'square',
  audioVizAlignment: 'bottom',
  audioVizBars: 24,
  audioVizGain: 5,
  audioVizSmoothing: 0,
  audioVizWidth: 480,
  audioVizHeight: 200,
};

/** Deliberately out of range so the loader has to clamp it. */
const AUDIO_VIZ_INVALID_SLIDE: BackgroundSlideItem = {
  ...AUDIO_VIZ_SLIDE,
  id: 'viz-bad',
  name: 'VizBad',
  layer: 'background',
  backgroundOrder: 1,
  audioVizMode: 'energy',
  audioVizColorMode: 'gradient',
  audioVizColors: ['', 42] as unknown as string[],
  audioVizCornerStyle: 'rounded',
  audioVizAlignment: 'center',
  audioVizBars: 9999,
  audioVizGain: 100,
  audioVizSmoothing: 5,
  audioVizWidth: -10,
  audioVizHeight: 0,
};

const settle = async (frames = 8) => {
  for (let index = 0; index < frames; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
};

const waitFor = async (predicate: () => boolean, message: string | (() => string), attempts = 200) => {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(typeof message === 'function' ? message() : message);
};

const readHeights = (selector: string) =>
  [...document.querySelectorAll<SVGRectElement>(`${selector} rect`)].map((rect) => Number(rect.getAttribute('height')));

const click = (target: HTMLElement | null) => {
  if (!target) throw new Error(`Missing click target. Visible text: ${document.body.textContent?.slice(0, 2000)}`);
  flushSync(() => target.click());
};

const button = (text: string) => [...document.querySelectorAll<HTMLElement>('button')].find((el) => el.textContent?.trim() === text) ?? null;
const t = (key: string) => translate('en', key);

const seek = (time: number) => {
  const audio = document.querySelector('audio');
  if (!audio) throw new Error('The preview audio element is missing');
  audio.currentTime = time;
  flushSync(() => audio.dispatchEvent(new Event('timeupdate', { bubbles: true })));
};

const setSelect = (element: HTMLSelectElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(element, value);
  flushSync(() => element.dispatchEvent(new Event('change', { bubbles: true })));
};

const readPanel = () => ({
  mode: document.querySelector<HTMLSelectElement>('[data-testid="audio-viz-mode"]')?.value,
  bars: document.querySelector<HTMLInputElement>('[data-testid="audio-viz-bars"] input')?.value,
  corners: document.querySelector<HTMLSelectElement>('[data-testid="audio-viz-corners"]')?.value,
  colorMode: document.querySelector<HTMLSelectElement>('[data-testid="audio-viz-color-mode"]')?.value,
  alignment: document.querySelector<HTMLSelectElement>('[data-testid="audio-viz-align"]')?.value,
  width: document.querySelector<HTMLInputElement>('[data-testid="audio-viz-width"] input')?.value,
  height: document.querySelector<HTMLInputElement>('[data-testid="audio-viz-height"] input')?.value,
});

const diagnostics = () => {
  const audio = document.querySelector('audio') as HTMLAudioElement | null;
  const src = audio?.currentSrc || audio?.src || '';
  return `bars=${readHeights('svg[aria-label="Viz"]').slice(0, 6).join(',')}`
    + ` audio=${audio ? `${audio.currentTime.toFixed(2)}/${Number.isFinite(audio.duration) ? audio.duration.toFixed(2) : 'NaN'} ready=${audio.readyState} src=${src.slice(0, 40)}${src ? ` len=${src.length}` : ''}` : 'missing'}`
    + ` text=${document.body.textContent?.slice(-260)}`;
};

/**
 * The editor test runs in phases so the runner can capture screenshots between them
 * without evaluating concurrently with an in-flight test.
 */
let editorRoot: Root | null = null;

export async function startAudioVizEditorTest() {
  const { buffer } = createBurstWav();
  localStorage.clear();
  localStorage.setItem('pomchat_config', JSON.stringify({
    language: 'en',
    projectTitle: 'Audio viz project',
    projectId: 'audio-viz',
    fps: 30,
    dimensions: { width: 1280, height: 720 },
    audioPath: '',
    assPath: '',
    subtitleFormat: 'srt',
    background: { type: 'color', color: '#101828', image: AVATAR_PLACEHOLDER, blur: 0, brightness: 1, slides: [AUDIO_VIZ_SLIDE, AUDIO_VIZ_INVALID_SLIDE] },
    speakers: { A: { name: 'Alice', type: 'speaker', avatar: AVATAR_PLACEHOLDER, side: 'left' } },
    content: [{ type: 'text', start: 0, end: 4, text: 'Synthetic subtitle', speaker: 'A' }],
    ui: { recentProject: 'Audio viz project', autoSaveProject: false, presets: {}, annotationPresets: {}, fontPresets: {} },
  }));
  localStorage.setItem('pomchat_config_recent_project', 'Audio viz project');

  let renderError: unknown;
  editorRoot = createRoot(document.getElementById('root')!, { onUncaughtError: (error) => { renderError = error; } });
  const checks: string[] = [];

  flushSync(() => editorRoot!.render(<BiliupProvider><App /></BiliupProvider>));
  await settle();
  if (renderError) throw renderError;
  const recent = [...document.querySelectorAll<HTMLElement>('[role="button"]')].find((el) => el.textContent?.includes('Audio viz project'));
  click(recent ?? null);
  await settle();

  await waitFor(() => readHeights('svg[aria-label="Viz"]').length === 24, 'The visualization must render its bars');
  // The web edition imports audio through the picker; the preview then analyses the object URL.
  const fileInput = document.querySelector<HTMLInputElement>('input[type="file"][accept^="audio"]');
  if (!fileInput) throw new Error('The audio import input is missing');
  const transfer = new DataTransfer();
  transfer.items.add(new File([buffer], 'burst.wav', { type: 'audio/wav' }));
  fileInput.files = transfer.files;
  flushSync(() => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
  await waitFor(() => {
    const audio = document.querySelector('audio');
    return Boolean(audio) && Number.isFinite(audio!.duration) && audio!.duration > 1;
  }, () => `The preview audio must load: ${diagnostics()}`);
  seek(0.75);
  await settle(4);
  // The analysis arrives asynchronously; the playhead is already inside the tone.
  await waitFor(() => readHeights('svg[aria-label="Viz"]').some((height) => height > 40), () => `Bars must react to the analysed audio: ${diagnostics()}`);

  seek(1.25);
  await settle(4);
  const silentHeights = readHeights('svg[aria-label="Viz"]');
  if (!silentHeights.every((height) => height <= 3.01)) throw new Error(`Silence must show the baseline, got ${silentHeights.join(',')}`);
  seek(0.75);
  await settle(4);
  const loudHeights = readHeights('svg[aria-label="Viz"]');
  if (Math.max(...loudHeights) < 40) throw new Error(`The tone must produce tall bars, got ${loudHeights.join(',')}`);
  if (loudHeights.every((height, index) => height === silentHeights[index])) throw new Error('Bars must differ between the tone and silence');
  seek(1.25);
  await settle(4);
  if (readHeights('svg[aria-label="Viz"]').join(',') !== silentHeights.join(',')) throw new Error('Seeking back must reproduce the same bars');
  checks.push('preview bars follow absolute audio time, including silence');

  const cornerXs = () => [...document.querySelectorAll<SVGRectElement>('svg[aria-label="Viz"] rect')].map((rect) => rect.getAttribute('x')).join(',');
  const spectrumXs = cornerXs();
  click(document.querySelector<HTMLButtonElement>(`button[title="${t('menu.settings')}"]`));
  await settle();
  click(button(t('tab.assets')));
  await settle();

  const panel = readPanel();
  if (!panel.mode || !panel.bars || !panel.corners) throw new Error('The asset panel must expose the audio visualization fields');
  if (panel.mode !== 'spectrum' || panel.bars !== '24' || panel.corners !== 'square' || panel.colorMode !== 'solid') {
    throw new Error(`Unexpected stored settings: ${JSON.stringify(panel)}`);
  }
  if (panel.width !== '480' || panel.height !== '200') throw new Error(`Unexpected stored size: ${JSON.stringify(panel)}`);
  checks.push('the asset panel shows the stored visualization settings');

  seek(1.25);
  await settle(4);
  checks.push('screenshot state: spectrum');

  // The shared accent must follow the theme, so focus rings and steppers are never the purple fallback.
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--podchat-accent').trim().toLowerCase();
  if (accent !== '#ed7e96') throw new Error(`The shared accent must follow the theme, got "${accent}"`);
  const stepper = document.querySelector<HTMLElement>('[data-stepper="up"]');
  if (!stepper) throw new Error('Number inputs must keep their themed stepper buttons');
  const stepperColor = getComputedStyle(stepper).color;
  if (stepperColor !== 'rgb(237, 126, 150)') throw new Error(`Steppers must use the theme accent, got ${stepperColor}`);
  checks.push('the theme accent drives steppers and focus rings');

  // A label with a help tooltip must keep the same baseline as a plain label next to it.
  const layerSelect = document.querySelector<HTMLSelectElement>('[data-testid="asset-layer"]');
  const layerOrder = document.querySelector<HTMLElement>('[data-testid="asset-layer-order"]');
  if (!layerSelect || !layerOrder) throw new Error('The layer fields must be present');
  const orderInput = layerOrder.querySelector('input');
  if (!orderInput) throw new Error('The layer order input must be present');
  const offset = Math.abs(layerSelect.getBoundingClientRect().top - orderInput.getBoundingClientRect().top);
  if (offset > 1) throw new Error(`The layer select and layer order must share a baseline, offset ${offset.toFixed(1)}px`);
  checks.push('the layer tooltip does not push its select out of line');

  // Every asset type shares one opacity slider.
  const opacitySlider = document.querySelector<HTMLInputElement>('[data-testid="asset-opacity"]');
  if (!opacitySlider || opacitySlider.type !== 'range' || opacitySlider.min !== '0' || opacitySlider.max !== '1') {
    throw new Error(`Opacity must be a 0–1 slider, got ${opacitySlider ? `${opacitySlider.type} ${opacitySlider.min}..${opacitySlider.max}` : 'missing'}`);
  }
  const opacitySetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  opacitySetter.call(opacitySlider, '0.4');
  flushSync(() => opacitySlider.dispatchEvent(new Event('input', { bubbles: true })));
  await settle(2);
  await waitFor(() => {
    const stored = JSON.parse(localStorage.getItem('pomchat_config') || '{}');
    const slide = stored.background?.slides?.find((entry: BackgroundSlideItem) => entry.id === 'viz-1');
    return slide?.opacity === 0.4;
  }, 'The opacity slider must update the asset');
  opacitySetter.call(opacitySlider, '1');
  flushSync(() => opacitySlider.dispatchEvent(new Event('input', { bubbles: true })));
  await settle(2);
  checks.push('opacity is a 0–1 slider that updates the asset');

  // The asset must expose the same draggable box as images and text.
  const editButton = [...document.querySelectorAll<HTMLElement>('button')].find((el) => el.textContent?.includes(t('project.editAudioVizAsset')));
  click(editButton ?? null);
  await settle();
  await settle(6);
  const hitLayer = document.querySelector<HTMLElement>('[data-slide-hit-id="viz-1"]');
  if (!hitLayer) throw new Error('The visualization must expose a draggable area in edit mode');
  // Inline styles carry canvas coordinates, so they stay valid regardless of page scrolling.
  const overlayPosition = () => ({ left: Number.parseFloat(hitLayer.style.left), top: Number.parseFloat(hitLayer.style.top) });
  const before = overlayPosition();
  const rect = hitLayer.getBoundingClientRect();
  const startX = rect.left + rect.width / 2;
  const startY = rect.top + rect.height / 2;
  const pointer = (type: string, clientX: number, clientY: number, buttons: number) => new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
    button: 0, buttons, clientX, clientY,
  });
  hitLayer.dispatchEvent(pointer('pointerdown', startX, startY, 1));
  await settle(2);
  window.dispatchEvent(pointer('pointermove', startX + 60, startY + 30, 1));
  await settle(2);
  window.dispatchEvent(pointer('pointerup', startX + 60, startY + 30, 0));
  await settle(4);
  const after = overlayPosition();
  if (!(after.left > before.left + 5) || !(after.top > before.top + 3)) {
    throw new Error(`Dragging the asset must move it: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  }
  await waitFor(() => {
    const stored = JSON.parse(localStorage.getItem('pomchat_config') || '{}');
    const slide = stored.background?.slides?.find((entry: BackgroundSlideItem) => entry.id === 'viz-1');
    return slide && (slide.offsetX !== 0 || slide.offsetY !== 0);
  }, 'Dragging must persist the new offsets');
  const movedSlide = JSON.parse(localStorage.getItem('pomchat_config')!).background.slides.find((entry: BackgroundSlideItem) => entry.id === 'viz-1');
  if (!(movedSlide.offsetX > 0 && movedSlide.offsetY > 0)) throw new Error(`Offsets must follow the drag direction: ${JSON.stringify(movedSlide.offsetX)}/${JSON.stringify(movedSlide.offsetY)}`);
  // Put it back so the panel checks below see the stored values.
  click(editButton ?? null);
  await settle(2);
  checks.push('the visualization can be dragged like other assets');
  seek(1.25);
  await settle(4);

  setSelect(document.querySelector<HTMLSelectElement>('[data-testid="audio-viz-mode"]')!, 'energy');
  await settle();
  seek(1.05);
  await settle(4);
  if (!readHeights('svg[aria-label="Viz"]').some((height) => height > 3.01)) throw new Error('Energy mode must keep a scrolling history');
  if (cornerXs() !== spectrumXs) throw new Error('Switching the mode must keep the bars in place');
  checks.push('screenshot state: energy');

  setSelect(document.querySelector<HTMLSelectElement>('[data-testid="audio-viz-mode"]')!, 'spectrum');
  await settle();
  checks.push('the panel switches the animation mode without breaking the preview');

  click(document.querySelector<HTMLElement>('[data-slide-tab-id="viz-bad"]'));
  await settle();
  const clamped = readPanel();
  if (clamped.bars !== '96') throw new Error(`Bars must be clamped on load, got ${clamped.bars}`);
  if (clamped.mode !== 'energy' || clamped.alignment !== 'center') throw new Error(`Stored mode must survive loading: ${JSON.stringify(clamped)}`);
  if (clamped.width !== '794' || clamped.height !== '103') throw new Error(`An unusable box must fall back to the default: ${JSON.stringify(clamped)}`);
  if (readHeights('svg[aria-label="VizBad"]').length !== 96) throw new Error('The preview must use the clamped bar count');
  if (document.querySelectorAll('[data-testid^="audio-viz-gradient-color-"]').length !== 3) {
    throw new Error('Invalid gradient colors must fall back to the defaults');
  }
  click(document.querySelector<HTMLElement>('[data-slide-tab-id="viz-1"]'));
  await settle();
  if (readPanel().bars !== '24') throw new Error('Selecting the first asset must show its own settings');
  checks.push('stored values are clamped and invalid colors fall back to the defaults');

  return checks;
}

/** Bring part of the asset panel into view so a screenshot can be reviewed. */
export async function scrollAudioVizControlsIntoView(target: 'controls' | 'opacity' | 'layer' | 'rotation' | 'image' = 'controls') {
  const selectors = {
    opacity: '[data-testid="asset-opacity"]',
    layer: '[data-testid="asset-layer"]',
    rotation: '[data-testid="asset-rotation"]',
    image: '[data-testid="asset-image-border-width"]',
    controls: '[data-testid="audio-viz-mode"]',
  } as const;
  const selector = selectors[target];
  document.querySelector(selector)?.scrollIntoView({ block: 'center' });
  await settle(4);
}

/** Extra screenshot states, captured between phases. */
export async function setAudioVizEditorScreenshotState(state: 'spectrum' | 'energy') {
  setSelect(document.querySelector<HTMLSelectElement>('[data-testid="audio-viz-mode"]')!, state);
  await settle();
  seek(state === 'energy' ? 1.05 : 1.25);
  await settle(4);
}

export async function finishAudioVizEditorTest() {
  const checks: string[] = [];
  const before = document.querySelectorAll('svg[role="img"]').length;
  click(document.querySelector<HTMLButtonElement>('[data-testid="add-audio-viz"]'));
  await settle();
  await waitFor(() => document.querySelectorAll('svg[role="img"]').length === before + 1, 'Adding a visualization must render another asset');
  await waitFor(() => document.querySelector<HTMLInputElement>('[data-testid="audio-viz-bars"] input')?.value === '48', 'The new asset must become active in the panel');
  const addedPanel = readPanel();
  if (addedPanel.mode !== 'spectrum' || addedPanel.corners !== 'rounded' || addedPanel.colorMode !== 'solid') {
    throw new Error(`Unexpected new asset defaults: ${JSON.stringify(addedPanel)}`);
  }
  if (addedPanel.width !== '794' || addedPanel.height !== '103') throw new Error(`Unexpected new asset box: ${JSON.stringify(addedPanel)}`);

  const isAddedSlide = (slide: BackgroundSlideItem) => slide.type === 'audio-viz' && !['viz-1', 'viz-bad'].includes(slide.id);
  await waitFor(() => {
    const stored = JSON.parse(localStorage.getItem('pomchat_config') || '{}');
    return stored.background?.slides?.some(isAddedSlide);
  }, 'The new asset must persist');
  const stored = JSON.parse(localStorage.getItem('pomchat_config')!);
  const added = stored.background.slides.find(isAddedSlide);
  const expectedDefaults = {
    audioVizMode: 'spectrum', audioVizColorMode: 'solid', audioVizColor: '#ED7E96', audioVizCornerStyle: 'rounded',
    audioVizAlignment: 'bottom', audioVizBars: 48, audioVizGain: 5, audioVizSmoothing: 0.04, layer: 'background',
  };
  for (const [key, value] of Object.entries(expectedDefaults)) {
    if (added[key] !== value) throw new Error(`New asset ${key} must default to ${JSON.stringify(value)}, got ${JSON.stringify(added[key])}`);
  }
  if (added.visible === false) throw new Error('A new visualization must be visible');
  if (added.audioVizWidth !== 794 || added.audioVizHeight !== 103) throw new Error(`New asset box must persist, got ${added.audioVizWidth}x${added.audioVizHeight}`);
  if (added.inheritBackgroundFilters !== false) throw new Error('A visualization must not inherit the background blur by default');
  if (added.start !== 0 || Math.abs(added.end - 1.6) > 0.05) {
    throw new Error(`A visualization must cover the whole audio by default, got ${added.start}–${added.end}`);
  }
  checks.push('adding a visualization stores the documented defaults');

  // Rotation, border width, shadow size and animation duration are sliders now.
  const readRange = (id: string) => document.querySelector<HTMLInputElement>(`[data-testid="${id}"]`);
  const setRange = async (element: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    flushSync(() => element.dispatchEvent(new Event('input', { bubbles: true })));
    await settle(2);
  };
  const storedSlide = (id: string) => {
    const stored = JSON.parse(localStorage.getItem('pomchat_config') || '{}');
    return stored.background?.slides?.find((slide: BackgroundSlideItem) => slide.id === id);
  };
  for (const [id, min, max, step] of [
    ['asset-rotation', '-180', '180', '1'],
    ['asset-animation-duration', '0', '2', '0.01'],
  ]) {
    const range = readRange(id);
    if (!range || range.type !== 'range' || range.min !== min || range.max !== max || range.step !== step) {
      throw new Error(`${id} must be a ${min}..${max} slider (step ${step}), got ${range ? `${range.type} ${range.min}..${range.max}/${range.step}` : 'missing'}`);
    }
  }
  const activeId = (() => {
    const stored = JSON.parse(localStorage.getItem('pomchat_config') || '{}');
    return stored.background.slides.find(isAddedSlide)?.id;
  })();
  await setRange(readRange('asset-rotation')!, '90');
  await setRange(readRange('asset-animation-duration')!, '0.5');
  await waitFor(() => storedSlide(activeId)?.rotation === 90 && storedSlide(activeId)?.animationDuration === 0.5, 'The rotation and animation sliders must update the asset');

  // The image-only sliders appear for image assets.
  click(button(t('project.addImageAsset')));
  await settle();
  for (const [id, min, max] of [['asset-image-border-width', '0', '40'], ['asset-image-shadow-size', '0', '80']]) {
    const range = readRange(id);
    if (!range || range.type !== 'range' || range.min !== min || range.max !== max) {
      throw new Error(`${id} must be a ${min}..${max} slider, got ${range ? `${range.type} ${range.min}..${range.max}` : 'missing'}`);
    }
  }
  const isImageSlide = (slide: BackgroundSlideItem) => slide.type === 'image';
  await waitFor(() => {
    const stored = JSON.parse(localStorage.getItem('pomchat_config') || '{}');
    return stored.background?.slides?.some(isImageSlide);
  }, 'The image asset must persist');
  const imageId = JSON.parse(localStorage.getItem('pomchat_config')!).background.slides.find(isImageSlide).id;
  await setRange(readRange('asset-image-border-width')!, '6');
  await setRange(readRange('asset-image-shadow-size')!, '12');
  await waitFor(() => storedSlide(imageId)?.imageBorderWidth === 6 && storedSlide(imageId)?.imageShadowSize === 12, 'The image sliders must update the asset');
  checks.push('rotation, border width, shadow size and animation duration are sliders');

  return checks;
}

/** Speaker and annotation on/off controls must be buttons rather than checkboxes. */
export async function runSpeakerToggleTest() {
  const toggle = (id: string) => document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
  const storedSpeaker = (id: string) => {
    const stored = JSON.parse(localStorage.getItem('pomchat_config') || '{}');
    return stored.speakers?.[id];
  };
  const checks: string[] = [];

  click(button(t('tab.speakers')));
  await settle();
  const avatar = toggle('speaker-show-avatar');
  if (!avatar || avatar.getAttribute('aria-pressed') !== 'true') throw new Error('Show avatar must be an on/off button');
  if (avatar.textContent?.trim() !== t('common.enabled')) throw new Error(`The avatar toggle must read Enabled, got "${avatar.textContent?.trim()}"`);
  click(avatar);
  await settle();
  await waitFor(() => storedSpeaker('A')?.showAvatar === false, 'The avatar button must update the speaker');
  if (toggle('speaker-show-avatar')?.getAttribute('aria-pressed') !== 'false') throw new Error('The avatar button must reflect the new state');
  click(toggle('speaker-show-avatar'));
  await settle();

  const bubble = toggle('speaker-bubble-shadow');
  const text = toggle('speaker-text-shadow');
  if (!bubble || !text) throw new Error('Shadow controls must be buttons');
  if (bubble.getAttribute('aria-pressed') !== 'true' || text.getAttribute('aria-pressed') !== 'true') {
    throw new Error('Shadows stay enabled by default');
  }
  const labelSpans = (text: string) => [...document.querySelectorAll('span')].filter((el) => el.textContent?.trim() === text);
  const borderWidthLabels = labelSpans(t('speakers.borderWidth'));
  if (borderWidthLabels.length !== 1) {
    throw new Error(`Bubble border width must appear exactly once, found ${borderWidthLabels.length}`);
  }
  const radiusLabel = labelSpans(t('speakers.borderRadius'))[0];
  const borderOpacityLabel = labelSpans(t('speakers.borderOpacity'))[0];
  if (!radiusLabel || !borderOpacityLabel) throw new Error('Border radius and border opacity must both be present');
  if (Math.abs(radiusLabel.getBoundingClientRect().top - borderOpacityLabel.getBoundingClientRect().top) > 1) {
    throw new Error('Border radius and border opacity must share a row');
  }
  click(bubble);
  await settle();
  await waitFor(() => storedSpeaker('A')?.style?.bubbleShadow === false, 'The bubble shadow button must update the speaker style');
  click(toggle('speaker-bubble-shadow'));
  await settle();
  checks.push('avatar and speaker shadow settings use on/off buttons');
  checks.push('bubble border width appears once and radius shares a row with border opacity');

  click(button(t('tab.annotation')));
  await settle();
  const annotationText = toggle('annotation-text-shadow');
  const annotationBubble = toggle('annotation-bubble-shadow');
  if (!annotationText || !annotationBubble) throw new Error('Annotation shadow controls must be buttons');
  click(annotationText);
  await settle();
  await waitFor(() => storedSpeaker('ANNOTATION')?.style?.textShadow === false, 'The annotation shadow button must update the annotation style');
  click(toggle('annotation-text-shadow'));
  await settle();
  checks.push('annotation shadow settings use on/off buttons');
  return checks;
}

/** Bring the speaker style block into view for a screenshot. */
export async function openSpeakersForScreenshot() {
  click(button(t('tab.speakers')));
  await settle();
  document.querySelector('[data-testid="speaker-bubble-shadow"]')?.scrollIntoView({ block: 'center' });
  await settle(4);
}

export function closeAudioVizEditorTest() {
  editorRoot?.unmount();
  editorRoot = null;
}

/** Helpers for comparing the browser's own analysis with the Node side. */
let sampledAudio: { grids: number; levels: number; levelCount: number } = { grids: 0, levels: 0, levelCount: 0 };
export function buildGridFromChannels(channels: Float32Array[], sampleRate: number) {
  sampledAudio = { ...sampledAudio, grids: sampledAudio.grids + 1 };
  return buildAudioVizGrid(channels, sampleRate);
}
export function levelsFromGrid(grid: AudioVizGrid, time: number, mode: 'energy' | 'spectrum') {
  const levels = getAudioVizLevels(grid, time, { mode, count: 48, gain: 5, smoothingSeconds: 0.04 });
  sampledAudio = { ...sampledAudio, levels: sampledAudio.levels + 1, levelCount: levels.length };
  return levels;
}
export function getSampledAudio() {
  return sampledAudio;
}

/** Load a grid over HTTP and compare it with levels computed on the Node side. */
export async function runAudioVizGridFetchTest(url: string, expected: { time: number; levels: number[] }[]) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Grid request failed with ${response.status}`);
  const grid: AudioVizGrid | null = decodeAudioVizGrid(await response.arrayBuffer());
  if (!grid) throw new Error('The served grid could not be decoded');
  for (const entry of expected) {
    const levels = getAudioVizLevels(grid, entry.time, { mode: 'spectrum', count: 24, gain: 5, smoothingSeconds: 0 });
    if (levels.length !== entry.levels.length || levels.some((level, index) => Math.abs(level - entry.levels[index]) > 1e-6)) {
      throw new Error(`Fetched grid differs at ${entry.time}s: ${levels.slice(0, 6).join(',')} vs ${entry.levels.slice(0, 6).join(',')}`);
    }
  }
  if (decodeAudioVizGrid(new Uint8Array(16)) !== null) throw new Error('A truncated grid must not decode');
  return { frames: grid.frames, duration: grid.duration };
}

/** Build a grid in the page the same way the web preview does, for parity with Node. */
export async function buildGridInBrowser(audioUrl: string) {
  const response = await fetch(audioUrl);
  const encoded = await response.arrayBuffer();
  const context = new AudioContext({ sampleRate: AUDIO_VIZ_SAMPLE_RATE });
  try {
    const decoded = await context.decodeAudioData(encoded);
    const grid = buildAudioVizGrid(
      Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index)),
      decoded.sampleRate,
    );
    return {
      duration: grid.duration,
      frames: grid.frames,
      spectrum: [0.25, 0.75, 1.25].map((time) => getAudioVizLevels(grid, time, { mode: 'spectrum', count: 24, gain: 5, smoothingSeconds: 0 })),
      energy: [0.25, 0.75, 1.25].map((time) => getAudioVizLevels(grid, time, { mode: 'energy', count: 24, gain: 5, smoothingSeconds: 0 })),
    };
  } finally {
    await context.close();
  }
}

/**
 * Render the asset at the exact export canvas size and background colour, unscaled,
 * so a screenshot of the viewport can be compared with a rendered still.
 */
let canvasPreviewRoot: Root | null = null;
export async function mountCanvasPreview(url: string, currentTime: number) {
  const response = await fetch(url);
  const grid = decodeAudioVizGrid(await response.arrayBuffer());
  if (!grid) throw new Error('The served grid could not be decoded');
  canvasPreviewRoot?.unmount();
  document.getElementById('canvas-preview')?.remove();
  document.body.style.margin = '0';
  const container = document.createElement('div');
  container.id = 'canvas-preview';
  Object.assign(container.style, {
    position: 'fixed', left: '0px', top: '0px', width: '1280px', height: '720px',
    background: '#1f2937', overflow: 'hidden', zIndex: '99999',
  });
  document.body.append(container);
  canvasPreviewRoot = createRoot(container);
  flushSync(() => canvasPreviewRoot!.render(
    <AudioVizAsset
      slide={AUDIO_VIZ_EXPORT_SLIDE}
      grid={grid}
      currentTime={currentTime}
      canvasWidth={1280}
      canvasHeight={720}
      label="Viz"
    />,
  ));
  await settle(6);
  return true;
}

/** Same canvas mount, but the grid is built by the browser the way the web preview does. */
export async function mountCanvasPreviewFromAudio(audioUrl: string, currentTime: number) {
  const response = await fetch(audioUrl);
  const encoded = await response.arrayBuffer();
  const context = new AudioContext({ sampleRate: AUDIO_VIZ_SAMPLE_RATE });
  let grid: AudioVizGrid;
  try {
    const decoded = await context.decodeAudioData(encoded);
    grid = buildAudioVizGrid(
      Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index)),
      decoded.sampleRate,
    );
  } finally {
    await context.close();
  }
  canvasPreviewRoot?.unmount();
  document.getElementById('canvas-preview')?.remove();
  document.body.style.margin = '0';
  const container = document.createElement('div');
  container.id = 'canvas-preview';
  Object.assign(container.style, {
    position: 'fixed', left: '0px', top: '0px', width: '1280px', height: '720px',
    background: '#1f2937', overflow: 'hidden', zIndex: '99999',
  });
  document.body.append(container);
  canvasPreviewRoot = createRoot(container);
  flushSync(() => canvasPreviewRoot!.render(
    <AudioVizAsset
      slide={AUDIO_VIZ_EXPORT_SLIDE}
      grid={grid}
      currentTime={currentTime}
      canvasWidth={1280}
      canvasHeight={720}
      label="Viz"
    />,
  ));
  await settle(6);
  return true;
}

export function unmountCanvasPreview() {
  canvasPreviewRoot?.unmount();
  canvasPreviewRoot = null;
  document.getElementById('canvas-preview')?.remove();
}

/** Render the shared asset component, used by both the editor preview and the export. */
export async function runAudioVizComponentTest(url: string) {
  const response = await fetch(url);
  const grid = decodeAudioVizGrid(await response.arrayBuffer());
  if (!grid) throw new Error('The served grid could not be decoded');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const slide: BackgroundSlideItem = { ...AUDIO_VIZ_SLIDE, audioVizBars: 24 };
  const render = (currentTime: number) => {
    flushSync(() => root.render(<AudioVizAsset slide={slide} grid={grid} currentTime={currentTime} canvasWidth={1280} label="Component" />));
  };
  try {
    render(0.75);
    const loud = readHeights('svg[aria-label="Component"]');
    const x = [...document.querySelectorAll<SVGRectElement>('svg[aria-label="Component"] rect')].map((rect) => rect.getAttribute('x'));
    const radius = [...document.querySelectorAll<SVGRectElement>('svg[aria-label="Component"] rect')].map((rect) => Number(rect.getAttribute('rx')));
    render(1.25);
    const silent = readHeights('svg[aria-label="Component"]');
    render(0.75);
    const again = readHeights('svg[aria-label="Component"]');
    return {
      bars: loud.length,
      loud: Math.max(...loud),
      silent: Math.max(...silent),
      deterministic: loud.join(',') === again.join(','),
      xAttributes: new Set(x).size,
      cornerRadius: radius.every((value) => value === radius[0]) ? radius[0] : null,
    };
  } finally {
    root.unmount();
    container.remove();
  }
}
