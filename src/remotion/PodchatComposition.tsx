import React from 'react';
import { AbsoluteFill, Audio, Img, Loop, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { Gif } from '@remotion/gif';
import type { BackgroundSlideItem, PodchatExportInput } from './types';
import { ChatAnnotationBubble, ChatMessageBubble, computeInterruptedMessageRows, computeSimpleMessageRows, getBubbleMotionState } from '../components/chat/SharedChatBubbles';
import { getTextAssetLayout, getTextAssetSvgMetrics } from './textAssetLayout';

const MESSAGE_FALLBACK_COUNT = 32;

const parseSizePx = (value: string | number | undefined, fallback: number) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return Math.max(1, parsed);
  }
  return Math.max(1, fallback);
};

const fitSizeWithin = ({
  sourceWidth,
  sourceHeight,
  maxWidth,
  maxHeight,
}: {
  sourceWidth: number;
  sourceHeight: number;
  maxWidth: number;
  maxHeight: number;
}) => {
  const safeSourceWidth = Math.max(1, sourceWidth);
  const safeSourceHeight = Math.max(1, sourceHeight);
  const widthRatio = maxWidth / safeSourceWidth;
  const heightRatio = maxHeight / safeSourceHeight;
  const ratio = Math.min(widthRatio, heightRatio, 1);

  return {
    width: Math.max(1, Math.round(safeSourceWidth * ratio)),
    height: Math.max(1, Math.round(safeSourceHeight * ratio)),
  };
};

const MarkdownGif = ({
  gifKey,
  src,
  style,
}: {
  gifKey: string;
  src: string;
  style: React.CSSProperties;
}) => {
  const maxWidth = parseSizePx(style.maxWidth as string | number | undefined, 320);
  const maxHeight = parseSizePx(style.maxHeight as string | number | undefined, 240);
  const [displaySize, setDisplaySize] = React.useState<{ width: number; height: number } | null>(null);

  return (
    <Gif
      key={gifKey}
      src={src}
      fit="fill"
      width={displaySize?.width ?? maxWidth}
      height={displaySize?.height ?? maxHeight}
      delayRenderTimeoutInMilliseconds={120000}
      onLoad={({ width, height }) => {
        const next = fitSizeWithin({ sourceWidth: width, sourceHeight: height, maxWidth, maxHeight });
        setDisplaySize((prev) => (prev?.width === next.width && prev?.height === next.height ? prev : next));
      }}
      style={{
        ...style,
        display: 'block',
        width: `${displaySize?.width ?? maxWidth}px`,
        height: `${displaySize?.height ?? maxHeight}px`,
        maxWidth: `${maxWidth}px`,
        maxHeight: `${maxHeight}px`,
      }}
    />
  );
};

const renderSlideText = ({
  slide,
  currentTime,
  blur = 0,
  brightness = 1,
}: {
  slide: BackgroundSlideItem;
  currentTime: number;
  blur?: number;
  brightness?: number;
}) => {
  const animationStyle = slide.animationStyle || 'fade';
  const animationDuration = slide.animationDuration ?? 0.24;
  const instantAppearanceEpsilon = animationStyle === 'none' || animationDuration <= 0 ? (1 / 120) : 0;
  const appearanceTime = Math.max(0, slide.start - (animationStyle === 'none' ? 0 : animationDuration) - instantAppearanceEpsilon);
  const progress = animationStyle === 'none' || animationDuration <= 0 ? 1 : Math.max(0, Math.min(1, (currentTime - appearanceTime) / animationDuration));
  const disappearProgress = typeof slide.end === 'number' && currentTime > slide.end && animationStyle !== 'none' && animationDuration > 0
    ? Math.max(0, Math.min(1, 1 - ((currentTime - slide.end) / animationDuration)))
    : 1;
  const motionState = getBubbleMotionState(progress * disappearProgress, animationStyle, 'left');
  const { textLines, fontSize, strokeWidth, estimatedWidth, estimatedHeight } = getTextAssetLayout(slide);
  const shadowSize = slide.textShadowSize ?? 0;
  const { textAnchorX, getLineY } = getTextAssetSvgMetrics({ width: estimatedWidth, height: estimatedHeight, fontSize, lineCount: textLines.length });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) translate(${slide.offsetX ?? 0}px, ${slide.offsetY ?? 0}px) rotate(${slide.rotation ?? 0}deg) scale(${slide.scale ?? 1}) ${motionState.transform || ''}`.trim(),
          transformOrigin: '50% 50%',
          opacity: (slide.opacity ?? 1) * motionState.opacity,
          filter: `blur(${blur}px) brightness(${brightness})`,
          fontFamily: slide.fontFamily || 'system-ui',
          fontSize: `${fontSize}px`,
          fontWeight: slide.fontWeight || '700',
          lineHeight: 1.15,
          color: slide.textColor || '#FFFFFF',
          whiteSpace: 'pre-wrap',
          textAlign: 'center',
          width: `${estimatedWidth}px`,
          height: `${estimatedHeight}px`,
        }}
      >
        <svg width={estimatedWidth} height={estimatedHeight} overflow="visible" style={{ display: 'block' }}>
          <g>
          {textLines.map((line, index) => (
            <text
              key={`${line}-${index}`}
              x={textAnchorX}
              y={getLineY(index)}
              textAnchor="middle"
              dominantBaseline="hanging"
              fontFamily={slide.fontFamily || 'system-ui'}
              fontSize={fontSize}
              fontWeight={slide.fontWeight || '700'}
              fill={slide.textColor || '#FFFFFF'}
              stroke={strokeWidth > 0 ? (slide.textStrokeColor || '#000000') : 'none'}
              strokeWidth={strokeWidth}
              paintOrder="stroke"
              filter={shadowSize > 0 ? `drop-shadow(0 0 ${shadowSize}px ${slide.textShadowColor || '#00000088'})` : undefined}
            >
              {line || ' '}
            </text>
          ))}
          </g>
        </svg>
      </div>
    </AbsoluteFill>
  );
};

const renderSlideAsset = ({
  src,
  blur,
  brightness,
  scale = 1,
  offsetX = 0,
  offsetY = 0,
  rotation = 0,
  opacity = 1,
  imageBorderColor = '#FFFFFF',
  imageBorderWidth = 0,
  imageShadowColor = '#00000066',
  imageShadowSize = 0,
  intrinsicWidth,
  intrinsicHeight,
  animationStyle = 'none',
  animationDuration = 0.2,
  currentTime,
  start = 0,
  end,
  width,
  height,
}: {
  src?: string;
  blur: number;
  brightness: number;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  rotation?: number;
  opacity?: number;
  imageBorderColor?: string;
  imageBorderWidth?: number;
  imageShadowColor?: string;
  imageShadowSize?: number;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
  animationStyle?: 'none' | 'fade' | 'rise' | 'pop' | 'slide' | 'blur';
  animationDuration?: number;
  currentTime: number;
  start?: number;
  end?: number;
  width: number;
  height: number;
}) => {
  if (!src) return null;
  const appearanceTime = Math.max(0, start - ((animationStyle || 'fade') === 'none' ? 0 : animationDuration));
  const progress = animationStyle === 'none' || animationDuration <= 0 ? 1 : Math.max(0, Math.min(1, (currentTime - appearanceTime) / animationDuration));
  const disappearProgress = typeof end === 'number' && currentTime > end && animationStyle !== 'none' && animationDuration > 0
    ? Math.max(0, Math.min(1, 1 - ((currentTime - end) / animationDuration)))
    : 1;
  const motionState = getBubbleMotionState(progress * disappearProgress, animationStyle, 'left');
  const baseWidth = intrinsicWidth ?? width;
  const baseHeight = intrinsicHeight ?? height;
  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'fill',
    filter: `blur(${blur}px) brightness(${brightness})`,
    transform: `translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg) scale(${scale}) ${motionState.transform || ''}`.trim(),
    transformOrigin: '50% 50%',
    opacity: opacity * motionState.opacity,
    boxShadow: [
      imageBorderWidth > 0 ? `inset 0 0 0 ${imageBorderWidth}px ${imageBorderColor}` : null,
      imageShadowSize > 0 ? `0 0 ${imageShadowSize}px ${imageShadowColor}` : null,
    ].filter(Boolean).join(', ') || undefined,
    display: 'block'
  };
  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: baseWidth,
    height: baseHeight,
    transform: 'translate(-50%, -50%)',
    overflow: 'visible',
  };

  if (/\.gif(\?|$)/i.test(src)) {
    return <div style={wrapperStyle}><Gif src={src} width={baseWidth} height={baseHeight} fit="fill" delayRenderTimeoutInMilliseconds={120000} style={style} /></div>;
  }
  if (/\.(mp4|webm|mov|mkv)(\?|$)/i.test(src)) {
    return <div style={wrapperStyle}><OffthreadVideo src={src} muted style={style} /></div>;
  }
  return <div style={wrapperStyle}><Img src={src} style={style} /></div>;
};

export const PodchatComposition: React.FC<PodchatExportInput> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const currentTime = props.exportRange.start + frame / fps;
  const sortedContent = [...props.content].filter((item) => item.visible !== false).sort((a, b) => a.start - b.start || a.end - b.end);
  const layoutScale = width / (props.dimensions.width || width);
  const effectiveScale = Math.max(0.35, layoutScale);
  const animationDuration = props.chatLayout?.animationDuration ?? 0.2;
  const leftPadding = (props.chatLayout?.paddingLeft ?? props.chatLayout?.paddingX ?? 48) * effectiveScale;
  const rightPadding = (props.chatLayout?.paddingRight ?? props.chatLayout?.paddingX ?? 48) * effectiveScale;
  const topPadding = (props.chatLayout?.paddingTop ?? 48) * effectiveScale;
  const bottomPadding = (props.chatLayout?.paddingBottom ?? 80) * effectiveScale;
  const chatContentWidth = Math.max(1, width - leftPadding - rightPadding);
  const topFadeHeight = Math.max(20, (props.chatLayout?.topFadeHeight ?? 120) * effectiveScale);
  const topFadeStyle = props.chatLayout?.topFadeEnabled
    ? {
        WebkitMaskImage: `linear-gradient(to bottom, transparent 0px, black ${topFadeHeight}px, black 100%)`,
        maskImage: `linear-gradient(to bottom, transparent 0px, black ${topFadeHeight}px, black 100%)`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: '100% 100%',
        maskSize: '100% 100%',
      } as React.CSSProperties
    : undefined;
  const backgroundObjectFit = props.background?.fit === 'contain' || props.background?.fit === 'fill' ? props.background.fit : 'cover';
  const backgroundVideoDurationFrames = props.background?.duration
    ? Math.max(1, Math.round(props.background.duration * fps))
    : null;
  const backgroundVideoStartFrame = props.background?.renderStartsAtZero
    ? 0
    : backgroundVideoDurationFrames
    ? Math.floor((props.exportRange.start * fps) % backgroundVideoDurationFrames)
    : 0;
  const backgroundObjectPosition = (() => {
    switch (props.background?.position) {
      case 'top': return 'center top';
      case 'bottom': return 'center bottom';
      case 'left': return 'left center';
      case 'right': return 'right center';
      case 'top-left': return 'left top';
      case 'top-right': return 'right top';
      case 'bottom-left': return 'left bottom';
      case 'bottom-right': return 'right bottom';
      default: return 'center center';
    }
  })();

  const appearedMessages = sortedContent.filter((item) => {
    const speaker = props.speakers[item.speaker];
    if (!speaker || speaker.type === 'annotation') {
      return false;
    }

    const appearanceTime = Math.max(0, item.start - ((props.chatLayout?.animationStyle || 'rise') === 'none' ? 0 : animationDuration));
    return currentTime >= appearanceTime;
  });
  const visibleMessageRows = ((props.chatLayout?.interruptionEnabled ?? true) ? computeInterruptedMessageRows : computeSimpleMessageRows)(
    appearedMessages.map((item) => ({ ...item, speakerId: item.speaker })),
    Object.fromEntries(Object.entries(props.speakers).map(([key, value]) => [key, { side: value.side, type: value.type }])),
    props.chatLayout?.maxVisibleBubbles ?? MESSAGE_FALLBACK_COUNT,
  ).map((row) => ({
    left: row.left ? { ...row.left, speaker: row.left.speakerId } : undefined,
    right: row.right ? { ...row.right, speaker: row.right.speakerId } : undefined,
  }));
  const flatVisibleMessages = visibleMessageRows.flatMap((row) => [row.left, row.right].filter(Boolean));
  const trackLayout = (() => {
    const enabled = Boolean(props.chatLayout?.independentTracksEnabled);
    const trackCount = Math.max(1, Math.round(props.chatLayout?.trackCount ?? 1));
    if (!enabled || trackCount <= 1) {
      return null;
    }

    const maxVisible = props.chatLayout?.maxVisibleBubbles ?? MESSAGE_FALLBACK_COUNT;
    const tracks = Array.from({ length: trackCount }, (_, index) => ({ index, items: [] as typeof appearedMessages }));

    for (let index = 0; index < trackCount; index += 1) {
      const trackMessages = appearedMessages.filter((item) => {
        const speaker = props.speakers[item.speaker];
        const trackIndex = Math.max(0, Math.min(trackCount - 1, ((speaker?.style?.trackIndex ?? 1) - 1)));
        return trackIndex === index;
      });

      tracks[index].items = trackMessages.slice(-maxVisible);
    }

    return { trackCount, tracks };
  })();

  const visibleAnnotations = sortedContent.filter((item) => {
    const speaker = props.speakers[item.speaker];
    return Boolean(speaker?.type === 'annotation' && currentTime >= item.start && currentTime <= item.end);
  });
  const topAnnotations = visibleAnnotations.filter((item) => props.speakers[item.speaker]?.style?.annotationPosition === 'top');
  const bottomAnnotations = visibleAnnotations.filter((item) => (props.speakers[item.speaker]?.style?.annotationPosition ?? 'bottom') === 'bottom');
  const visibleSlides = (props.background?.slides || []).filter((slide) => {
    const slideAnimationDuration = slide.animationDuration ?? 0.24;
    const instantAppearanceEpsilon = (slide.animationStyle || 'fade') === 'none' || slideAnimationDuration <= 0 ? (1 / Math.max(1, fps)) : 0;
    const appearanceTime = Math.max(0, slide.start - ((slide.animationStyle || 'fade') === 'none' ? 0 : slideAnimationDuration) - instantAppearanceEpsilon);
    return currentTime >= appearanceTime && currentTime <= slide.end + slideAnimationDuration;
  });
  const backgroundSlidesBelowChat = visibleSlides
    .filter((slide) => (slide.layer || 'background') === 'background')
    .sort((a, b) => (a.backgroundOrder ?? 0) - (b.backgroundOrder ?? 0));
  const backgroundSlidesAboveChat = visibleSlides
    .filter((slide) => slide.layer === 'overlay')
    .sort((a, b) => (a.overlayOrder ?? 0) - (b.overlayOrder ?? 0));

  const baseBackgroundColor = props.transparentBackground ? 'rgba(0,0,0,0)' : '#111111';

  return (
    <AbsoluteFill style={{ backgroundColor: baseBackgroundColor, overflow: 'hidden', fontFamily: 'system-ui' }}>
      {props.background?.image ? (
        <AbsoluteFill>
          {/\.gif(\?|$)/i.test(props.background.image) ? (
            <Gif
              src={props.background.image}
              width={props.dimensions.width || width}
              height={props.dimensions.height || width}
              fit={backgroundObjectFit as 'fill' | 'contain' | 'cover'}
              delayRenderTimeoutInMilliseconds={120000}
              style={{
                width: '100%',
                height: '100%',
                filter: `blur(${props.background.blur ?? 0}px) brightness(${props.background.brightness ?? 1})`,
                transform: backgroundObjectFit === 'cover' ? 'scale(1.05)' : undefined,
                transformOrigin: backgroundObjectPosition,
                display: 'block'
              }}
            />
          ) : /\.(mp4|webm|mov|mkv)(\?|$)/i.test(props.background.image) ? (
            <Loop durationInFrames={backgroundVideoDurationFrames || durationInFrames}>
              <OffthreadVideo
                src={props.background.image}
                muted
                trimBefore={backgroundVideoStartFrame}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: backgroundObjectFit,
                  objectPosition: backgroundObjectPosition,
                  filter: `blur(${props.background.blur ?? 0}px) brightness(${props.background.brightness ?? 1})`,
                  transform: backgroundObjectFit === 'cover' ? 'scale(1.05)' : undefined,
                  transformOrigin: backgroundObjectPosition
                }}
              />
            </Loop>
          ) : (
            <Img
              src={props.background.image}
              style={{
                width: '100%',
                height: '100%',
                objectFit: backgroundObjectFit,
                objectPosition: backgroundObjectPosition,
                filter: `blur(${props.background.blur ?? 0}px) brightness(${props.background.brightness ?? 1})`,
                transform: backgroundObjectFit === 'cover' ? 'scale(1.05)' : undefined,
                transformOrigin: backgroundObjectPosition
              }}
            />
          )}
        </AbsoluteFill>
      ) : null}
      {backgroundSlidesBelowChat.map((slide) => (
        <AbsoluteFill key={`bg-slide-${slide.id}`}>
          {slide.type === 'text'
            ? renderSlideText({ slide, currentTime, blur: slide.inheritBackgroundFilters === false ? 0 : (props.background?.blur ?? 0), brightness: slide.inheritBackgroundFilters === false ? 1 : (props.background?.brightness ?? 1) })
            : renderSlideAsset({
                src: slide.image,
                blur: slide.inheritBackgroundFilters === false ? 0 : (props.background?.blur ?? 0),
                brightness: slide.inheritBackgroundFilters === false ? 1 : (props.background?.brightness ?? 1),
                scale: slide.scale ?? 1,
                offsetX: slide.offsetX ?? 0,
                offsetY: slide.offsetY ?? 0,
                rotation: slide.rotation ?? 0,
                opacity: slide.opacity ?? 1,
                imageBorderColor: slide.imageBorderColor || '#FFFFFF',
                imageBorderWidth: slide.imageBorderWidth ?? 0,
                imageShadowColor: slide.imageShadowColor || '#00000066',
                imageShadowSize: slide.imageShadowSize ?? 0,
                intrinsicWidth: slide.intrinsicWidth,
                intrinsicHeight: slide.intrinsicHeight,
                animationStyle: slide.animationStyle || 'fade',
                animationDuration: slide.animationDuration ?? 0.24,
                currentTime,
                start: slide.start,
                end: slide.end,
                width: props.dimensions.width || width,
                height: props.dimensions.height || width,
              })}
        </AbsoluteFill>
      ))}
      {!props.transparentBackground && (
        <AbsoluteFill style={{ backgroundColor: props.background?.image ? 'rgba(0,0,0,0.06)' : '#111111' }} />
      )}

      {props.audioPath ? (
        <Sequence from={0}>
          <Audio src={props.audioPath} startFrom={Math.max(0, Math.round(props.exportRange.start * fps))} />
        </Sequence>
      ) : null}

      <AbsoluteFill
          style={{
            paddingTop: topPadding,
            paddingLeft: leftPadding,
            paddingRight: rightPadding,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
        }}
      >
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', ...topFadeStyle }}>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: bottomPadding, display: 'flex', flexDirection: 'column' }}>
            {trackLayout ? (
              <div style={{ display: 'flex', width: '100%', alignItems: 'flex-end' }}>
                {trackLayout.tracks.map((track) => {
                  const trackWidth = chatContentWidth / trackLayout.trackCount;
                  return (
                    <div key={`track-${track.index}`} style={{ width: `${100 / trackLayout.trackCount}%`, minWidth: 0, position: 'relative' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>{track.items.map((item, itemIndex) => { const speaker = props.speakers[item.speaker]; if (!speaker) return null; const prevSpeakerId = itemIndex > 0 ? track.items[itemIndex - 1]?.speaker : undefined; const nextSpeakerId = itemIndex < track.items.length - 1 ? track.items[itemIndex + 1]?.speaker : undefined; const trackPaddingLeft = speaker.style?.trackPaddingLeft ?? 5; const trackPaddingRight = speaker.style?.trackPaddingRight ?? 5; const bubbleWidth = Math.max(80, trackWidth - trackPaddingLeft - trackPaddingRight); return <div key={`${item.speaker}-${item.start}-${item.text}`} style={{ display: 'flex', justifyContent: speaker.side === 'right' ? 'flex-end' : 'flex-start', paddingLeft: trackPaddingLeft, paddingRight: trackPaddingRight }}><ChatMessageBubble item={{ key: `${item.speaker}-${item.start}-${item.text}`, start: item.start, end: item.end, text: item.text, speakerId: item.speaker }} speaker={speaker} currentTime={currentTime} canvasWidth={trackWidth} layoutScale={layoutScale} chatLayout={props.chatLayout} prevSpeakerId={prevSpeakerId} nextSpeakerId={nextSpeakerId} isLatestVisible={itemIndex === track.items.length - 1} bubbleMaxWidthOverridePx={bubbleWidth} renderInlineImage={({ src, alt, style }) => /\.gif(\?|$)/i.test(src) ? <MarkdownGif gifKey={`${item.speaker}-${item.start}-${src}`} src={src} style={style} /> : <Img key={`${item.speaker}-${item.start}-${src}`} src={src} alt={alt} style={style} />} renderAvatar={({ src, alt, style }) => ((() => { const outerWidth = parseSizePx(style.width, 80); const outerHeight = parseSizePx(style.height, 80); const bubbleScale = props.chatLayout?.bubbleScale ?? 1.5; const combinedScale = Math.max(0.1, layoutScale) * bubbleScale; const borderWidth = Math.max(2, Math.round(4 * combinedScale)); const borderColor = speaker.style?.avatarBorderColor || 'rgba(255,255,255,0.12)'; const innerWidth = Math.max(1, outerWidth - borderWidth * 2); const innerHeight = Math.max(1, outerHeight - borderWidth * 2); return <div style={{ width: style.width, height: style.height, minWidth: style.minWidth, position: 'relative', borderRadius: style.borderRadius, overflow: 'hidden', boxSizing: 'border-box', backgroundColor: borderColor, boxShadow: style.boxShadow, border: `${borderWidth}px solid ${borderColor}` }}>{/\.gif(\?|$)/i.test(src) ? <Gif src={src} width={innerWidth} height={innerHeight} fit="cover" delayRenderTimeoutInMilliseconds={120000} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} /> : /\.mp4(\?|$)|\.webm(\?|$)|\.mov(\?|$)|\.mkv(\?|$)/i.test(src) ? <OffthreadVideo src={src} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div>; })())} renderBubble={({ outerStyle, contentStyle, children }) => <div style={outerStyle}><div style={contentStyle}>{children}</div></div>} /></div>; })}</div>
                    </div>
                  );
                })}
              </div>
            ) : visibleMessageRows.map((row, rowIndex) => {
              const isLatestRow = rowIndex === visibleMessageRows.length - 1;

              const renderRowBubble = (side: 'left' | 'right') => {
                const item = row[side];
                if (!item) return null;
                const speaker = props.speakers[item.speaker];
                if (!speaker) return null;
                const flatIndex = flatVisibleMessages.findIndex((candidate) => candidate?.speaker === item.speaker && candidate?.start === item.start && candidate?.text === item.text);
                const prevSpeakerId = flatIndex > 0 ? flatVisibleMessages[flatIndex - 1]?.speaker : undefined;
                const nextSpeakerId = flatIndex < flatVisibleMessages.length - 1 ? flatVisibleMessages[flatIndex + 1]?.speaker : undefined;

                return (
                  <div
                    key={`${item.speaker}-${item.start}-${item.text}-${side}`}
                    style={{
                      flex: '0 1 auto',
                      minWidth: 0,
                      display: 'flex',
                      justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
                      marginLeft: side === 'right' ? 'auto' : undefined,
                    }}
                  >
                    <ChatMessageBubble
                      item={{ key: `${item.speaker}-${item.start}-${item.text}`, start: item.start, end: item.end, text: item.text, speakerId: item.speaker }}
                      speaker={speaker}
                      currentTime={currentTime}
                      canvasWidth={width}
                      layoutScale={layoutScale}
                      chatLayout={props.chatLayout}
                      prevSpeakerId={prevSpeakerId}
                      nextSpeakerId={nextSpeakerId}
                      isLatestVisible={isLatestRow}
                      renderInlineImage={({ src, alt, style }) => /\.gif(\?|$)/i.test(src)
                        ? <MarkdownGif gifKey={`${item.speaker}-${item.start}-${src}`} src={src} style={style} />
                        : <Img key={`${item.speaker}-${item.start}-${src}`} src={src} alt={alt} style={style} />}
                      renderAvatar={({ src, alt, style }) => (
                        (() => {
                          const outerWidth = parseSizePx(style.width, 80);
                          const outerHeight = parseSizePx(style.height, 80);
                          const bubbleScale = props.chatLayout?.bubbleScale ?? 1.5;
                          const combinedScale = Math.max(0.1, layoutScale) * bubbleScale;
                          const borderWidth = Math.max(2, Math.round(4 * combinedScale));
                          const borderColor = speaker.style?.avatarBorderColor || 'rgba(255,255,255,0.12)';
                          const innerWidth = Math.max(1, outerWidth - borderWidth * 2);
                          const innerHeight = Math.max(1, outerHeight - borderWidth * 2);

                          return (
                            <div
                              style={{
                                width: style.width,
                                height: style.height,
                                minWidth: style.minWidth,
                                position: 'relative',
                                borderRadius: style.borderRadius,
                                overflow: 'hidden',
                                boxSizing: 'border-box',
                                backgroundColor: borderColor,
                                boxShadow: style.boxShadow,
                                border: `${borderWidth}px solid ${borderColor}`
                              }}
                            >
                              {/\.gif(\?|$)/i.test(src)
                                ? <Gif
                                    src={src}
                                    width={innerWidth}
                                    height={innerHeight}
                                    fit="cover"
                                    delayRenderTimeoutInMilliseconds={120000}
                                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
                                  />
                                : /\.mp4(\?|$)|\.webm(\?|$)|\.mov(\?|$)|\.mkv(\?|$)/i.test(src)
                                  ? <OffthreadVideo src={src} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  : <Img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            </div>
                          );
                        })()
                      )}
                      renderBubble={({ outerStyle, contentStyle, children }) => (
                        <div style={outerStyle}>
                          <div style={contentStyle}>{children}</div>
                        </div>
                      )}
                    />
                  </div>
                );
              };

              return (
                <div key={`remotion-row-${rowIndex}`} style={{ display: 'flex', alignItems: 'flex-end', width: '100%' }}>
                  {renderRowBubble('left')}
                  {renderRowBubble('right')}
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>

      {(topAnnotations.length > 0 || bottomAnnotations.length > 0) ? (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            paddingTop: 24 * effectiveScale,
            paddingBottom: 24 * effectiveScale,
            paddingLeft: leftPadding,
            paddingRight: rightPadding,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 * effectiveScale, alignItems: 'stretch', width: '100%' }}>
            {topAnnotations.map((item) => (
              <ChatAnnotationBubble
                key={`top-${item.speaker}-${item.start}-${item.text}`}
                item={{ key: `top-${item.speaker}-${item.start}-${item.text}`, start: item.start, end: item.end, text: item.text, speakerId: item.speaker }}
                speaker={props.speakers[item.speaker]}
                currentTime={currentTime}
                layoutScale={layoutScale}
                chatLayout={props.chatLayout}
                renderInlineImage={({ src, alt, style }) => /\.gif(\?|$)/i.test(src)
                  ? <MarkdownGif gifKey={`top-${item.speaker}-${item.start}-${src}`} src={src} style={style} />
                  : <Img key={`top-${item.speaker}-${item.start}-${src}`} src={src} alt={alt} style={style} />}
              />
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 * effectiveScale, alignItems: 'stretch', width: '100%' }}>
            {bottomAnnotations.map((item) => (
              <ChatAnnotationBubble
                key={`bottom-${item.speaker}-${item.start}-${item.text}`}
                item={{ key: `bottom-${item.speaker}-${item.start}-${item.text}`, start: item.start, end: item.end, text: item.text, speakerId: item.speaker }}
                speaker={props.speakers[item.speaker]}
                currentTime={currentTime}
                layoutScale={layoutScale}
                chatLayout={props.chatLayout}
                renderInlineImage={({ src, alt, style }) => /\.gif(\?|$)/i.test(src)
                  ? <MarkdownGif gifKey={`bottom-${item.speaker}-${item.start}-${src}`} src={src} style={style} />
                  : <Img key={`bottom-${item.speaker}-${item.start}-${src}`} src={src} alt={alt} style={style} />}
              />
            ))}
          </div>
        </AbsoluteFill>
      ) : null}
      {backgroundSlidesAboveChat.map((slide) => (
        <AbsoluteFill key={`overlay-slide-${slide.id}`}>
          {slide.type === 'text'
            ? renderSlideText({ slide, currentTime, blur: 0, brightness: 1 })
            : renderSlideAsset({
                src: slide.image,
                blur: 0,
                brightness: 1,
                scale: slide.scale ?? 1,
                offsetX: slide.offsetX ?? 0,
                offsetY: slide.offsetY ?? 0,
                rotation: slide.rotation ?? 0,
                opacity: slide.opacity ?? 1,
                imageBorderColor: slide.imageBorderColor || '#FFFFFF',
                imageBorderWidth: slide.imageBorderWidth ?? 0,
                imageShadowColor: slide.imageShadowColor || '#00000066',
                imageShadowSize: slide.imageShadowSize ?? 0,
                intrinsicWidth: slide.intrinsicWidth,
                intrinsicHeight: slide.intrinsicHeight,
                animationStyle: slide.animationStyle || 'fade',
                animationDuration: slide.animationDuration ?? 0.24,
                currentTime,
                start: slide.start,
                end: slide.end,
                width: props.dimensions.width || width,
                height: props.dimensions.height || width,
              })}
        </AbsoluteFill>
      ))}
    </AbsoluteFill>
  );
};
