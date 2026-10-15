import { memo, useId } from 'react';

interface AudioEnergyBarsProps {
  levels: readonly number[];
  color: string;
  colorMode?: 'solid' | 'gradient';
  gradientColors?: readonly string[];
  width?: number;
  height?: number;
  alignment?: 'center' | 'bottom';
  cornerStyle?: 'rounded' | 'square';
  label: string;
}

/** Pure SVG: shared geometry for a browser preview and a future frame-based export. */
export const AudioEnergyBars = memo(function AudioEnergyBars({
  levels,
  color,
  colorMode = 'solid',
  gradientColors = [],
  width = 920,
  height = 120,
  alignment = 'center',
  cornerStyle = 'rounded',
  label,
}: AudioEnergyBarsProps) {
  const safeWidth = Number.isFinite(width) ? Math.max(1, width) : 920;
  const safeHeight = Number.isFinite(height) ? Math.max(1, height) : 120;
  const stride = safeWidth / Math.max(1, levels.length);
  const barWidth = stride * 0.62;
  const gradientId = `audio-bars-gradient-${useId()}`;
  const colors = gradientColors.slice(0, 5);
  const useGradient = colorMode === 'gradient' && colors.length >= 2;
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${safeWidth} ${safeHeight}`} role="img" aria-label={label}>
      {useGradient && <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={safeWidth} y2={0}>
          {colors.map((stopColor, index) => <stop key={index} offset={index / (colors.length - 1)} stopColor={stopColor} />)}
        </linearGradient>
      </defs>}
      {levels.map((level, index) => {
        const normalized = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
        const barHeight = Math.max(Math.min(3, safeHeight), normalized * safeHeight);
        return <rect
          key={index}
          x={index * stride + (stride - barWidth) / 2}
          y={alignment === 'bottom' ? safeHeight - barHeight : (safeHeight - barHeight) / 2}
          width={barWidth}
          height={barHeight}
          rx={cornerStyle === 'square' ? 0 : barWidth / 2}
          fill={useGradient ? `url(#${gradientId})` : color}
        />;
      })}
    </svg>
  );
});
