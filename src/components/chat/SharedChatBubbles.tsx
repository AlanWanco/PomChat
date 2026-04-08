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
  annotationPosition?: 'top' | 'bottom';
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

  const fallbackBg = speaker.theme === 'dark' ? '#2563eb' : '#ffffff';
  const fallbackText = speaker.theme === 'dark' ? '#ffffff' : '#111827';
  const bgColor = speaker.style?.bgColor || fallbackBg;
  const textColor = speaker.style?.textColor || fallbackText;
  const borderColor = speaker.style?.borderColor || '#ffffff';
  const borderOpacity = speaker.style?.borderOpacity ?? 1;
  const radius = snapPx((speaker.style?.borderRadius ?? 28) * combinedScale);
  const sharpCornerRadius = Math.max(3, snapPx(4 * combinedScale));
  const topLeftRadius = isLeft ? sharpCornerRadius : radius;
  const topRightRadius = isLeft ? radius : sharpCornerRadius;
  const shadowSize = snapPx((speaker.style?.shadowSize ?? 7) * combinedScale);
  const margin = snapPx((speaker.style?.margin ?? 14) * combinedScale);
  const paddingX = snapPx((speaker.style?.paddingX ?? 20) * combinedScale);
  const paddingY = snapPx((speaker.style?.paddingY ?? 12) * combinedScale);
  const bubbleGap = snapPx(16 * combinedScale);
  const metaGap = snapPx(8 * combinedScale);
  const avatarPx = snapPx((chatLayout?.avatarSize ?? 80) * combinedScale);
  const avatarBorderWidth = Math.max(2, snapPx(4 * combinedScale));
  const speakerNameSize = snapPx((chatLayout?.speakerNameSize ?? 22) * combinedScale);
  const timestampSize = snapPx((chatLayout?.timestampSize ?? 16) * combinedScale);
  const timestampFontFamily = chatLayout?.timestampFontFamily || 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  const timestampColor = chatLayout?.timestampColor || 'rgba(255,255,255,0.65)';
  const fontSize = snapPx((speaker.style?.fontSize ?? 30) * combinedScale);
  const bubbleMaxWidthPercent = Math.max(15, Math.min(95, chatLayout?.bubbleMaxWidthPercent ?? 70));
  const bubbleMaxWidthPx = canvasWidth * layoutScaleSafe * (bubbleMaxWidthPercent / 100);
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

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        justifyContent: isLeft ? 'flex-start' : 'flex-end',
        marginBottom: `${margin}px`,
        transform: motionState.transform,
        transformOrigin: isLeft ? 'left center' : 'right center',
        opacity: motionState.opacity,
        filter: motionState.filter
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: isLeft ? 'row' : 'row-reverse',
          gap: `${bubbleGap}px`,
          maxWidth: '100%',
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
            maxWidth: `${bubbleMaxWidthPx}px`,
            filter: shouldEnableBlockShadow ? speakerBlockShadow : 'none'
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
              <span style={{ fontSize: `${speakerNameSize}px`, fontFamily: speaker.style?.nameFontFamily || speaker.style?.fontFamily || 'system-ui', fontWeight: speaker.style?.nameFontWeight || 700, color: speaker.style?.nameColor || '#ffffff', WebkitTextStroke: speakerNameStrokeWidth > 0 ? `${speakerNameStrokeWidth}px ${speakerNameStrokeColor}` : undefined }}>
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
               maxWidth: `${bubbleMaxWidthPx}px`
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
  currentTime: number;
  layoutScale: number;
  chatLayout?: SharedChatLayout;
  renderBubble?: (args: BubbleRenderArgs) => React.ReactNode;
}

export function ChatAnnotationBubble({ item, speaker, currentTime, layoutScale, chatLayout, renderBubble }: ChatAnnotationBubbleProps) {
  const bubbleScale = chatLayout?.bubbleScale ?? 1.5;
  const combinedScale = Math.max(MIN_LAYOUT_SCALE, layoutScale) * bubbleScale;
  const annotationAnimationStyle = speaker.style?.animationStyle || chatLayout?.animationStyle || 'rise';
  const annotationAnimationDuration = chatLayout?.animationDuration ?? 0.2;
  const annotationProgress = annotationAnimationStyle === 'none' || annotationAnimationDuration <= 0
    ? 1
    : clamp((currentTime - item.start + annotationAnimationDuration) / annotationAnimationDuration, 0, 1);
  const annotationMotion = annotationAnimationStyle === 'none'
    ? { opacity: 1, transform: undefined, filter: undefined }
    : getBubbleMotionState(annotationProgress, annotationAnimationStyle, speaker.side);
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
