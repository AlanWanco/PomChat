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

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

export const getFontPresetSignature = (preset: Partial<FontPreset> | null | undefined) => stableStringify({
  name: (preset?.name || '').trim(),
  filePath: (preset?.filePath || '').trim(),
  weight: (preset?.weight || 'normal').trim(),
  style: preset?.style || 'normal',
});

export const findMatchingFontPresetId = (fontPresets: FontPresetMap | null | undefined, preset: Partial<FontPreset> | null | undefined) => {
  const targetSignature = getFontPresetSignature(preset);
  return Object.entries(fontPresets || {}).find(([, entry]) => getFontPresetSignature(entry) === targetSignature)?.[0];
};

export const replaceFontPresetFamilyReferences = <T extends Record<string, any>>(config: T, fromValues: string[], fallbacks?: {
  speakerFontFamily?: string;
  nameFontFamily?: string;
  timestampFontFamily?: string;
  slideFontFamily?: string;
}) => {
  const normalizedFrom = new Set(fromValues.map((value) => value.trim()).filter(Boolean));
  if (normalizedFrom.size === 0) {
    return config;
  }

  const matches = (value: unknown) => typeof value === 'string' && normalizedFrom.has(value.trim());
  let changed = false;
  const nextConfig = { ...config } as any;

  if (nextConfig.chatLayout && matches(nextConfig.chatLayout.timestampFontFamily)) {
    nextConfig.chatLayout = {
      ...nextConfig.chatLayout,
      timestampFontFamily: fallbacks?.timestampFontFamily || 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    };
    changed = true;
  }

  if (nextConfig.speakers && typeof nextConfig.speakers === 'object') {
    let speakersChanged = false;
    const nextSpeakers = Object.fromEntries(
      Object.entries(nextConfig.speakers).map(([speakerId, speaker]: [string, any]) => {
        if (!speaker?.style || typeof speaker.style !== 'object') {
          return [speakerId, speaker];
        }

        let speakerChanged = false;
        const nextStyle = { ...speaker.style };
        if (matches(nextStyle.fontFamily)) {
          nextStyle.fontFamily = fallbacks?.speakerFontFamily || 'system-ui';
          speakerChanged = true;
        }
        if (matches(nextStyle.nameFontFamily)) {
          nextStyle.nameFontFamily = fallbacks?.nameFontFamily || fallbacks?.speakerFontFamily || 'system-ui';
          speakerChanged = true;
        }

        if (!speakerChanged) {
          return [speakerId, speaker];
        }

        speakersChanged = true;
        return [speakerId, { ...speaker, style: nextStyle }];
      })
    );

    if (speakersChanged) {
      nextConfig.speakers = nextSpeakers;
      changed = true;
    }
  }

  if (nextConfig.background?.slides && Array.isArray(nextConfig.background.slides)) {
    let slideChanged = false;
    const nextSlides = nextConfig.background.slides.map((slide: Record<string, any>) => {
      if (!matches(slide?.fontFamily)) {
        return slide;
      }
      slideChanged = true;
      return {
        ...slide,
        fontFamily: fallbacks?.slideFontFamily || 'system-ui',
      };
    });

    if (slideChanged) {
      nextConfig.background = {
        ...nextConfig.background,
        slides: nextSlides,
      };
      changed = true;
    }
  }

  return (changed ? nextConfig : config) as T;
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
