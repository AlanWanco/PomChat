import type { BackgroundSlideItem } from './types';

/** Defaults and geometry for audio visualization assets, shared by preview, panel and export. */
export const AUDIO_VIZ_DEFAULT_MODE = 'spectrum' as const;
export const AUDIO_VIZ_DEFAULT_ALIGNMENT = 'bottom' as const;
export const AUDIO_VIZ_DEFAULT_BARS = 48;
export const AUDIO_VIZ_DEFAULT_GAIN = 5;
export const AUDIO_VIZ_DEFAULT_SMOOTHING = 0.04;
export const AUDIO_VIZ_DEFAULT_COLORS = ['#ED7E96', '#C3A6F3', '#70C9DC'];
export const AUDIO_VIZ_DEFAULT_COLOR = AUDIO_VIZ_DEFAULT_COLORS[0];
export const AUDIO_VIZ_MAX_COLORS = 5;
export const AUDIO_VIZ_MIN_COLORS = 2;

/** Default box for a new audio visualization, relative to the canvas width. */
export const AUDIO_VIZ_DEFAULT_WIDTH_RATIO = 0.62;
export const AUDIO_VIZ_DEFAULT_HEIGHT_PER_WIDTH = 0.13;

/** Base box before `scale`; shared so the editor selection box matches the render. */
export function getAudioVizBaseSize(
  slide: Pick<BackgroundSlideItem, 'audioVizWidth' | 'audioVizHeight'>,
  canvasWidth: number,
) {
  const safeCanvasWidth = Number.isFinite(canvasWidth) && canvasWidth > 0 ? canvasWidth : 1920;
  const width = Math.max(24, slide.audioVizWidth ?? Math.round(safeCanvasWidth * AUDIO_VIZ_DEFAULT_WIDTH_RATIO));
  const height = Math.max(16, slide.audioVizHeight ?? Math.round(width * AUDIO_VIZ_DEFAULT_HEIGHT_PER_WIDTH));
  return { width, height };
}

/** Bounds in canvas pixels, including `scale`, used by the editor selection box. */
export function getAudioVizBounds(slide: BackgroundSlideItem, canvasWidth: number, canvasHeight: number) {
  const base = getAudioVizBaseSize(slide, canvasWidth);
  const scale = slide.scale ?? 1;
  const width = base.width * scale;
  const height = base.height * scale;
  return {
    left: canvasWidth / 2 + (slide.offsetX ?? 0) - width / 2,
    top: canvasHeight / 2 + (slide.offsetY ?? 0) - height / 2,
    width,
    height,
    baseWidth: base.width,
    baseHeight: base.height,
  };
}
