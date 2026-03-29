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
  borderRadius?: number;
  opacity?: number;
  borderWidth?: number;
  avatarBorderColor?: string;
  borderColor?: string;
  borderOpacity?: number;
  margin?: number;
  paddingX?: number;
  paddingY?: number;
  shadowSize?: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  maxWidth?: number;
  annotationPosition?: 'top' | 'bottom';
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
  avatarSize?: number;
  speakerNameSize?: number;
  timestampFontFamily?: string;
  timestampSize?: number;
  timestampColor?: string;
  animationStyle?: 'none' | 'fade' | 'rise' | 'pop' | 'slide' | 'blur';
  animationDuration?: number;
}

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

const getBubbleMotionState = (progress: number, style: SharedChatLayout['animationStyle'], side: SharedChatSpeaker['side']) => {
  const clamped = clamp(progress, 0, 1);
  const base = easeOutCubic(clamped);

  switch (style) {
    case 'fade':
      return { opacity: clamped, transform: undefined, filter: undefined };
    case 'rise':
      return {
        opacity: clamped,
        transform: `translate3d(0, ${30 * (1 - base)}px, 0)`,
        filter: undefined
      };
    case 'pop': {
      const eased = easeOutBack(clamped);
      const scale = 0.72 + 0.28 * eased;
      return { opacity: clamped, transform: `scale(${scale})`, filter: undefined };
    }
    case 'slide': {
      const direction = side === 'left' ? -1 : side === 'right' ? 1 : 0;
      return {
        opacity: clamped,
        transform: `translate3d(${direction * 42 * (1 - base)}px, 0, 0)`,
        filter: undefined
      };
    }
    case 'blur':
      return {
        opacity: clamped,
        transform: `translate3d(0, ${16 * (1 - base)}px, 0) scale(${0.96 + 0.04 * base})`,
        filter: `blur(${14 * (1 - base)}px)`
      };
    default:
      return { opacity: 1, transform: undefined, filter: undefined };
  }
};

const formatBubbleShadow = (shadowSize: number) => {
  if (shadowSize <= 0) {
    return 'none';
  }

  return `0 ${Math.round(shadowSize * 0.35)}px ${shadowSize}px rgba(15, 23, 42, 0.24)`;
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
  fallbackAvatarBorderColor = '#ffffff',
  renderAvatar,
  renderBubble
}: ChatMessageBubbleProps) {
  const isLeft = (speaker.side ?? 'left') === 'left';
  const bubbleScale = chatLayout?.bubbleScale ?? 1.5;
  const combinedScale = Math.max(MIN_LAYOUT_SCALE, layoutScale) * bubbleScale;
  const animationStyle = chatLayout?.animationStyle || 'rise';
  const animationDuration = chatLayout?.animationDuration ?? 0.2;
  const currentProgress = animationStyle === 'none' || animationDuration <= 0
    ? 1
    : clamp((currentTime - item.start + animationDuration) / animationDuration, 0, 1);
  const motionState = animationStyle === 'none'
    ? { opacity: 1, transform: undefined, filter: undefined }
    : getBubbleMotionState(currentProgress, animationStyle, speaker.side);

  const fallbackBg = speaker.theme === 'dark' ? '#2563eb' : '#ffffff';
  const fallbackText = speaker.theme === 'dark' ? '#ffffff' : '#111827';
  const bgColor = speaker.style?.bgColor || fallbackBg;
  const textColor = speaker.style?.textColor || fallbackText;
  const borderColor = speaker.style?.borderColor || '#ffffff';
  const borderOpacity = speaker.style?.borderOpacity ?? 1;
  const radius = (speaker.style?.borderRadius ?? 28) * combinedScale;
  const sharpCornerRadius = Math.max(3, 4 * combinedScale);
  const topLeftRadius = isLeft ? sharpCornerRadius : radius;
  const topRightRadius = isLeft ? radius : sharpCornerRadius;
  const shadowSize = (speaker.style?.shadowSize ?? 7) * combinedScale;
  const margin = (speaker.style?.margin ?? 14) * combinedScale;
  const paddingX = (speaker.style?.paddingX ?? 20) * combinedScale;
  const paddingY = (speaker.style?.paddingY ?? 12) * combinedScale;
  const bubbleGap = 16 * combinedScale;
  const metaGap = 8 * combinedScale;
  const avatarPx = (chatLayout?.avatarSize ?? 80) * combinedScale;
  const avatarBorderWidth = Math.max(2, 4 * combinedScale);
  const speakerNameSize = (chatLayout?.speakerNameSize ?? 22) * combinedScale;
  const timestampSize = (chatLayout?.timestampSize ?? 16) * combinedScale;
  const timestampFontFamily = chatLayout?.timestampFontFamily || 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  const timestampColor = chatLayout?.timestampColor || 'rgba(255,255,255,0.65)';
  const fontSize = (speaker.style?.fontSize ?? 30) * combinedScale;
  const bubbleMaxWidth = canvasWidth * 0.75;
  const opacity = speaker.style?.opacity ?? 0.9;
  const hexBg = bgColor.startsWith('#') ? bgColor : '#ffffff';
  const finalBgColor = `${hexBg}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`;
  const bubbleShadow = formatBubbleShadow(shadowSize);
  const speakerBlockShadow = shadowSize > 0
    ? `drop-shadow(0 ${Math.round(shadowSize * 0.2)}px ${Math.max(6, shadowSize * 0.55)}px rgba(15, 23, 42, 0.22))`
    : 'none';

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        justifyContent: isLeft ? 'flex-start' : 'flex-end',
        marginBottom: `${margin}px`,
        transform: motionState.transform,
        opacity: motionState.opacity,
        filter: motionState.filter
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: isLeft ? 'row' : 'row-reverse',
          gap: `${bubbleGap}px`,
          maxWidth: '75%',
          alignItems: 'flex-start'
        }}
      >
        {speaker.avatar && renderAvatar ? renderAvatar({
          src: speaker.avatar,
          alt: speaker.name || '',
          style: {
            width: `${avatarPx}px`,
            height: `${avatarPx}px`,
            minWidth: `${avatarPx}px`,
            borderRadius: '999px',
            objectFit: 'cover',
            backgroundColor: speaker.style?.avatarBorderColor || fallbackAvatarBorderColor,
            borderWidth: `${avatarBorderWidth}px`,
            borderColor: speaker.style?.avatarBorderColor || fallbackAvatarBorderColor,
            boxShadow: bubbleShadow,
            overflow: 'hidden'
          }
        }) : null}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: isLeft ? 'flex-start' : 'flex-end',
            maxWidth: `${bubbleMaxWidth}px`,
            filter: speakerBlockShadow
          }}
        >
          {speaker.name ? (
            <div
              style={{
                display: 'flex',
                flexDirection: isLeft ? 'row' : 'row-reverse',
                alignItems: 'baseline',
                gap: `${metaGap}px`,
                marginBottom: `${4 * combinedScale}px`
              }}
            >
              <span style={{ fontSize: `${speakerNameSize}px`, fontWeight: 700, color: speaker.style?.nameColor || '#ffffff' }}>
                {speaker.name}
              </span>
              <span style={{ fontSize: `${timestampSize}px`, fontFamily: timestampFontFamily, color: timestampColor }}>
                {formatTimestamp(item.start)}
              </span>
            </div>
          ) : null}
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
              borderBottomLeftRadius: `${radius}px`,
              borderBottomRightRadius: `${radius}px`,
              border: (speaker.style?.borderWidth ?? 0) > 0 ? `${speaker.style?.borderWidth ?? 0}px solid ${rgba(borderColor, borderOpacity)}` : 'none',
              boxShadow: bubbleShadow,
              maxWidth: `${bubbleMaxWidth}px`
            },
            contentStyle: {
              position: 'relative',
              zIndex: 1,
              padding: `${paddingY}px ${paddingX}px`,
              color: textColor,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.35
            },
            children: item.text
          })}
        </div>
      </div>
    </div>
  );
}

interface ChatAnnotationBubbleProps {
  item: SharedChatItem;
  speaker: SharedChatSpeaker;
  layoutScale: number;
  chatLayout?: SharedChatLayout;
  renderBubble?: (args: BubbleRenderArgs) => React.ReactNode;
}

export function ChatAnnotationBubble({ item, speaker, layoutScale, chatLayout, renderBubble }: ChatAnnotationBubbleProps) {
  const bubbleScale = chatLayout?.bubbleScale ?? 1.5;
  const combinedScale = Math.max(MIN_LAYOUT_SCALE, layoutScale) * bubbleScale;
  const shadowSize = (speaker.style?.shadowSize ?? 7) * combinedScale;
  const maxWidth = (speaker.style?.maxWidth ?? 720) * combinedScale;
  const opacity = speaker.style?.opacity ?? 0.9;
  const bgColor = speaker.style?.bgColor || '#111827';
  const textColor = speaker.style?.textColor || '#ffffff';
  const hexBg = bgColor.startsWith('#') ? bgColor : '#111827';
  const finalBgColor = `${hexBg}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`;
  const bubbleArgs = {
    outerStyle: {
      alignSelf: 'center',
      maxWidth: `${maxWidth}px`,
      borderRadius: `${(speaker.style?.borderRadius ?? 999) * combinedScale}px`,
      backgroundColor: finalBgColor,
      color: textColor,
      boxShadow: formatBubbleShadow(shadowSize),
      marginTop: speaker.style?.annotationPosition === 'top' ? `${(speaker.style?.margin ?? 12) * combinedScale}px` : undefined,
      marginBottom: (speaker.style?.annotationPosition ?? 'bottom') === 'bottom' ? `${(speaker.style?.margin ?? 12) * combinedScale}px` : undefined
    } as React.CSSProperties,
    contentStyle: {
      padding: `${(speaker.style?.paddingY ?? 10) * combinedScale}px ${(speaker.style?.paddingX ?? 18) * combinedScale}px`,
      fontFamily: speaker.style?.fontFamily || 'system-ui',
      fontSize: `${(speaker.style?.fontSize ?? 24) * combinedScale}px`,
      fontWeight: speaker.style?.fontWeight || 'normal',
      lineHeight: 1.35,
      textAlign: 'center' as const,
      whiteSpace: 'pre-wrap' as const,
      color: textColor
    },
    children: item.text
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
