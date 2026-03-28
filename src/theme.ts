const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeHex = (hex: string) => {
  const cleaned = hex.replace('#', '').trim();
  return cleaned.length === 3
    ? cleaned.split('').map((char) => char + char).join('')
    : cleaned;
};

const rgbToHsl = (r: number, g: number, b: number) => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
};

const hslToRgb = (h: number, s: number, l: number) => {
  h = h / 360;
  s = s / 100;
  l = l / 100;
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return [
    Math.round(r * 255),
    Math.round(g * 255),
    Math.round(b * 255)
  ];
};

export const desaturateHex = (hex: string, amount: number) => {
  const normalized = normalizeHex(hex);
  const r = Number.parseInt(normalized.substring(0, 2), 16);
  const g = Number.parseInt(normalized.substring(2, 4), 16);
  const b = Number.parseInt(normalized.substring(4, 6), 16);
  
  const [h, s, l] = rgbToHsl(r, g, b);
  const newS = Math.max(0, s - amount);
  const [nr, ng, nb] = hslToRgb(h, newS, l);
  
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
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
  let accent = themeColor;
  
  // 在深色模式下降低主题色饱和度
  if (isDarkMode) {
    accent = desaturateHex(themeColor, 15);
  }

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
