import React from 'react';
/* eslint-disable react-refresh/only-export-components */
import { Composition, registerRoot } from 'remotion';
import { PodchatComposition } from './PodchatComposition';
import type { PodchatExportInput } from './types';

const defaultProps: PodchatExportInput = {
  fps: 60,
  dimensions: {
    width: 1920,
    height: 1080,
  },
  audioPath: '',
  background: {},
  chatLayout: {},
  speakers: {},
  content: [],
  fontPresets: {},
  exportRange: {
    start: 0,
    end: 3,
  },
};

const getDurationInFrames = (start: number, end: number, fps: number) => {
  const durationInFrames = Math.max(0.1, end - start) * fps;
  const nearestInteger = Math.round(durationInFrames);
  // Decimal export ranges can produce values such as 333.00000000000006.
  // Do not let floating-point noise make Math.ceil() add an extra frame.
  return Math.max(1, Math.abs(durationInFrames - nearestInteger) < 1e-7 ? nearestInteger : Math.ceil(durationInFrames));
};

const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="PodchatRender"
      component={PodchatComposition as unknown as React.ComponentType<Record<string, unknown>>}
      width={1920}
      height={1080}
      fps={60}
      durationInFrames={180}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => {
        const input = props as unknown as PodchatExportInput;
        const safeFps = Math.max(1, Math.round(input.fps || 60));
        const width = Math.max(16, Math.round(input.dimensions?.width || 1920));
        const height = Math.max(16, Math.round(input.dimensions?.height || 1080));
        const durationInFrames = getDurationInFrames(input.exportRange.start, input.exportRange.end, safeFps);
        return {
          fps: safeFps,
          width,
          height,
          durationInFrames,
        };
      }}
    />
  );
};

registerRoot(RemotionRoot);
