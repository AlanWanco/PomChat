import type { BackgroundSlideItem } from './types';

export const TEXT_ASSET_LINE_HEIGHT = 1.15;

export const getTextAssetLayout = (slide: BackgroundSlideItem) => {
  const textLines = (slide.text || '').split('\n');
  const fontSize = slide.fontSize ?? 96;
  const strokeWidth = slide.textStrokeWidth ?? 0;
  const longestLine = textLines.reduce((max, line) => Math.max(max, line.length), 1);
  const lineCount = Math.max(1, textLines.length);
  const estimatedWidth = Math.max(120, longestLine * fontSize * 0.62 + strokeWidth * 4 + 16);
  const estimatedHeight = Math.max(fontSize * 1.2, lineCount * fontSize * TEXT_ASSET_LINE_HEIGHT + strokeWidth * 4 + 16);

  return {
    textLines,
    fontSize,
    strokeWidth,
    estimatedWidth,
    estimatedHeight,
  };
};

export const getTextAssetSvgMetrics = ({
  width,
  height,
  fontSize,
  lineCount,
  textAlign = 'center',
}: {
  width: number;
  height: number;
  fontSize: number;
  lineCount: number;
  textAlign?: 'left' | 'center' | 'right';
}) => {
  const contentHeight = lineCount * fontSize * TEXT_ASSET_LINE_HEIGHT;
  const startY = height / 2 - contentHeight / 2;

  const textAnchorX = textAlign === 'left' ? 0 : textAlign === 'right' ? width : width / 2;

  return {
    textAnchorX,
    getLineY: (index: number) => startY + index * fontSize * TEXT_ASSET_LINE_HEIGHT,
  };
};
