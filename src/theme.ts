const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeHex = (hex: string) => {
  const cleaned = hex.replace('#', '').trim();
  return cleaned.length === 3
    ? cleaned.split('').map((char) => char + char).join('')
    : cleaned;
};

export const hexToRgb = (hex: string) => {
  const normalized = normalizeHex(hex);
  const int = Number.parseInt(normalized, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255
  };
};

export const rgba = (hex: string, alpha: number) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const mix = (base: string, target: string, amount: number) => {
  const ratio = clamp(amount, 0, 1);
  const a = hexToRgb(base);
  const b = hexToRgb(target);
  const channel = (x: number, y: number) => Math.round(x + (y - x) * ratio).toString(16).padStart(2, '0');
  return `#${channel(a.r, b.r)}${channel(a.g, b.g)}${channel(a.b, b.b)}`;
};

export const createThemeTokens = (themeColor: string, isDarkMode: boolean) => {
  const accent = themeColor;

  if (isDarkMode) {
    return {
      accent,
      accentSoft: rgba(accent, 0.1),
      accentMuted: rgba(accent, 0.06),
      accentBorder: rgba(accent, 0.28),
      accentStrongBorder: rgba(accent, 0.58),
      appBg: mix(accent, '#050505', 0.9),
      panelBg: mix(accent, '#0b0d10', 0.84),
      panelBgElevated: mix(accent, '#11151a', 0.68),
      panelBgSubtle: mix(accent, '#172432', 0.6),
      toolbarBg: mix(accent, '#0d1524', 0.72),
      cardBg: rgba(mix(accent, '#1a1f25', 0.7), 0.78),
      hoverBg: rgba(accent, 0.12),
      border: rgba(mix(accent, '#5b6470', 0.52), 0.42),
      text: '#f5f7fa',
      textMuted: 'rgba(229, 231, 235, 0.72)',
      textSoft: 'rgba(229, 231, 235, 0.5)',
      inputBg: rgba(mix(accent, '#14181d', 0.76), 0.92),
      shadow: 'rgba(0, 0, 0, 0.14)'
    };
  }

  return {
    accent,
    accentSoft: rgba(accent, 0.09),
    accentMuted: rgba(accent, 0.05),
    accentBorder: rgba(accent, 0.22),
    accentStrongBorder: rgba(accent, 0.46),
    appBg: mix(accent, '#f4f5f7', 0.9),
    panelBg: mix(accent, '#ffffff', 0.93),
    panelBgElevated: mix(accent, '#fbfbfc', 0.86),
    panelBgSubtle: mix(accent, '#f5f7fa', 0.8),
    toolbarBg: mix(accent, '#ffffff', 0.9),
    cardBg: rgba(mix(accent, '#ffffff', 0.9), 0.94),
    hoverBg: rgba(accent, 0.08),
    border: rgba(mix(accent, '#a8b0bc', 0.5), 0.42),
    text: '#111827',
    textMuted: 'rgba(55, 65, 81, 0.72)',
    textSoft: 'rgba(75, 85, 99, 0.56)',
    inputBg: rgba(mix(accent, '#ffffff', 0.96), 0.98),
    shadow: 'rgba(15, 23, 42, 0.08)'
  };
};
