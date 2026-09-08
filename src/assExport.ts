import type { SubtitleItem } from './hooks/useAssSubtitle';
import type { SpeakerConfig, SpeakerStyle } from './remotion/types';

export interface AssExportSpeaker extends SpeakerConfig {
  assActorName?: string;
  assStyleName?: string;
  assStyleNames?: string[];
}

interface AssColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

interface AssStyleValues {
  fontName: string;
  fontSize: number;
  primaryColour: string;
  secondaryColour: string;
  outlineColour: string;
  backColour: string;
  bold: number;
  italic: number;
  underline: number;
  strikeOut: number;
  scaleX: number;
  scaleY: number;
  spacing: number;
  angle: number;
  borderStyle: number;
  outline: number;
  shadow: number;
  alignment: number;
  marginLeft: number;
  marginRight: number;
  marginVertical: number;
  encoding: number;
}

const DEFAULT_DIMENSIONS = { width: 1920, height: 1080 };
const DEFAULT_SPEAKER_STYLE: SpeakerStyle = {
  bgColor: '#2563eb',
  textColor: '#ffffff',
  borderColor: '#ffffff',
  borderOpacity: 1,
  borderWidth: 0,
  opacity: 0.9,
  fontFamily: 'Arial',
  fontSize: 30,
  fontWeight: 'normal',
  margin: 14,
  paddingY: 12,
  shadowSize: 1,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toFiniteNumber = (value: unknown, fallback: number) => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const sanitizeAssField = (value: unknown, fallback = '') => {
  const normalized = String(value ?? '')
    .replace(/[\r\n,]/g, ' ')
    .trim();
  return normalized || fallback;
};

const normalizeHex = (value: string) => {
  if (value.length === 3) {
    return value.split('').map((part) => `${part}${part}`).join('');
  }
  return value;
};

const parseColor = (value: unknown, fallback: AssColor): AssColor => {
  const normalized = String(value ?? '').trim();
  const hexMatch = normalized.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const hex = normalizeHex(hexMatch[1]);
    if (hex.length === 6 || hex.length === 8) {
      return {
        red: Number.parseInt(hex.slice(0, 2), 16),
        green: Number.parseInt(hex.slice(2, 4), 16),
        blue: Number.parseInt(hex.slice(4, 6), 16),
        alpha: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
  }

  const assMatch = normalized.match(/^&H([0-9a-f]{6,8})$/i);
  if (assMatch) {
    const hex = assMatch[1].padStart(8, '0');
    return {
      red: Number.parseInt(hex.slice(6, 8), 16),
      green: Number.parseInt(hex.slice(4, 6), 16),
      blue: Number.parseInt(hex.slice(2, 4), 16),
      alpha: 1 - Number.parseInt(hex.slice(0, 2), 16) / 255,
    };
  }

  const rgbMatch = normalized.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
  if (rgbMatch) {
    return {
      red: clamp(Number(rgbMatch[1]), 0, 255),
      green: clamp(Number(rgbMatch[2]), 0, 255),
      blue: clamp(Number(rgbMatch[3]), 0, 255),
      alpha: clamp(rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4]), 0, 1),
    };
  }

  return fallback;
};

const toAssColor = (value: unknown, opacity = 1, fallback: AssColor): string => {
  const color = parseColor(value, fallback);
  const alpha = Math.round((1 - clamp(color.alpha * clamp(opacity, 0, 1), 0, 1)) * 255);
  const toHex = (part: number) => Math.round(clamp(part, 0, 255)).toString(16).padStart(2, '0').toUpperCase();
  return `&H${toHex(alpha)}${toHex(color.blue)}${toHex(color.green)}${toHex(color.red)}`;
};

const getFontName = (style: SpeakerStyle) => {
  const firstFont = String(style.fontFamily || DEFAULT_SPEAKER_STYLE.fontFamily)
    .split(',')[0]
    .trim()
    .replace(/^['"]|['"]$/g, '');
  return sanitizeAssField(firstFont, 'Arial');
};

const isBold = (fontWeight: unknown) => {
  const normalized = String(fontWeight ?? '').toLowerCase();
  const numeric = Number(normalized);
  return normalized === 'bold' || normalized === 'semibold' || normalized === '600' || normalized === '700' || normalized === '800' || normalized === '900' || (Number.isFinite(numeric) && numeric >= 600) ? -1 : 0;
};

const getHorizontalAlignment = (value: unknown, fallback: 'left' | 'center' | 'right' = 'center') => {
  const normalized = String(value || fallback).toLowerCase();
  return normalized === 'left' ? 'left' : normalized === 'right' ? 'right' : 'center';
};

const getAssAlignment = (speaker: AssExportSpeaker) => {
  const style = speaker.style || {};
  const isAnnotation = speaker.type === 'annotation' || speakerIdLooksLikeAnnotation(speaker);
  const horizontal = isAnnotation
    ? getHorizontalAlignment(style.annotationAlign)
    : getHorizontalAlignment(speaker.side, 'left');
  const horizontalOffset = horizontal === 'left' ? 1 : horizontal === 'right' ? 3 : 2;

  if (isAnnotation && style.annotationPosition === 'top') {
    return horizontalOffset + 6;
  }
  return horizontalOffset;
};

const speakerIdLooksLikeAnnotation = (speaker: AssExportSpeaker) => Boolean(
  speaker.name === '注释'
  || speaker.name?.toLowerCase() === 'annotation'
  || speaker.assActorName === '注释'
  || speaker.assActorName?.toLowerCase() === 'annotation',
);

const buildStyleValues = (speaker: AssExportSpeaker): AssStyleValues => {
  const style = { ...DEFAULT_SPEAKER_STYLE, ...(speaker.style || {}) };
  const fontSize = Math.max(1, Math.round(toFiniteNumber(style.fontSize, 30)));
  const outline = Math.max(0, Math.round(toFiniteNumber(style.borderWidth, 0)));
  const shadow = Math.max(0, Math.round(toFiniteNumber(style.shadowSize, 0)));
  const margin = Math.max(0, Math.round(toFiniteNumber(style.margin, 14)));
  const marginVertical = Math.max(0, Math.round(toFiniteNumber(style.paddingY, 12)));
  const textColor = style.textColor || '#FFFFFF';
  const bubbleColor = style.bgColor || '#2563EB';
  const borderColor = style.borderColor || '#FFFFFF';

  return {
    fontName: getFontName(style),
    fontSize,
    primaryColour: toAssColor(textColor, 1, { red: 255, green: 255, blue: 255, alpha: 1 }),
    secondaryColour: toAssColor(textColor, 1, { red: 255, green: 255, blue: 255, alpha: 1 }),
    outlineColour: toAssColor(bubbleColor, toFiniteNumber(style.opacity, 0.9), { red: 37, green: 99, blue: 235, alpha: 1 }),
    backColour: toAssColor(borderColor, toFiniteNumber(style.borderOpacity, 1), { red: 255, green: 255, blue: 255, alpha: 1 }),
    bold: isBold(style.fontWeight),
    italic: 0,
    underline: 0,
    strikeOut: 0,
    scaleX: 100,
    scaleY: 100,
    spacing: 0,
    angle: 0,
    borderStyle: 1,
    outline,
    shadow,
    alignment: getAssAlignment(speaker),
    marginLeft: margin,
    marginRight: margin,
    marginVertical,
    encoding: 1,
  };
};

const serializeStyle = (name: string, values: AssStyleValues) => [
  name,
  values.fontName,
  values.fontSize,
  values.primaryColour,
  values.secondaryColour,
  values.outlineColour,
  values.backColour,
  values.bold,
  values.italic,
  values.underline,
  values.strikeOut,
  values.scaleX,
  values.scaleY,
  values.spacing,
  values.angle,
  values.borderStyle,
  values.outline,
  values.shadow,
  values.alignment,
  values.marginLeft,
  values.marginRight,
  values.marginVertical,
  values.encoding,
].join(',');

const formatAssTime = (value: unknown) => {
  const seconds = Math.max(0, toFiniteNumber(value, 0));
  const totalCentiseconds = Math.round(seconds * 100);
  const hours = Math.floor(totalCentiseconds / 360000);
  const minutes = Math.floor((totalCentiseconds % 360000) / 6000);
  const remainingSeconds = Math.floor((totalCentiseconds % 6000) / 100);
  const centiseconds = totalCentiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
};

const formatAssText = (value: unknown) => String(value ?? '').replace(/\r\n?/g, '\n').replace(/\n/g, '\\N');

const getBaseStyleName = (speakerId: string, speaker: AssExportSpeaker) => sanitizeAssField(
  speaker.assStyleName || speaker.assStyleNames?.[0] || speaker.name || speakerId,
  speakerId,
);

export function buildAssContent({
  subtitles,
  speakers,
  dimensions,
  title,
}: {
  subtitles: SubtitleItem[];
  speakers: Record<string, AssExportSpeaker>;
  dimensions?: { width?: number; height?: number };
  title?: string;
}) {
  const safeDimensions = {
    width: Math.max(1, Math.round(toFiniteNumber(dimensions?.width, DEFAULT_DIMENSIONS.width))),
    height: Math.max(1, Math.round(toFiniteNumber(dimensions?.height, DEFAULT_DIMENSIONS.height))),
  };
  const speakerEntries = Object.entries(speakers || {});
  const effectiveSpeakerEntries = speakerEntries.length > 0
    ? speakerEntries
    : [['A', { name: 'A', side: 'left', style: DEFAULT_SPEAKER_STYLE } as AssExportSpeaker] as const];
  const styleNames = new Map<string, string>();
  const styleSignatures = new Map<string, string>();
  const styleDefinitions: Array<{ name: string; values: AssStyleValues }> = [];

  effectiveSpeakerEntries.forEach(([speakerId, speaker]) => {
    const values = buildStyleValues(speaker);
    const signature = JSON.stringify(values);
    const baseName = getBaseStyleName(speakerId, speaker);
    let styleName = baseName;
    let suffix = 2;

    while (styleSignatures.has(styleName) && styleSignatures.get(styleName) !== signature) {
      styleName = `${baseName}_${suffix}`;
      suffix += 1;
    }

    if (!styleSignatures.has(styleName)) {
      styleSignatures.set(styleName, signature);
      styleDefinitions.push({ name: styleName, values });
    }
    styleNames.set(speakerId, styleName);
  });

  const fallbackSpeakerId = effectiveSpeakerEntries[0][0];
  const sortedSubtitles = [...(subtitles || [])]
    .filter((subtitle) => String(subtitle?.text ?? '').trim().length > 0)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const eventLines = sortedSubtitles.map((subtitle) => {
    const speakerId = speakers[subtitle.speakerId] ? subtitle.speakerId : fallbackSpeakerId;
    const speaker = speakers[speakerId] || effectiveSpeakerEntries[0][1];
    const styleName = styleNames.get(speakerId) || styleNames.get(fallbackSpeakerId) || 'Default';
    const actorName = sanitizeAssField(speaker.assActorName || speaker.name || speakerId, speakerId);
    const eventType = subtitle.visible === false ? 'Comment' : 'Dialogue';
    return `${eventType}: 0,${formatAssTime(subtitle.start)},${formatAssTime(subtitle.end)},${styleName},${actorName},0,0,0,,${formatAssText(subtitle.text)}`;
  });

  const scriptTitle = sanitizeAssField(title, 'PomChat Studio');
  const styleLines = styleDefinitions.map(({ name, values }) => `Style: ${serializeStyle(name, values)}`);
  return [
    '\uFEFF[Script Info]',
    `Title: ${scriptTitle}`,
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: None',
    `PlayResX: ${safeDimensions.width}`,
    `PlayResY: ${safeDimensions.height}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...styleLines,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...eventLines,
    '',
  ].join('\r\n');
}
