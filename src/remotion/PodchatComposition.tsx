import React from 'react';
import { AbsoluteFill, Audio, Img, Loop, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { Gif } from '@remotion/gif';
import type { BackgroundSlideItem, PodchatExportInput } from './types';
import { ChatAnnotationBubble, ChatMessageBubble, computeInterruptedMessageRows, getBubbleMotionState } from '../components/chat/SharedChatBubbles';
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
  const appearanceTime = Math.max(0, slide.start - (animationStyle === 'none' ? 0 : animationDuration));
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
  fit,
  position,
  blur,
  brightness,
  scale = 1,
  offsetX = 0,
  offsetY = 0,
  rotation = 0,
  animationStyle = 'none',
  animationDuration = 0.2,
  currentTime,
  start = 0,
  end,
  width,
  height,
}: {
  src?: string;
  fit?: string;
  position?: string;
  blur: number;
  brightness: number;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  rotation?: number;
  animationStyle?: 'none' | 'fade' | 'rise' | 'pop' | 'slide' | 'blur';
  animationDuration?: number;
  currentTime: number;
  start?: number;
  end?: number;
  width: number;
  height: number;
}) => {
  if (!src) return null;
  const objectFit = fit === 'contain' || fit === 'fill' ? fit : 'cover';
  const objectPosition = (() => {
    switch (position) {
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
  const appearanceTime = Math.max(0, start - ((animationStyle || 'fade') === 'none' ? 0 : animationDuration));
  const progress = animationStyle === 'none' || animationDuration <= 0 ? 1 : Math.max(0, Math.min(1, (currentTime - appearanceTime) / animationDuration));
  const disappearProgress = typeof end === 'number' && currentTime > end && animationStyle !== 'none' && animationDuration > 0
    ? Math.max(0, Math.min(1, 1 - ((currentTime - end) / animationDuration)))
    : 1;
  const motionState = getBubbleMotionState(progress * disappearProgress, animationStyle, 'left');
  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit,
    objectPosition,
    filter: `blur(${blur}px) brightness(${brightness})`,
    transform: `${objectFit === 'cover' ? 'scale(1.05) ' : ''}translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg) scale(${scale}) ${motionState.transform || ''}`.trim(),
    transformOrigin: '50% 50%',
    opacity: motionState.opacity,
    display: 'block'
  };

  if (/\.gif(\?|$)/i.test(src)) {
    return <Gif src={src} width={width} height={height} fit={objectFit as 'fill' | 'contain' | 'cover'} delayRenderTimeoutInMilliseconds={120000} style={style} />;
  }
  if (/\.(mp4|webm|mov)(\?|$)/i.test(src)) {
    return <OffthreadVideo src={src} muted style={style} />;
  }
  return <Img src={src} style={style} />;
};

export const PodchatComposition: React.FC<PodchatExportInput> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const currentTime = props.exportRange.start + frame / fps;
  const sortedContent = [...props.content].sort((a, b) => a.start - b.start || a.end - b.end);
  const layoutScale = width / (props.dimensions.width || width);
  const effectiveScale = Math.max(0.35, layoutScale);
  const animationDuration = props.chatLayout?.animationDuration ?? 0.2;
  const horizontalPadding = (props.chatLayout?.paddingLeft ?? props.chatLayout?.paddingX ?? 48) * effectiveScale;
  const topPadding = (props.chatLayout?.paddingTop ?? 48) * effectiveScale;
  const bottomPadding = (props.chatLayout?.paddingBottom ?? 80) * effectiveScale;
  const backgroundObjectFit = props.background?.fit === 'contain' || props.background?.fit === 'fill' ? props.background.fit : 'cover';
  const backgroundVideoDurationFrames = props.background?.duration
    ? Math.max(1, Math.round(props.background.duration * fps))
    : null;
  const backgroundVideoStartFrame = backgroundVideoDurationFrames
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
  const visibleMessageRows = computeInterruptedMessageRows(
    appearedMessages.map((item) => ({ ...item, speakerId: item.speaker })),
    Object.fromEntries(Object.entries(props.speakers).map(([key, value]) => [key, { side: value.side, type: value.type }])),
    props.chatLayout?.maxVisibleBubbles ?? MESSAGE_FALLBACK_COUNT,
  ).map((row) => ({
    left: row.left ? { ...row.left, speaker: row.left.speakerId } : undefined,
    right: row.right ? { ...row.right, speaker: row.right.speakerId } : undefined,
  }));
  const flatVisibleMessages = visibleMessageRows.flatMap((row) => [row.left, row.right].filter(Boolean));

  const visibleAnnotations = sortedContent.filter((item) => {
    const speaker = props.speakers[item.speaker];
    return Boolean(speaker?.type === 'annotation' && currentTime >= item.start && currentTime <= item.end);
  });
  const topAnnotations = visibleAnnotations.filter((item) => props.speakers[item.speaker]?.style?.annotationPosition === 'top');
  const bottomAnnotations = visibleAnnotations.filter((item) => (props.speakers[item.speaker]?.style?.annotationPosition ?? 'bottom') === 'bottom');
  const visibleSlides = (props.background?.slides || []).filter((slide) => {
    const slideAnimationDuration = slide.animationDuration ?? 0.24;
    const appearanceTime = Math.max(0, slide.start - ((slide.animationStyle || 'fade') === 'none' ? 0 : slideAnimationDuration));
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
          ) : /\.(mp4|webm|mov)(\?|$)/i.test(props.background.image) ? (
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
                fit: slide.fit,
                position: slide.position,
                blur: slide.inheritBackgroundFilters === false ? 0 : (props.background?.blur ?? 0),
                brightness: slide.inheritBackgroundFilters === false ? 1 : (props.background?.brightness ?? 1),
                scale: slide.scale ?? 1,
                offsetX: slide.offsetX ?? 0,
                offsetY: slide.offsetY ?? 0,
                rotation: slide.rotation ?? 0,
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
          paddingLeft: horizontalPadding,
          paddingRight: horizontalPadding,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: bottomPadding, display: 'flex', flexDirection: 'column' }}>
            {visibleMessageRows.map((row, rowIndex) => {
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
                        ? <Gif key={`${item.speaker}-${item.start}-${src}`} src={src} fit="contain" width={parseSizePx(style.maxWidth, 320)} height={parseSizePx(style.maxHeight, 240)} style={style} delayRenderTimeoutInMilliseconds={120000} />
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
                                : /\.mp4(\?|$)|\.webm(\?|$)|\.mov(\?|$)/i.test(src)
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
            paddingLeft: 32 * effectiveScale,
            paddingRight: 32 * effectiveScale,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 * effectiveScale, alignItems: 'center' }}>
            {topAnnotations.map((item) => (
              <ChatAnnotationBubble
                key={`top-${item.speaker}-${item.start}-${item.text}`}
                item={{ key: `top-${item.speaker}-${item.start}-${item.text}`, start: item.start, end: item.end, text: item.text, speakerId: item.speaker }}
                speaker={props.speakers[item.speaker]}
                currentTime={currentTime}
                layoutScale={layoutScale}
                chatLayout={props.chatLayout}
                renderInlineImage={({ src, alt, style }) => /\.gif(\?|$)/i.test(src)
                  ? <Gif key={`top-${item.speaker}-${item.start}-${src}`} src={src} fit="contain" width={parseSizePx(style.maxWidth, 320)} height={parseSizePx(style.maxHeight, 240)} style={style} delayRenderTimeoutInMilliseconds={120000} />
                  : <Img key={`top-${item.speaker}-${item.start}-${src}`} src={src} alt={alt} style={style} />}
              />
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 * effectiveScale, alignItems: 'center' }}>
            {bottomAnnotations.map((item) => (
              <ChatAnnotationBubble
                key={`bottom-${item.speaker}-${item.start}-${item.text}`}
                item={{ key: `bottom-${item.speaker}-${item.start}-${item.text}`, start: item.start, end: item.end, text: item.text, speakerId: item.speaker }}
                speaker={props.speakers[item.speaker]}
                currentTime={currentTime}
                layoutScale={layoutScale}
                chatLayout={props.chatLayout}
                renderInlineImage={({ src, alt, style }) => /\.gif(\?|$)/i.test(src)
                  ? <Gif key={`bottom-${item.speaker}-${item.start}-${src}`} src={src} fit="contain" width={parseSizePx(style.maxWidth, 320)} height={parseSizePx(style.maxHeight, 240)} style={style} delayRenderTimeoutInMilliseconds={120000} />
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
                fit: slide.fit,
                position: slide.position,
                blur: 0,
                brightness: 1,
                scale: slide.scale ?? 1,
                offsetX: slide.offsetX ?? 0,
                offsetY: slide.offsetY ?? 0,
                rotation: slide.rotation ?? 0,
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
