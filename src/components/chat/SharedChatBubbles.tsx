/* eslint-disable react-refresh/only-export-components */
import React from 'react';

export interface SharedChatItem {
  key: string;
  start: number;
  end: number;
  text: string;
  speakerId: string;
}

export interface SharedChatSpeakerStyle {
  bgColor?: string;
  textColor?: string;
  nameColor?: string;
  nameStrokeWidth?: number;
  nameStrokeColor?: string;
  borderRadius?: number;
  opacity?: number;
  borderWidth?: number;
  avatarBorderColor?: string;
  borderColor?: string;
  borderOpacity?: number;
  margin?: number;
  paddingX?: number;
  paddingY?: number;
  annotationBorderRadius?: number;
  shadowSize?: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  nameFontFamily?: string;
  nameFontWeight?: string;
  maxWidth?: number;
  trackIndex?: number;
  trackPaddingLeft?: number;
  trackPaddingRight?: number;
  annotationPosition?: 'top' | 'bottom';
  annotationAlign?: 'left' | 'center' | 'right';
  annotationMarginX?: number;
  animationStyle?: 'none' | 'fade' | 'rise' | 'pop' | 'slide' | 'blur';
}

export interface SharedChatSpeaker {
  name?: string;
  avatar?: string;
  side?: 'left' | 'right' | 'center';
  type?: 'speaker' | 'annotation';
  theme?: 'dark' | 'light';
  style?: SharedChatSpeakerStyle;
}

export interface SharedChatLayout {
  bubbleScale?: number;
  bubbleMaxWidthPercent?: number;
  bubbleLineHeight?: number;
  avatarSize?: number;
  speakerNameSize?: number;
  timestampFontFamily?: string;
  timestampSize?: number;
  timestampColor?: string;
  animationStyle?: 'none' | 'fade' | 'rise' | 'pop' | 'slide' | 'blur';
  animationDuration?: number;
  showAvatar?: boolean;
  showSpeakerName?: boolean;
  showTimestamp?: boolean;
  interruptionEnabled?: boolean;
  showMeta?: boolean;
  compactMode?: boolean;
  compactSpacing?: number;
  independentTracksEnabled?: boolean;
  trackCount?: number;
}

export interface InterruptedMessageRow<T> {
  left?: T;
  right?: T;
}

const getSpeakerSide = (
  speaker?: { side?: 'left' | 'right' | 'center'; type?: 'speaker' | 'annotation' },
) => (speaker?.side === 'right' ? 'right' : 'left');

export const computeInterruptedMessageRows = <T extends { start: number; end: number; speakerId: string }>(
  appearedMessages: T[],
  speakers: Record<string, { side?: 'left' | 'right' | 'center'; type?: 'speaker' | 'annotation' }>,
  maxVisible: number,
): InterruptedMessageRow<T>[] => {
  const base = appearedMessages.slice(-Math.max(1, maxVisible * 3));
  const hostIndexes = new Map<number, number>();

  for (let i = 0; i < base.length; i += 1) {
    const candidate = base[i];
    const candidateSpeaker = speakers[candidate.speakerId];
    if (!candidateSpeaker || candidateSpeaker.type === 'annotation') continue;

    let hostIndex = -1;
    for (let j = i - 1; j >= 0; j -= 1) {
      const host = base[j];
      const hostSpeaker = speakers[host.speakerId];
      if (!hostSpeaker || hostSpeaker.type === 'annotation') continue;
      if (candidate.start >= host.start && candidate.end <= host.end) {
        hostIndex = j;
        break;
      }
    }

    if (hostIndex >= 0) {
      hostIndexes.set(i, hostIndex);
    }
  }

  const rows: InterruptedMessageRow<T>[] = [];
  const rowIndexByMessage = new Map<number, number>();

  for (let i = 0; i < base.length; i += 1) {
    const item = base[i];
    const speaker = speakers[item.speakerId];
    if (!speaker || speaker.type === 'annotation') continue;
    const side = getSpeakerSide(speaker);
    const hostIndex = hostIndexes.get(i);

    if (hostIndex == null) {
      rows.push(side === 'left' ? { left: item } : { right: item });
      rowIndexByMessage.set(i, rows.length - 1);
      continue;
    }

    const hostRowIndex = rowIndexByMessage.get(hostIndex);

    if (hostRowIndex == null) {
      rows.push(side === 'left' ? { left: item } : { right: item });
      rowIndexByMessage.set(i, rows.length - 1);
      continue;
    }

    rows.splice(hostRowIndex, 0, side === 'left' ? { left: item } : { right: item });
    for (const [messageIndex, rowIndex] of rowIndexByMessage.entries()) {
      if (rowIndex >= hostRowIndex) {
        rowIndexByMessage.set(messageIndex, rowIndex + 1);
      }
    }
    rowIndexByMessage.set(i, hostRowIndex);
  }

  let visibleCount = rows.reduce((count, row) => count + (row.left ? 1 : 0) + (row.right ? 1 : 0), 0);
  while (visibleCount > maxVisible && rows.length > 0) {
    const firstRow = rows[0];
    if (firstRow.left) {
      firstRow.left = undefined;
      visibleCount -= 1;
    } else if (firstRow.right) {
      firstRow.right = undefined;
      visibleCount -= 1;
    }
    if (!firstRow.left && !firstRow.right) {
      rows.shift();
    }
  }

  return rows.filter((row) => row.left || row.right);
};


export const computeInterruptedVisibleMessages = <T extends { start: number; end: number; speakerId: string }>(
  appearedMessages: T[],
  speakers: Record<string, { side?: 'left' | 'right' | 'center'; type?: 'speaker' | 'annotation' }>,
  maxVisible: number,
) => {
  return computeInterruptedMessageRows(appearedMessages, speakers, maxVisible)
    .flatMap((row) => [row.left, row.right].filter(Boolean) as T[])
    .slice(-maxVisible);
};

export const computeSimpleMessageRows = <T extends { start: number; end: number; speakerId: string }>(
  appearedMessages: T[],
  speakers: Record<string, { side?: 'left' | 'right' | 'center'; type?: 'speaker' | 'annotation' }>,
  maxVisible: number,
): InterruptedMessageRow<T>[] => {
  return appearedMessages
    .filter((item) => {
      const speaker = speakers[item.speakerId];
      return Boolean(speaker && speaker.type !== 'annotation');
    })
    .slice(-Math.max(1, maxVisible))
    .map((item) => {
      const side = getSpeakerSide(speakers[item.speakerId]);
      return side === 'right' ? { left: undefined, right: item } : { left: item, right: undefined };
    });
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const MIN_LAYOUT_SCALE = 0.15;

const rgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  const parsed = Number.parseInt(value, 16);
  const r = (parsed >> 16) & 255;
  const g = (parsed >> 8) & 255;
  const b = parsed & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const formatTimestamp = (seconds: number) => {
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return t === 0 ? 0 : t === 1 ? 1 : c3 * t * t * t - c1 * t * t;
};

export const getBubbleMotionState = (progress: number, style: SharedChatLayout['animationStyle'], side: SharedChatSpeaker['side']) => {
  const clamped = clamp(progress, 0, 1);
  const base = easeOutCubic(clamped);
  const quantize = (value: number) => Math.round(value);

  // Snap to a fully stable frame near animation end to avoid 1px jitter
  // from timeline quantization and floating point drift.
  if (clamped >= 0.98) {
    return { opacity: 1, transform: undefined, filter: undefined };
  }

  switch (style) {
    case 'fade':
      return { opacity: clamped, transform: undefined, filter: undefined };
    case 'rise':
      return {
        opacity: clamped,
        transform: `translate3d(0, ${quantize(30 * (1 - base))}px, 0)`,
        filter: undefined
      };
    case 'pop': {
      const eased = easeOutBack(clamped);
      const scale = Math.round((0.72 + 0.28 * eased) * 1000) / 1000;
      return { opacity: clamped, transform: `scale(${scale})`, filter: undefined };
    }
    case 'slide': {
      const direction = side === 'left' ? -1 : side === 'right' ? 1 : 0;
      return {
        opacity: clamped,
        transform: `translate3d(${quantize(direction * 42 * (1 - base))}px, 0, 0)`,
        filter: undefined
      };
    }
    case 'blur':
      return {
        opacity: clamped,
        transform: `translate3d(0, ${quantize(16 * (1 - base))}px, 0) scale(${Math.round((0.96 + 0.04 * base) * 1000) / 1000})`,
        filter: `blur(${14 * (1 - base)}px)`
      };
    default:
      return { opacity: 1, transform: undefined, filter: undefined };
  }
};

function SvgStrokeText({
  text,
  fontSize,
  fontFamily,
  fontWeight,
  color,
  strokeWidth,
  strokeColor,
  align = 'left',
  style,
}: {
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: string | number;
  color: string;
  strokeWidth: number;
  strokeColor: string;
  align?: 'left' | 'right' | 'center';
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={{
        display: 'inline-block',
        lineHeight: 1,
        textAlign: align,
        whiteSpace: 'nowrap',
        fontFamily,
        fontSize: `${fontSize}px`,
        fontWeight,
        color,
        WebkitTextStrokeWidth: strokeWidth > 0 ? `${strokeWidth}px` : undefined,
        WebkitTextStrokeColor: strokeWidth > 0 ? strokeColor : undefined,
        paintOrder: 'stroke fill',
        ...style,
      }}
    >
      {text}
    </span>
  );
}

const formatBubbleShadow = (shadowSize: number) => {
  if (shadowSize <= 0) {
    return 'none';
  }

  return `0 ${Math.round(shadowSize * 0.35)}px ${shadowSize}px rgba(15, 23, 42, 0.24)`;
};

const BUBBLE_TEXT_LINE_HEIGHT = 1.35;

type MarkdownToken =
  | { type: 'text'; value: string }
  | { type: 'bold' | 'italic' | 'strike'; children: MarkdownToken[] }
  | { type: 'color'; color: string; children: MarkdownToken[] }
  | { type: 'size'; size: string; children: MarkdownToken[] }
  | { type: 'font'; font: string; children: MarkdownToken[] }
  | { type: 'image'; src: string; alt: string }
  | { type: 'linebreak' };

type AssInlineStyleState = {
  bold?: string | number;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  alpha?: number | null;
};

type AssStyledSegment =
  | { type: 'text'; value: string; style: AssInlineStyleState }
  | { type: 'linebreak'; style: AssInlineStyleState };

const MARKDOWN_PATTERNS = {
  image: /!\[([^\]]*)\]\(([^)]+)\)/,
  color: /<color=([^>]+)>([\s\S]*?)<\/color>/,
  size: /<size=([^>]+)>([\s\S]*?)<\/size>/,
  font: /<font=([^>]+)>([\s\S]*?)<\/font>/,
  bold: /\*\*([^*][\s\S]*?)\*\*/,
  strike: /~~([^~][\s\S]*?)~~/,
  italic: /(^|[^*])\*([^*][\s\S]*?)\*/,
};

const tokenizeMarkdownInline = (input: string): MarkdownToken[] => {
  const tokens: MarkdownToken[] = [];
  let rest = input;

  while (rest.length > 0) {
    const candidates = [
      { type: 'image' as const, match: rest.match(MARKDOWN_PATTERNS.image) },
      { type: 'color' as const, match: rest.match(MARKDOWN_PATTERNS.color) },
      { type: 'size' as const, match: rest.match(MARKDOWN_PATTERNS.size) },
      { type: 'font' as const, match: rest.match(MARKDOWN_PATTERNS.font) },
      { type: 'bold' as const, match: rest.match(MARKDOWN_PATTERNS.bold) },
      { type: 'strike' as const, match: rest.match(MARKDOWN_PATTERNS.strike) },
      { type: 'italic' as const, match: rest.match(MARKDOWN_PATTERNS.italic) },
    ]
      .filter((candidate) => candidate.match && typeof candidate.match.index === 'number')
      .sort((a, b) => (a.match!.index ?? 0) - (b.match!.index ?? 0));

    const next = candidates[0];
    if (!next?.match) {
      tokens.push({ type: 'text', value: rest });
      break;
    }

    const matchIndex = next.match.index ?? 0;
    if (matchIndex > 0) {
      tokens.push({ type: 'text', value: rest.slice(0, matchIndex) });
    }

    if (next.type === 'image') {
      tokens.push({ type: 'image', alt: next.match[1] || '', src: (next.match[2] || '').trim() });
      rest = rest.slice(matchIndex + next.match[0].length);
      continue;
    }

    if (next.type === 'color') {
      tokens.push({ type: 'color', color: next.match[1].trim(), children: tokenizeMarkdownInline(next.match[2] || '') });
      rest = rest.slice(matchIndex + next.match[0].length);
      continue;
    }

    if (next.type === 'size') {
      tokens.push({ type: 'size', size: next.match[1].trim(), children: tokenizeMarkdownInline(next.match[2] || '') });
      rest = rest.slice(matchIndex + next.match[0].length);
      continue;
    }

    if (next.type === 'font') {
      tokens.push({ type: 'font', font: next.match[1].trim(), children: tokenizeMarkdownInline(next.match[2] || '') });
      rest = rest.slice(matchIndex + next.match[0].length);
      continue;
    }

    if (next.type === 'italic') {
      const prefix = next.match[1] || '';
      if (prefix) {
        tokens.push({ type: 'text', value: prefix });
      }
      tokens.push({ type: 'italic', children: tokenizeMarkdownInline(next.match[2] || '') });
      rest = rest.slice(matchIndex + next.match[0].length);
      continue;
    }

    tokens.push({ type: next.type, children: tokenizeMarkdownInline(next.match[1] || '') });
    rest = rest.slice(matchIndex + next.match[0].length);
  }

  return tokens;
};

const parseAssHexColor = (value: string) => {
  const normalized = value.trim();
  const match = normalized.match(/&H([0-9A-F]{6,8})&?/i);
  if (!match) {
    return null;
  }

  const hex = match[1].toUpperCase();
  const colorHex = hex.length >= 8 ? hex.slice(hex.length - 6) : hex.padStart(6, '0');
  const bb = colorHex.slice(0, 2);
  const gg = colorHex.slice(2, 4);
  const rr = colorHex.slice(4, 6);
  const alphaHex = hex.length >= 8 ? hex.slice(0, hex.length - 6).slice(-2) : null;

  return {
    color: `#${rr}${gg}${bb}`,
    alpha: alphaHex ? 1 - Number.parseInt(alphaHex, 16) / 255 : null,
  };
};

const parseAssAlpha = (value: string) => {
  const normalized = value.trim();
  const match = normalized.match(/&H([0-9A-F]{2})&?/i);
  if (!match) {
    return null;
  }
  return 1 - Number.parseInt(match[1], 16) / 255;
};

const applyAlphaToColor = (color: string, alpha: number | null | undefined) => {
  if (alpha == null || alpha >= 0.999) {
    return color;
  }

  const hexMatch = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const expanded = hexMatch[1].length === 3
      ? hexMatch[1].split('').map((char) => char + char).join('')
      : hexMatch[1];
    const parsed = Number.parseInt(expanded, 16);
    const r = (parsed >> 16) & 255;
    const g = (parsed >> 8) & 255;
    const b = parsed & 255;
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
  }

  const rgbaMatch = color.match(/^rgba?\((.+)\)$/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map((part) => part.trim());
    if (parts.length >= 3) {
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${Math.max(0, Math.min(1, alpha))})`;
    }
  }

  return color;
};

const normalizeCssColor = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const assColor = parseAssHexColor(trimmed);
  if (assColor) {
    return assColor;
  }

  return { color: trimmed, alpha: null as number | null };
};

const parseAssOverrideBlock = (block: string, currentStyle: AssInlineStyleState) => {
  let nextStyle: AssInlineStyleState = { ...currentStyle };
  const tagPattern = /\\([1-4]?c|[1-4]?a|alpha|fs|fn|b|i|u|s|r)([^\\}]*)/gi;
  let matched = false;

  block.replace(tagPattern, (_full, rawTag: string, rawValue: string) => {
    matched = true;
    const tag = rawTag.toLowerCase();
    const value = (rawValue || '').trim();

    if (tag === 'r') {
      nextStyle = {};
      return '';
    }

    if (tag === 'b') {
      if (!value) {
        nextStyle.bold = 'bold';
      } else {
        const numeric = Number.parseInt(value, 10);
        if (Number.isFinite(numeric)) {
          nextStyle.bold = numeric <= 0 ? 'normal' : numeric === 1 ? 'bold' : numeric;
        }
      }
      return '';
    }

    if (tag === 'i') {
      nextStyle.italic = value === '' ? true : value !== '0';
      return '';
    }

    if (tag === 'u') {
      nextStyle.underline = value === '' ? true : value !== '0';
      return '';
    }

    if (tag === 's') {
      nextStyle.strike = value === '' ? true : value !== '0';
      return '';
    }

    if (tag === 'fn') {
      if (value) {
        nextStyle.fontFamily = value;
      }
      return '';
    }

    if (tag === 'fs') {
      const numeric = Number.parseFloat(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        nextStyle.fontSize = numeric;
      }
      return '';
    }

    if (tag === 'alpha' || tag === '1a') {
      const alpha = parseAssAlpha(value);
      if (alpha !== null) {
        nextStyle.alpha = alpha;
      }
      return '';
    }

    if (tag === 'c' || tag === '1c') {
      const normalized = normalizeCssColor(value);
      if (normalized?.color) {
        nextStyle.color = normalized.color;
        if (normalized.alpha !== null) {
          nextStyle.alpha = normalized.alpha;
        }
      }
    }

    return '';
  });

  return matched ? nextStyle : currentStyle;
};

const buildAssStyledSegments = (input: string): AssStyledSegment[] => {
  const segments: AssStyledSegment[] = [];
  let styleState: AssInlineStyleState = {};
  let cursor = 0;

  while (cursor < input.length) {
    const blockStart = input.indexOf('{', cursor);
    if (blockStart < 0) {
      const trailingText = input.slice(cursor);
      if (trailingText) {
        segments.push({ type: 'text', value: trailingText, style: { ...styleState } });
      }
      break;
    }

    if (blockStart > cursor) {
      segments.push({ type: 'text', value: input.slice(cursor, blockStart), style: { ...styleState } });
    }

    const blockEnd = input.indexOf('}', blockStart + 1);
    if (blockEnd < 0) {
      segments.push({ type: 'text', value: input.slice(blockStart), style: { ...styleState } });
      break;
    }

    const blockContent = input.slice(blockStart + 1, blockEnd);
    if (blockContent.includes('\\')) {
      styleState = parseAssOverrideBlock(blockContent, styleState);
    } else {
      segments.push({ type: 'text', value: input.slice(blockStart, blockEnd + 1), style: { ...styleState } });
    }
    cursor = blockEnd + 1;
  }

  return segments.flatMap((segment) => {
    if (segment.type !== 'text') {
      return [segment];
    }

    const parts = segment.value.split('\n');
    return parts.flatMap((part, index) => {
      const nextSegments: AssStyledSegment[] = [];
      if (part) {
        nextSegments.push({ type: 'text', value: part, style: segment.style });
      }
      if (index < parts.length - 1) {
        nextSegments.push({ type: 'linebreak', style: segment.style });
      }
      return nextSegments;
    });
  });
};

const buildInlineTextStyle = (style: AssInlineStyleState, fontScale: number): React.CSSProperties => {
  const textDecorationLine = [style.underline ? 'underline' : '', style.strike ? 'line-through' : '']
    .filter(Boolean)
    .join(' ');

  return {
    color: style.color ? applyAlphaToColor(style.color, style.alpha) : undefined,
    fontFamily: style.fontFamily,
    fontSize: typeof style.fontSize === 'number' && Number.isFinite(style.fontSize) ? `${style.fontSize * fontScale}px` : undefined,
    fontWeight: style.bold,
    fontStyle: style.italic ? 'italic' : undefined,
    textDecorationLine: textDecorationLine || undefined,
  };
};

const renderMarkdownTokens = ({
  tokens,
  textColor,
  baseFontSize,
  renderInlineImage,
  keyPrefix,
  inheritedTextStyle,
}: {
  tokens: MarkdownToken[];
  textColor: string;
  baseFontSize: number;
  renderInlineImage: (args: { src: string; alt: string; key: string }) => React.ReactNode;
  keyPrefix: string;
  inheritedTextStyle?: React.CSSProperties;
}): React.ReactNode[] => tokens.map((token, index) => {
  const key = `${keyPrefix}-${index}`;
  switch (token.type) {
    case 'text':
      return <span key={key} style={inheritedTextStyle}>{token.value}</span>;
    case 'linebreak':
      return <React.Fragment key={key}><br /><span style={inheritedTextStyle}>{'\u200B'}</span></React.Fragment>;
    case 'bold':
      return <strong key={key} style={inheritedTextStyle}>{renderMarkdownTokens({ tokens: token.children, textColor, baseFontSize, renderInlineImage, keyPrefix: key, inheritedTextStyle })}</strong>;
    case 'italic':
      return <em key={key} style={inheritedTextStyle}>{renderMarkdownTokens({ tokens: token.children, textColor, baseFontSize, renderInlineImage, keyPrefix: key, inheritedTextStyle })}</em>;
    case 'strike':
      return <del key={key} style={inheritedTextStyle}>{renderMarkdownTokens({ tokens: token.children, textColor, baseFontSize, renderInlineImage, keyPrefix: key, inheritedTextStyle })}</del>;
    case 'color':
      return <span key={key} style={{ ...inheritedTextStyle, color: token.color || textColor }}>{renderMarkdownTokens({ tokens: token.children, textColor: token.color || textColor, baseFontSize, renderInlineImage, keyPrefix: key, inheritedTextStyle: { ...inheritedTextStyle, color: token.color || textColor } })}</span>;
    case 'size': {
      const normalized = token.size.trim();
      const numericMatch = normalized.match(/^(\d+(\.\d+)?)(px)?$/);
      const cssSize = numericMatch
        ? `${(Number.parseFloat(numericMatch[1]) / 30) * baseFontSize}px`
        : /^(\d+(\.\d+)?)(em|rem|%)$/.test(normalized)
          ? normalized
          : `${baseFontSize}px`;
      return <span key={key} style={{ ...inheritedTextStyle, fontSize: cssSize }}>{renderMarkdownTokens({ tokens: token.children, textColor, baseFontSize, renderInlineImage, keyPrefix: key, inheritedTextStyle: { ...inheritedTextStyle, fontSize: cssSize } })}</span>;
    }
    case 'font':
      return <span key={key} style={{ ...inheritedTextStyle, fontFamily: token.font || undefined }}>{renderMarkdownTokens({ tokens: token.children, textColor, baseFontSize, renderInlineImage, keyPrefix: key, inheritedTextStyle: { ...inheritedTextStyle, fontFamily: token.font || undefined } })}</span>;
    case 'image':
      return renderInlineImage({ src: token.src, alt: token.alt, key });
    default:
      return null;
  }
});

const renderMarkdownContent = ({
  text,
  textColor,
  baseFontSize,
  lineHeight,
  fontScale,
  renderInlineImage,
}: {
  text: string;
  textColor: string;
  baseFontSize: number;
  lineHeight: number;
  fontScale: number;
  renderInlineImage: (args: { src: string; alt: string; key: string }) => React.ReactNode;
}) => {
  const segments = buildAssStyledSegments(text);
  const baseTextStyle: React.CSSProperties = {
    display: 'inline',
    fontSize: `${baseFontSize}px`,
    lineHeight,
  };
  return segments.map((segment, index) => {
    const key = `md-ass-${index}`;
    if (segment.type === 'linebreak') {
      const lineBreakStyle = {
        ...baseTextStyle,
        ...buildInlineTextStyle(segment.style, fontScale),
        lineHeight,
      };
      return <React.Fragment key={key}><br /><span style={lineBreakStyle}>{'\u200B'}</span></React.Fragment>;
    }

    const inlineStyle = {
      ...baseTextStyle,
      ...buildInlineTextStyle(segment.style, fontScale),
      lineHeight,
    };
    return (
      <React.Fragment key={key}>
        {renderMarkdownTokens({
          tokens: tokenizeMarkdownInline(segment.value),
          textColor,
          baseFontSize,
          renderInlineImage,
          keyPrefix: key,
          inheritedTextStyle: inlineStyle,
        })}
      </React.Fragment>
    );
  });
};

interface BubbleRenderArgs {
  outerStyle: React.CSSProperties;
  contentStyle: React.CSSProperties;
  children: React.ReactNode;
}

interface ChatMessageBubbleProps {
  item: SharedChatItem;
  speaker: SharedChatSpeaker;
  currentTime: number;
  canvasWidth: number;
  layoutScale: number;
  chatLayout?: SharedChatLayout;
  fallbackAvatarBorderColor?: string;
  prevSpeakerId?: string;
  nextSpeakerId?: string;
  isLatestVisible?: boolean;
  bubbleMaxWidthOverridePx?: number | string;
  renderInlineImage?: (args: { src: string; alt: string; style: React.CSSProperties }) => React.ReactNode;
  renderAvatar?: (args: { src: string; alt: string; style: React.CSSProperties }) => React.ReactNode;
  renderBubble: (args: BubbleRenderArgs) => React.ReactNode;
}

export function ChatMessageBubble({
  item,
  speaker,
  currentTime,
  canvasWidth,
  layoutScale,
  chatLayout,
  prevSpeakerId,
  nextSpeakerId,
  isLatestVisible = false,
  bubbleMaxWidthOverridePx,
  renderInlineImage,
  renderAvatar,
  renderBubble
}: ChatMessageBubbleProps) {
  const snapPx = (value: number) => Math.round(value);
  const isLeft = (speaker.side ?? 'left') === 'left';
  const bubbleScale = chatLayout?.bubbleScale ?? 1.5;
  const layoutScaleSafe = Math.max(MIN_LAYOUT_SCALE, layoutScale);
  const combinedScale = layoutScaleSafe * bubbleScale;
  const animationStyle = chatLayout?.animationStyle || 'rise';
  const animationDuration = chatLayout?.animationDuration ?? 0.2;
  const currentProgress = animationStyle === 'none' || animationDuration <= 0
    ? 1
    : clamp((currentTime - item.start + animationDuration) / animationDuration, 0, 1);
  const motionState = animationStyle === 'none'
    ? { opacity: 1, transform: undefined, filter: undefined }
    : getBubbleMotionState(currentProgress, animationStyle, speaker.side);

  // Compact mode context
  const compactMode = chatLayout?.compactMode ?? false;
  const speakerId = item.speakerId;
  const isSameAsPrev = compactMode && prevSpeakerId === speakerId;
  const isSameAsNext = compactMode && nextSpeakerId === speakerId;

  const fallbackBg = speaker.theme === 'dark' ? '#2563eb' : '#ffffff';
  const fallbackText = speaker.theme === 'dark' ? '#ffffff' : '#111827';
  const bgColor = speaker.style?.bgColor || fallbackBg;
  const textColor = speaker.style?.textColor || fallbackText;
  const borderColor = speaker.style?.borderColor || '#ffffff';
  const borderOpacity = speaker.style?.borderOpacity ?? 1;

  // Compact mode corner logic (Telegram-style):
  // - The corner closest to the avatar (top-left for isLeft, top-right for !isLeft) is sharp when
  //   this message follows a same-speaker message (isSameAsPrev).
  // - The corner closest to the avatar at the bottom (bottom-left for isLeft, bottom-right for !isLeft)
  //   is sharp when the next message is also from the same speaker (isSameAsNext).
  const radius = snapPx((speaker.style?.borderRadius ?? 28) * combinedScale);
  const sharpCornerRadius = compactMode ? Math.max(3, snapPx(4 * combinedScale)) : Math.max(3, snapPx(4 * combinedScale));

  let topLeftRadius: number;
  let topRightRadius: number;
  let bottomLeftRadius: number;
  let bottomRightRadius: number;

  if (compactMode) {
    if (isLeft) {
      // Avatar side = left; avatar-adjacent corners are top-left and bottom-left
      topLeftRadius = isSameAsPrev ? sharpCornerRadius : radius;
      topRightRadius = radius;
      bottomLeftRadius = isSameAsNext ? sharpCornerRadius : radius;
      bottomRightRadius = radius;
    } else {
      // Avatar side = right; avatar-adjacent corners are top-right and bottom-right
      topLeftRadius = radius;
      topRightRadius = isSameAsPrev ? sharpCornerRadius : radius;
      bottomLeftRadius = radius;
      bottomRightRadius = isSameAsNext ? sharpCornerRadius : radius;
    }
  } else {
    topLeftRadius = isLeft ? sharpCornerRadius : radius;
    topRightRadius = isLeft ? radius : sharpCornerRadius;
    bottomLeftRadius = radius;
    bottomRightRadius = radius;
  }

  const shadowSize = snapPx((speaker.style?.shadowSize ?? 1) * combinedScale);
  // compactSpacing controls inter-bubble gap globally in both modes.
  const compactSpacing = chatLayout?.compactSpacing ?? 14;
  const bubbleLineHeight = chatLayout?.bubbleLineHeight ?? BUBBLE_TEXT_LINE_HEIGHT;
  const margin = snapPx(compactSpacing * combinedScale);
  const paddingX = snapPx((speaker.style?.paddingX ?? 20) * combinedScale);
  const paddingY = snapPx((speaker.style?.paddingY ?? 12) * combinedScale);
  const bubbleGap = snapPx(16 * combinedScale);
  const metaGap = snapPx(8 * combinedScale);
  const avatarPx = snapPx((chatLayout?.avatarSize ?? 80) * combinedScale);
  const speakerNameSize = snapPx((chatLayout?.speakerNameSize ?? 22) * combinedScale);
  const timestampSize = snapPx((chatLayout?.timestampSize ?? 16) * combinedScale);
  const timestampFontFamily = chatLayout?.timestampFontFamily || 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  const timestampColor = chatLayout?.timestampColor || 'rgba(255,255,255,0.65)';
  const fontSize = snapPx((speaker.style?.fontSize ?? 30) * combinedScale);
  const bubbleMaxWidthPercent = Math.max(15, Math.min(95, chatLayout?.bubbleMaxWidthPercent ?? 70));
  const bubbleMaxWidthPx = typeof bubbleMaxWidthOverridePx === 'number'
    ? bubbleMaxWidthOverridePx
    : (canvasWidth * layoutScaleSafe * (bubbleMaxWidthPercent / 100));
  const inlineImageMaxWidthPx = Math.max(80, bubbleMaxWidthPx - paddingX * 2);
  const speakerNameStrokeWidth = Math.max(0, Math.round((speaker.style?.nameStrokeWidth ?? 0) * combinedScale * 100) / 100);
  const speakerNameStrokeColor = speaker.style?.nameStrokeColor || '#000000';
  const opacity = speaker.style?.opacity ?? 0.9;
  const hexBg = bgColor.startsWith('#') ? bgColor : '#ffffff';
  const finalBgColor = `${hexBg}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`;
  const bubbleShadow = formatBubbleShadow(shadowSize);
  const speakerBlockShadow = shadowSize > 0
    ? `drop-shadow(0 ${Math.round(shadowSize * 0.2)}px ${Math.max(6, shadowSize * 0.55)}px rgba(15, 23, 42, 0.22))`
    : 'none';
  const shouldEnableBlockShadow = currentProgress >= 0.98 || (chatLayout?.animationStyle || 'rise') === 'none';

  // Compact mode: show avatar only on the last message of a consecutive run (isSameAsNext = false)
  const showAvatarGlobal = chatLayout?.showAvatar ?? true;
  const showAvatarThisBubble = showAvatarGlobal && (!compactMode || !isSameAsNext);

  // Compact mode: show speaker name only below the last message of a run
  const showSpeakerNameGlobal = chatLayout?.showSpeakerName ?? chatLayout?.showMeta ?? true;
  const showTimestampGlobal = chatLayout?.showTimestamp ?? chatLayout?.showMeta ?? true;
  // In normal mode: name shown above bubble; in compact: name shown below the last bubble of the run
  const showNameAbove = showSpeakerNameGlobal && !compactMode;
  const showNameBelow = showSpeakerNameGlobal && compactMode && !isSameAsNext;

  // Compact timestamp: shown beside bubble (outside, on the far end)
  // Normal mode: shown inline with name row above bubble
  const showTimestampBeside = compactMode && showTimestampGlobal;
  const markdownContent = renderMarkdownContent({
    text: item.text,
    textColor,
    baseFontSize: fontSize,
    lineHeight: bubbleLineHeight,
    fontScale: combinedScale,
    renderInlineImage: ({ src, alt, key }) => (renderInlineImage
      ? renderInlineImage({
          src,
          alt,
          style: {
            display: 'block',
            maxWidth: `${inlineImageMaxWidthPx}px`,
            maxHeight: `${Math.max(120, fontSize * 6)}px`,
            objectFit: 'contain',
            borderRadius: `${snapPx(12 * combinedScale)}px`,
            marginTop: `${snapPx(6 * combinedScale)}px`,
            marginBottom: `${snapPx(6 * combinedScale)}px`,
          }
        })
      : <img key={key} src={src} alt={alt} style={{ display: 'block', maxWidth: `${inlineImageMaxWidthPx}px`, maxHeight: `${Math.max(120, fontSize * 6)}px`, objectFit: 'contain', borderRadius: `${snapPx(12 * combinedScale)}px`, marginTop: `${snapPx(6 * combinedScale)}px`, marginBottom: `${snapPx(6 * combinedScale)}px` }} />)
  });

  return (
    <div
      style={{
        display: 'flex',
        maxWidth: '100%',
        flexDirection: 'column',
        alignSelf: isLeft ? 'flex-start' : 'flex-end',
        alignItems: isLeft ? 'flex-start' : 'flex-end',
        marginBottom: isLatestVisible ? '0px' : `${margin}px`,
        transform: compactMode ? undefined : motionState.transform,
        transformOrigin: isLeft ? 'left center' : 'right center',
        opacity: compactMode ? 1 : motionState.opacity,
        filter: compactMode ? undefined : motionState.filter,
        pointerEvents: 'none'
      }}
    >
      {/* Main row: avatar + bubble (+ beside-timestamp in compact) */}
      <div
        style={{
          display: 'flex',
          flexDirection: isLeft ? 'row' : 'row-reverse',
          gap: `${bubbleGap}px`,
          maxWidth: '100%',
          // In compact mode align avatar bottom to bubble bottom (not pulled down by name row below)
          alignItems: compactMode ? 'flex-end' : 'flex-start'
        }}
      >
        {/* Avatar column */}
        {showAvatarGlobal && renderAvatar ? (
          compactMode ? (
            <div
              style={{
                width: `${avatarPx}px`,
                minWidth: `${avatarPx}px`,
                flexShrink: 0,
                position: 'relative',
                height: 0,
              }}
            >
              {showAvatarThisBubble && speaker.avatar ? (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                  }}
                >
                  {renderAvatar({
                    src: speaker.avatar,
                    alt: speaker.name || '',
                    style: {
                      width: `${avatarPx}px`,
                      height: `${avatarPx}px`,
                      minWidth: `${avatarPx}px`,
                      borderRadius: '999px',
                      objectFit: 'cover',
                      boxShadow: bubbleShadow,
                      overflow: 'hidden'
                    }
                  })}
                </div>
              ) : null}
            </div>
          ) : (
            showAvatarThisBubble && speaker.avatar ? renderAvatar({
              src: speaker.avatar,
              alt: speaker.name || '',
              style: {
                width: `${avatarPx}px`,
                height: `${avatarPx}px`,
                minWidth: `${avatarPx}px`,
                borderRadius: '999px',
                objectFit: 'cover',
                boxShadow: bubbleShadow,
                overflow: 'hidden'
              }
            }) : (
              <div style={{ width: `${avatarPx}px`, minWidth: `${avatarPx}px`, flexShrink: 0 }} />
            )
          )
        ) : null}

        {/* Bubble + meta column */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: isLeft ? 'flex-start' : 'flex-end',
            maxWidth: typeof bubbleMaxWidthPx === 'number' ? `${bubbleMaxWidthPx}px` : bubbleMaxWidthPx,
            filter: shouldEnableBlockShadow ? speakerBlockShadow : 'none',
            transform: compactMode ? motionState.transform : undefined,
            opacity: compactMode ? motionState.opacity : undefined
          }}
        >
          {/* Name row above bubble (normal mode only) */}
          {showNameAbove && speaker.name ? (
            <div
              style={{
                display: 'flex',
                flexDirection: isLeft ? 'row' : 'row-reverse',
                alignItems: 'baseline',
                gap: `${metaGap}px`,
                marginBottom: `${4 * combinedScale}px`
              }}
            >
              <SvgStrokeText
                text={speaker.name}
                fontSize={speakerNameSize}
                fontFamily={speaker.style?.nameFontFamily || speaker.style?.fontFamily || 'system-ui'}
                fontWeight={speaker.style?.nameFontWeight || 700}
                color={speaker.style?.nameColor || '#ffffff'}
                strokeWidth={speakerNameStrokeWidth}
                strokeColor={speakerNameStrokeColor}
              />
              {showTimestampGlobal ? (
                <span style={{ fontSize: `${timestampSize}px`, fontFamily: timestampFontFamily, color: timestampColor }}>
                  {formatTimestamp(item.start)}
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Bubble row (bubble + beside timestamp in compact mode) */}
          <div
            style={{
              display: 'flex',
              flexDirection: isLeft ? 'row' : 'row-reverse',
              alignItems: 'flex-end',
              gap: showTimestampBeside ? `${metaGap}px` : undefined,
              width: '100%'
            }}
          >
            {renderBubble({
              outerStyle: {
                position: 'relative',
                overflow: 'hidden',
                isolation: 'isolate',
                backgroundColor: finalBgColor,
                fontFamily: speaker.style?.fontFamily || 'system-ui',
                fontSize: `${fontSize}px`,
                fontWeight: speaker.style?.fontWeight || 'normal',
                backgroundClip: 'padding-box',
                borderTopLeftRadius: `${topLeftRadius}px`,
                borderTopRightRadius: `${topRightRadius}px`,
                borderBottomLeftRadius: `${bottomLeftRadius}px`,
                borderBottomRightRadius: `${bottomRightRadius}px`,
                border: (speaker.style?.borderWidth ?? 0) > 0 ? `${speaker.style?.borderWidth ?? 0}px solid ${rgba(borderColor, borderOpacity)}` : 'none',
                boxShadow: bubbleShadow,
                maxWidth: typeof bubbleMaxWidthPx === 'number' ? `${bubbleMaxWidthPx}px` : bubbleMaxWidthPx
              },
              contentStyle: {
                position: 'relative',
                zIndex: 1,
                padding: `${paddingY}px ${paddingX}px`,
                color: textColor,
                fontSize: `${fontSize}px`,
                whiteSpace: 'pre-wrap',
                lineHeight: 0,
                overflowWrap: 'break-word'
              },
              children: markdownContent
            })}

            {/* Timestamp beside bubble (compact mode) */}
            {showTimestampBeside ? (
              <span
                style={{
                  fontSize: `${timestampSize}px`,
                  fontFamily: timestampFontFamily,
                  color: timestampColor,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  paddingBottom: `${snapPx(4 * combinedScale)}px`
                }}
              >
                {formatTimestamp(item.start)}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Name below, aligned to the avatar column itself in compact mode. */}
      {showNameBelow && speaker.name ? (
        <div
          style={{
            maxWidth: '100%',
            alignSelf: isLeft ? 'flex-start' : 'flex-end',
            marginTop: `${snapPx(4 * combinedScale)}px`
          }}
        >
          <SvgStrokeText
            text={speaker.name}
            fontSize={speakerNameSize}
            fontFamily={speaker.style?.nameFontFamily || speaker.style?.fontFamily || 'system-ui'}
            fontWeight={speaker.style?.nameFontWeight || 700}
            color={speaker.style?.nameColor || '#ffffff'}
            strokeWidth={speakerNameStrokeWidth}
            strokeColor={speakerNameStrokeColor}
            align={isLeft ? 'left' : 'right'}
            style={{
              whiteSpace: 'nowrap',
              paddingLeft: isLeft ? `${snapPx(6 * combinedScale)}px` : undefined,
              paddingRight: !isLeft ? `${snapPx(6 * combinedScale)}px` : undefined,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

interface ChatAnnotationBubbleProps {
  item: SharedChatItem;
  speaker: SharedChatSpeaker;
  currentTime: number;
  layoutScale: number;
  chatLayout?: SharedChatLayout;
  renderInlineImage?: (args: { src: string; alt: string; style: React.CSSProperties }) => React.ReactNode;
  renderBubble?: (args: BubbleRenderArgs) => React.ReactNode;
}

export function ChatAnnotationBubble({ item, speaker, currentTime, layoutScale, chatLayout, renderInlineImage, renderBubble }: ChatAnnotationBubbleProps) {
  const bubbleScale = chatLayout?.bubbleScale ?? 1.5;
  const bubbleLineHeight = chatLayout?.bubbleLineHeight ?? BUBBLE_TEXT_LINE_HEIGHT;
  const combinedScale = Math.max(MIN_LAYOUT_SCALE, layoutScale) * bubbleScale;
  const annotationAnimationStyle = speaker.style?.animationStyle || chatLayout?.animationStyle || 'rise';
  const annotationAnimationDuration = chatLayout?.animationDuration ?? 0.2;
  const annotationProgress = annotationAnimationStyle === 'none' || annotationAnimationDuration <= 0
    ? 1
    : clamp((currentTime - item.start + annotationAnimationDuration) / annotationAnimationDuration, 0, 1);
  const annotationMotion = annotationAnimationStyle === 'none'
    ? { opacity: 1, transform: undefined, filter: undefined }
    : getBubbleMotionState(annotationProgress, annotationAnimationStyle, speaker.side);
  const shadowSize = (speaker.style?.shadowSize ?? 1) * combinedScale;
  const maxWidth = (speaker.style?.maxWidth ?? 720) * combinedScale;
  const inlineImageMaxWidthPx = Math.max(80, maxWidth - (speaker.style?.paddingX ?? 24) * combinedScale * 2);
  const annotationAlign = speaker.style?.annotationAlign ?? 'center';
  const annotationMarginX = (speaker.style?.annotationMarginX ?? 0) * combinedScale;
  const opacity = speaker.style?.opacity ?? 0.9;
  const bgColor = speaker.style?.bgColor || '#111827';
  const textColor = speaker.style?.textColor || '#ffffff';
  const hexBg = bgColor.startsWith('#') ? bgColor : '#111827';
  const finalBgColor = `${hexBg}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`;
  const bubbleArgs = {
    outerStyle: {
      alignSelf: annotationAlign === 'left' ? 'flex-start' : annotationAlign === 'right' ? 'flex-end' : 'center',
      marginLeft: annotationAlign === 'left' ? `${annotationMarginX}px` : 'auto',
      marginRight: annotationAlign === 'right' ? `${annotationMarginX}px` : 'auto',
      maxWidth: `${maxWidth}px`,
      borderRadius: `${(speaker.style?.annotationBorderRadius ?? speaker.style?.borderRadius ?? 28) * combinedScale}px`,
      backgroundColor: finalBgColor,
      color: textColor,
      boxShadow: formatBubbleShadow(shadowSize),
      opacity: annotationMotion.opacity,
      transform: annotationMotion.transform,
      filter: annotationMotion.filter,
      marginTop: speaker.style?.annotationPosition === 'top' ? `${(speaker.style?.margin ?? 12) * combinedScale}px` : undefined,
      marginBottom: (speaker.style?.annotationPosition ?? 'bottom') === 'bottom' ? `${(speaker.style?.margin ?? 12) * combinedScale}px` : undefined
    } as React.CSSProperties,
    contentStyle: {
      padding: `${(speaker.style?.paddingY ?? 12) * combinedScale}px ${(speaker.style?.paddingX ?? 24) * combinedScale}px`,
      fontFamily: speaker.style?.fontFamily || 'system-ui',
      fontSize: `${(speaker.style?.fontSize ?? 24) * combinedScale}px`,
      fontWeight: speaker.style?.fontWeight || 'normal',
      lineHeight: 0,
      textAlign: annotationAlign as 'left' | 'center' | 'right',
      whiteSpace: 'pre-wrap' as const,
      color: textColor
    },
    children: renderMarkdownContent({
      text: item.text,
      textColor,
      baseFontSize: (speaker.style?.fontSize ?? 24) * combinedScale,
      lineHeight: bubbleLineHeight,
      fontScale: combinedScale,
      renderInlineImage: ({ src, alt, key }) => (renderInlineImage
        ? renderInlineImage({
            src,
            alt,
            style: {
              display: 'block',
              maxWidth: `${inlineImageMaxWidthPx}px`,
              maxHeight: `${Math.max(120, (speaker.style?.fontSize ?? 24) * combinedScale * 6)}px`,
              objectFit: 'contain',
              borderRadius: `${Math.max(8, 12 * combinedScale)}px`,
              marginTop: `${Math.max(4, 6 * combinedScale)}px`,
              marginBottom: `${Math.max(4, 6 * combinedScale)}px`,
            }
          })
        : <img key={key} src={src} alt={alt} style={{ display: 'block', maxWidth: `${inlineImageMaxWidthPx}px`, maxHeight: `${Math.max(120, (speaker.style?.fontSize ?? 24) * combinedScale * 6)}px`, objectFit: 'contain', borderRadius: `${Math.max(8, 12 * combinedScale)}px`, marginTop: `${Math.max(4, 6 * combinedScale)}px`, marginBottom: `${Math.max(4, 6 * combinedScale)}px` }} />)
    })
  };

  if (renderBubble) {
    return <>{renderBubble(bubbleArgs)}</>;
  }

  return (
    <div style={bubbleArgs.outerStyle}>
      <div style={bubbleArgs.contentStyle}>{bubbleArgs.children}</div>
    </div>
  );
}
