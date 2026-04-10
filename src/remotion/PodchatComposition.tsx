import React from 'react';
import { AbsoluteFill, Audio, Img, Loop, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { Gif } from '@remotion/gif';
import type { PodchatExportInput } from './types';
import { ChatAnnotationBubble, ChatMessageBubble } from '../components/chat/SharedChatBubbles';

const MESSAGE_FALLBACK_COUNT = 32;

const parseSizePx = (value: string | number | undefined, fallback: number) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return Math.max(1, parsed);
  }
  return Math.max(1, fallback);
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
  const visibleMessages = appearedMessages.slice(-(props.chatLayout?.maxVisibleBubbles ?? MESSAGE_FALLBACK_COUNT));

  const visibleAnnotations = sortedContent.filter((item) => {
    const speaker = props.speakers[item.speaker];
    return Boolean(speaker?.type === 'annotation' && currentTime >= item.start && currentTime <= item.end);
  });
  const topAnnotations = visibleAnnotations.filter((item) => props.speakers[item.speaker]?.style?.annotationPosition === 'top');
  const bottomAnnotations = visibleAnnotations.filter((item) => (props.speakers[item.speaker]?.style?.annotationPosition ?? 'bottom') === 'bottom');

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
            {visibleMessages.map((item, index) => {
              const speaker = props.speakers[item.speaker];
              if (!speaker) {
                return null;
              }
              const prevSpeakerId = index > 0 ? visibleMessages[index - 1].speaker : undefined;
              const nextSpeakerId = index < visibleMessages.length - 1 ? visibleMessages[index + 1].speaker : undefined;
              const isLatestVisible = index === visibleMessages.length - 1;

              return (
                <ChatMessageBubble
                  key={`${item.speaker}-${item.start}-${item.text}`}
                  item={{ key: `${item.speaker}-${item.start}-${item.text}`, start: item.start, end: item.end, text: item.text, speakerId: item.speaker }}
                  speaker={speaker}
                  currentTime={currentTime}
                  canvasWidth={width}
                  layoutScale={layoutScale}
                  chatLayout={props.chatLayout}
                  prevSpeakerId={prevSpeakerId}
                  nextSpeakerId={nextSpeakerId}
                  isLatestVisible={isLatestVisible}
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
              />
            ))}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
