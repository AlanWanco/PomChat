import React, { useEffect, useMemo } from 'react';
import { AudioEnergyBars } from './AudioEnergyBars';
import { AUDIO_VIZ_BAR_LIMITS, getAudioVizLevels, type AudioVizGrid } from './audioVizGrid';
import {
  AUDIO_VIZ_DEFAULT_ALIGNMENT,
  AUDIO_VIZ_DEFAULT_BARS,
  AUDIO_VIZ_DEFAULT_COLOR,
  AUDIO_VIZ_DEFAULT_GAIN,
  AUDIO_VIZ_DEFAULT_MODE,
  AUDIO_VIZ_DEFAULT_SMOOTHING,
  getAudioVizBaseSize,
  getAudioVizBounds,
} from './audioVizLayout';
import { getBubbleMotionState } from '../components/chat/SharedChatBubbles';
import type { BackgroundSlideItem } from './types';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export interface AudioVizAssetProps {
  slide: BackgroundSlideItem;
  /** Analysis of the project audio; `null` renders the silent baseline. */
  grid: AudioVizGrid | null;
  canvasWidth: number;
  canvasHeight: number;
  currentTime: number;
  label: string;
  blur?: number;
  brightness?: number;
  children?: React.ReactNode;
  /** Editor only: reports the asset box so the preview can offer dragging and selection. */
  onEditBoxChange?: (box: { centerX: number; centerY: number; width: number; height: number }) => void;
}

/**
 * Audio visualization asset. Pure geometry and SVG, so the editor preview and the
 * Remotion export share one implementation instead of two approximations.
 */
export function AudioVizAsset({
  slide,
  grid,
  canvasWidth,
  canvasHeight,
  currentTime,
  label,
  blur = 0,
  brightness = 1,
  children,
  onEditBoxChange,
}: AudioVizAssetProps) {
  const base = getAudioVizBaseSize(slide, canvasWidth);
  const bounds = getAudioVizBounds(slide, canvasWidth, canvasHeight);

  // The editor deduplicates identical boxes, so re-reporting on each render is harmless.
  useEffect(() => {
    if (!onEditBoxChange) return;
    onEditBoxChange({
      centerX: bounds.left + bounds.width / 2,
      centerY: bounds.top + bounds.height / 2,
      width: bounds.width,
      height: bounds.height,
    });
  }, [onEditBoxChange, bounds.left, bounds.top, bounds.width, bounds.height]);
  const barCount = Math.round(Math.max(AUDIO_VIZ_BAR_LIMITS.min, Math.min(AUDIO_VIZ_BAR_LIMITS.max, slide.audioVizBars ?? AUDIO_VIZ_DEFAULT_BARS)));
  const alignment = slide.audioVizAlignment === 'center' ? 'center' : AUDIO_VIZ_DEFAULT_ALIGNMENT;
  const levels = useMemo(() => (grid
    ? getAudioVizLevels(grid, currentTime, {
        mode: slide.audioVizMode === 'energy' ? 'energy' : AUDIO_VIZ_DEFAULT_MODE,
        count: barCount,
        gain: slide.audioVizGain ?? AUDIO_VIZ_DEFAULT_GAIN,
        smoothingSeconds: slide.audioVizSmoothing ?? AUDIO_VIZ_DEFAULT_SMOOTHING,
      })
    : Array(barCount).fill(0)),
  [grid, currentTime, barCount, slide.audioVizMode, slide.audioVizGain, slide.audioVizSmoothing]);
  const animationStyle = slide.animationStyle || 'fade';
  const animationDuration = slide.animationDuration ?? 0.24;
  const instantAppearanceEpsilon = animationStyle === 'none' || animationDuration <= 0 ? (1 / 120) : 0;
  const appearanceTime = Math.max(0, slide.start - (animationStyle === 'none' ? 0 : animationDuration) - instantAppearanceEpsilon);
  const progress = animationStyle === 'none' || animationDuration <= 0
    ? 1
    : clamp01((currentTime - appearanceTime) / animationDuration);
  const disappearProgress = typeof slide.end === 'number' && currentTime > slide.end && animationStyle !== 'none' && animationDuration > 0
    ? clamp01(1 - ((currentTime - slide.end) / animationDuration))
    : 1;
  const motionState = getBubbleMotionState(progress * disappearProgress, animationStyle, 'left');
  const transform = [
    'translate(-50%, -50%)',
    `translate(${slide.offsetX ?? 0}px, ${slide.offsetY ?? 0}px)`,
    `rotate(${slide.rotation ?? 0}deg)`,
    `scale(${slide.scale ?? 1})`,
    motionState.transform || '',
  ].join(' ').trim();

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: `${base.width}px`,
        height: `${base.height}px`,
        transform,
        transformOrigin: '50% 50%',
        opacity: (slide.opacity ?? 1) * motionState.opacity,
        filter: `blur(${blur}px) brightness(${brightness})`,
        pointerEvents: 'none',
      }}
    >
      <AudioEnergyBars
        levels={levels}
        color={slide.audioVizColor || AUDIO_VIZ_DEFAULT_COLOR}
        colorMode={slide.audioVizColorMode === 'gradient' ? 'gradient' : 'solid'}
        gradientColors={slide.audioVizColors}
        alignment={alignment}
        cornerStyle={slide.audioVizCornerStyle === 'square' ? 'square' : 'rounded'}
        width={base.width}
        height={base.height}
        label={label}
      />
      {children}
    </div>
  );
}
