export type FontPreset = {
  id: string;
  name: string;
  family: string;
  filePath: string;
  weight?: string;
  style?: 'normal' | 'italic';
};

export type FontPresetMap = Record<string, FontPreset>;

export const FONT_FILE_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'];

export const isSupportedFontFile = (value: string) => {
  const path = value.trim().replace(/^['"]|['"]$/g, '');
  return FONT_FILE_EXTENSIONS.some((extension) => path.toLowerCase().endsWith(`.${extension}`));
};

export const createFontPresetFamilyName = (id: string) => {
  const normalized = id
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `PomChat_Font_${normalized || 'Custom'}`;
};

export const formatFontFamilyValue = (family: string) => {
  const safeFamily = family.trim() || 'PomChat_Font_Custom';
  return `"${safeFamily.replace(/"/g, '\\"')}", sans-serif`;
};

const cssEscape = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '');

const getFontFormat = (filePath: string) => {
  const ext = filePath.split('?')[0]?.split('#')[0]?.split('.').pop()?.toLowerCase();
  if (ext === 'ttf') return 'truetype';
  if (ext === 'otf') return 'opentype';
  if (ext === 'woff') return 'woff';
  if (ext === 'woff2') return 'woff2';
  return '';
};

export const buildFontFaceCss = (fontPresets: FontPresetMap | undefined | null) => {
  return Object.values(fontPresets || {})
    .filter((preset) => preset?.family && preset?.filePath)
    .map((preset) => {
      const format = getFontFormat(preset.filePath);
      const source = `url("${cssEscape(preset.filePath)}")${format ? ` format("${format}")` : ''}`;
      return [
        '@font-face {',
        `  font-family: "${cssEscape(preset.family)}";`,
        `  src: ${source};`,
        `  font-weight: ${preset.weight || 'normal'};`,
        `  font-style: ${preset.style || 'normal'};`,
        '  font-display: swap;',
        '}',
      ].join('\n');
    })
    .join('\n\n');
};
