import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import type { PodchatExportInput } from './types';
import { ChatAnnotationBubble, ChatMessageBubble } from '../components/chat/SharedChatBubbles';

const MESSAGE_LOOKBACK_SECONDS = 5;
const MESSAGE_LOOKAHEAD_SECONDS = 2;
const MESSAGE_FALLBACK_COUNT = 32;

export const PodchatComposition: React.FC<PodchatExportInput> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const currentTime = props.exportRange.start + frame / fps;
  const layoutScale = width / (props.dimensions.width || width);
  const effectiveScale = Math.max(0.35, layoutScale);
  const animationDuration = props.chatLayout?.animationDuration ?? 0.2;
  const horizontalPadding = (props.chatLayout?.paddingLeft ?? props.chatLayout?.paddingX ?? 48) * effectiveScale;
  const topPadding = (props.chatLayout?.paddingTop ?? 48) * effectiveScale;
  const bottomPadding = (props.chatLayout?.paddingBottom ?? 80) * effectiveScale;

  const appearedMessages = props.content.filter((item) => {
    const speaker = props.speakers[item.speaker];
    if (!speaker || speaker.type === 'annotation') {
      return false;
    }

    const appearanceTime = Math.max(0, item.start - ((props.chatLayout?.animationStyle || 'rise') === 'none' ? 0 : animationDuration));
    return currentTime >= appearanceTime;
  });
  const timeWindowMessages = appearedMessages.filter((item) => (
    item.start >= currentTime - MESSAGE_LOOKBACK_SECONDS &&
    item.start <= currentTime + MESSAGE_LOOKAHEAD_SECONDS
  ));
  const visibleMessages = timeWindowMessages.length >= MESSAGE_FALLBACK_COUNT
    ? timeWindowMessages
    : appearedMessages.slice(-MESSAGE_FALLBACK_COUNT);

  const visibleAnnotations = props.content.filter((item) => {
    const speaker = props.speakers[item.speaker];
    return Boolean(speaker?.type === 'annotation' && currentTime >= item.start && currentTime <= item.end);
  });
  const topAnnotations = visibleAnnotations.filter((item) => props.speakers[item.speaker]?.style?.annotationPosition === 'top');
  const bottomAnnotations = visibleAnnotations.filter((item) => (props.speakers[item.speaker]?.style?.annotationPosition ?? 'bottom') === 'bottom');

  return (
    <AbsoluteFill style={{ backgroundColor: '#111111', overflow: 'hidden', fontFamily: 'system-ui' }}>
      {props.background?.image ? (
        <AbsoluteFill>
          <Img
            src={props.background.image}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: `blur(${props.background.blur ?? 0}px) brightness(${props.background.brightness ?? 1})`,
              transform: 'scale(1.05)'
            }}
          />
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill style={{ backgroundColor: props.background?.image ? 'rgba(0,0,0,0.06)' : '#111111' }} />

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
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div style={{ width: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: bottomPadding }}>
            {visibleMessages.map((item) => {
              const speaker = props.speakers[item.speaker];
              if (!speaker) {
                return null;
              }

              return (
                <ChatMessageBubble
                  key={`${item.speaker}-${item.start}-${item.text}`}
                  item={{ key: `${item.speaker}-${item.start}-${item.text}`, start: item.start, end: item.end, text: item.text, speakerId: item.speaker }}
                  speaker={speaker}
                  currentTime={currentTime}
                  canvasWidth={width}
                  layoutScale={layoutScale}
                  chatLayout={props.chatLayout}
                  renderAvatar={({ src, alt, style }) => (
                    <div
                      style={{
                        width: style.width,
                        height: style.height,
                        minWidth: style.minWidth,
                        borderRadius: style.borderRadius,
                        overflow: 'hidden',
                        backgroundColor: (style.borderColor as string) || 'rgba(255,255,255,0.12)',
                        boxShadow: style.boxShadow,
                        border: `${style.borderWidth || '0px'} solid ${style.borderColor || '#ffffff'}`
                      }}
                    >
                      <Img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
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
