/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import { SettingsPanel } from './components/SettingsPanel';
import { PlayerControls } from './components/PlayerControls';
import { SubtitlePanel } from './components/SubtitlePanel';
import { MenuBar } from './components/MenuBar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { AssImportModal } from './components/AssImportModal';
import { ExportModal } from './components/ExportModal';
import { AboutModal, type UpdateCheckResult } from './components/AboutModal';
import { ChatAnnotationBubble, ChatMessageBubble, computeInterruptedMessageRows } from './components/chat/SharedChatBubbles';
import { getBubbleMotionState } from './components/chat/SharedChatBubbles';
import { useAssSubtitle } from './hooks/useAssSubtitle';
import { translate, type Language } from './i18n';
import { createThemeTokens } from './theme';
import { PanelLeftClose, PanelLeftOpen, Settings, X } from 'lucide-react';
import { Tooltip } from './components/ui/Tooltip';
import type { BackgroundSlideItem } from './remotion/types';
import { getTextAssetLayout, getTextAssetSvgMetrics } from './remotion/textAssetLayout';
import './App.css';

const LIGHT_THEME_DEFAULT = '#9ca4b8';
const DARK_THEME_DEFAULT = '#545454';
const SECONDARY_THEME_DEFAULT = '#ed7e96';
const THEME_COLOR_VALUES = ['#545454', '#ed7e96', '#e7d600', '#01b7ee', '#485ec6', '#ff5800', '#a764a1', '#d71c30', '#83c36e', '#9ca4b8', '#36b583', '#aaa898', '#f8c9c4'];
const MESSAGE_FALLBACK_COUNT = 32;
const HISTORY_LIMIT = 80;

type HistorySnapshot = {
  config: any;
  subtitles: any[];
  webAssContent: string | null;
  exportRange: { start: number; end: number };
  exportRangeTouched: boolean;
  exportQuality: 'fast' | 'balance' | 'high';
  exportFormat: 'mp4' | 'mov-alpha' | 'webm-alpha';
  exportLogEnabled: boolean;
  filenameTemplate: 'default' | 'timestamp' | 'unix' | 'custom';
  customFilename: string;
  persistedCustomFilename: string;
};

type SpeakerReplaceDialogState = {
  speakerKey: string;
  replacementKey: string;
  affectedCount: number;
};

type RenderCacheInfo = {
  remoteAssets: { path: string; files: number; bytes: number };
  remotionTemp: { path: string; entries: string[]; files: number; bytes: number };
};

// Web-only local storage key
const STORAGE_KEY = 'pomchat_config';
const DEFAULT_I18N_LANGUAGE: Language = 'en';

type ExportProgressState = {
  progress: number;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  stage: string;
};

const DEFAULT_BUBBLE_STYLE = {
  bgColor: '#2563eb',
  textColor: '#ffffff',
  nameColor: '#ffffff',
  nameStrokeWidth: 0,
  nameStrokeColor: '#000000',
  borderRadius: 28,
  opacity: 0.9,
  borderWidth: 0,
  avatarBorderColor: '#ffffff',
  borderColor: '#ffffff',
  borderOpacity: 1,
  margin: 14,
  paddingX: 20,
  paddingY: 12,
  shadowSize: 1,
  fontFamily: 'system-ui',
  fontSize: 30,
  fontWeight: 'normal',
  trackIndex: 1,
  trackPaddingLeft: 5,
  trackPaddingRight: 5,
};

const DEFAULT_CHAT_LAYOUT = {
  paddingTop: 0,
  paddingBottom: 40,
  paddingX: 48,
  paddingLeft: 48,
  paddingRight: 48,
  bubbleScale: 1.5,
  bubbleMaxWidthPercent: 70,
  avatarSize: 80,
  speakerNameSize: 22,
  timestampFontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  timestampSize: 16,
  timestampColor: '#FFFFFFA6',
  animationStyle: 'rise',
  animationDuration: 0.2,
  maxVisibleBubbles: 15,
  showAvatar: true,
  showSpeakerName: true,
  showTimestamp: true,
  showMeta: true,
  compactMode: false,
  compactSpacing: 14,
  independentTracksEnabled: false,
  trackCount: 1,
};

const DEFAULT_UI_CONFIG = {
  isDarkMode: true,
  themeColor: DARK_THEME_DEFAULT,
  secondaryThemeColor: SECONDARY_THEME_DEFAULT,
  autoSaveProject: false,
  proxy: '',
  settingsPosition: 'right' as 'left' | 'right',
  recentProject: null as string | null,
  recentProjects: [] as string[],
  playbackPositions: {} as Record<string, number>,
  presets: {} as Record<string, any>,
  annotationPresets: {} as Record<string, any>
};

type SubtitleFormat = 'ass' | 'srt' | 'lrc';

const DEFAULT_PROJECT_CONFIG = {
  projectId: 'pomchat-project',
  projectTitle: 'PomChat Project',
  fps: 60,
  dimensions: { width: 1920, height: 1080 },
  chatLayout: { ...DEFAULT_CHAT_LAYOUT },
  background: {
    image: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1920&q=80',
    blur: 8,
    brightness: 1,
    fit: 'contain',
    position: 'center',
    slides: [] as BackgroundSlideItem[]
  },
  audioPath: '',
  assPath: '',
  subtitleFormat: 'ass' as SubtitleFormat,
  exportRange: { start: 0, end: 0 },
  exportRangeCustomized: false,
  exportHardware: 'auto' as 'auto' | 'gpu' | 'cpu',
  exportConcurrency: null as number | null,
  exportFormat: 'mp4' as 'mp4' | 'mov-alpha' | 'webm-alpha',
  exportLogEnabled: false,
  content: [] as any[],
  speakers: {
    A: {
      name: translate(DEFAULT_I18N_LANGUAGE, 'defaults.speakerA'),
      avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=A',
      side: 'left',
      style: {
        ...DEFAULT_BUBBLE_STYLE,
        bgColor: '#2563eb',
        textColor: '#ffffff',
        nameColor: '#ffffff'
      }
    },
    B: {
      name: translate(DEFAULT_I18N_LANGUAGE, 'defaults.speakerB'),
      avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=B',
      side: 'right',
      style: {
        ...DEFAULT_BUBBLE_STYLE,
        bgColor: '#f3f4f6',
        textColor: '#111827',
        nameColor: '#ffffff'
      }
    },
    ANNOTATION: {
      name: translate(DEFAULT_I18N_LANGUAGE, 'defaults.annotationSpeaker'),
      avatar: '',
      side: 'center',
      type: 'annotation',
      style: {
        ...DEFAULT_BUBBLE_STYLE,
        bgColor: '#111827',
        textColor: '#ffffff',
        borderRadius: 28,
        annotationBorderRadius: 28,
        paddingX: 24,
        paddingY: 12,
        maxWidth: 720,
        fontSize: 24,
        annotationPosition: 'bottom',
        annotationAlign: 'center',
        annotationMarginX: 0,
      }
    }
  }
};

const sanitizeImportedAssContent = (content: string) => {
  const lines = content.split(/\r?\n/);
  const sanitizedLines = lines.filter((line) => {
    if (!line.startsWith('Dialogue:')) {
      return true;
    }

    const parts = line.split(',');
    if (parts.length < 10) {
      return true;
    }

    const text = parts.slice(9).join(',').replace(/\\N/g, '\n').trim();
    return text.length > 0;
  });

  return sanitizedLines.join('\n');
};

const sanitizeProjectConfig = (parsed: any) => {
  const parsedExportRange = parsed?.exportRange;
  const legacyPaddingX = parsed?.chatLayout?.paddingX;
  const merged = {
    ...DEFAULT_PROJECT_CONFIG,
    ...parsed,
    exportRange: {
      start: typeof parsedExportRange?.start === 'number' && Number.isFinite(parsedExportRange.start)
        ? parsedExportRange.start
        : DEFAULT_PROJECT_CONFIG.exportRange.start,
      end: typeof parsedExportRange?.end === 'number' && Number.isFinite(parsedExportRange.end)
        ? parsedExportRange.end
        : DEFAULT_PROJECT_CONFIG.exportRange.end,
    },
    exportRangeCustomized: parsed?.exportRangeCustomized === true,
    dimensions: { ...DEFAULT_PROJECT_CONFIG.dimensions, ...(parsed?.dimensions || {}) },
    chatLayout: {
      ...DEFAULT_CHAT_LAYOUT,
      ...DEFAULT_PROJECT_CONFIG.chatLayout,
      ...(parsed?.chatLayout || {}),
      paddingLeft: parsed?.chatLayout?.paddingLeft ?? legacyPaddingX ?? (DEFAULT_PROJECT_CONFIG.chatLayout as any)?.paddingLeft ?? DEFAULT_PROJECT_CONFIG.chatLayout?.paddingX ?? DEFAULT_CHAT_LAYOUT.paddingLeft,
      paddingRight: parsed?.chatLayout?.paddingRight ?? legacyPaddingX ?? (DEFAULT_PROJECT_CONFIG.chatLayout as any)?.paddingRight ?? DEFAULT_PROJECT_CONFIG.chatLayout?.paddingX ?? DEFAULT_CHAT_LAYOUT.paddingRight
    },
    background: {
      ...DEFAULT_PROJECT_CONFIG.background,
      ...(parsed?.background || {}),
      slides: Array.isArray(parsed?.background?.slides)
        ? parsed.background.slides.map((slide: any, index: number) => ({
            id: typeof slide?.id === 'string' && slide.id ? slide.id : `slide-${index + 1}`,
            type: slide?.type === 'text' ? 'text' : 'image',
            name: typeof slide?.name === 'string' ? slide.name : ((slide?.type === 'text' ? translate(DEFAULT_I18N_LANGUAGE, 'defaults.textAssetName', { index: index + 1 }) : translate(DEFAULT_I18N_LANGUAGE, 'defaults.imageAssetName', { index: index + 1 }))),
            image: typeof slide?.image === 'string' ? slide.image : '',
            text: typeof slide?.text === 'string' ? slide.text : translate(DEFAULT_I18N_LANGUAGE, 'project.defaultTextAssetContent'),
            start: typeof slide?.start === 'number' && Number.isFinite(slide.start) ? slide.start : 0,
            end: typeof slide?.end === 'number' && Number.isFinite(slide.end) ? slide.end : 3,
            fit: slide?.fit === 'contain' || slide?.fit === 'fill' ? slide.fit : 'cover',
            position: typeof slide?.position === 'string' ? slide.position : 'center',
            scale: typeof slide?.scale === 'number' && Number.isFinite(slide.scale) ? slide.scale : 1,
            offsetX: typeof slide?.offsetX === 'number' && Number.isFinite(slide.offsetX) ? slide.offsetX : 0,
            offsetY: typeof slide?.offsetY === 'number' && Number.isFinite(slide.offsetY) ? slide.offsetY : 0,
            rotation: typeof slide?.rotation === 'number' && Number.isFinite(slide.rotation) ? slide.rotation : 0,
            backgroundOrder: typeof slide?.backgroundOrder === 'number' && Number.isFinite(slide.backgroundOrder) ? slide.backgroundOrder : index,
            overlayOrder: typeof slide?.overlayOrder === 'number' && Number.isFinite(slide.overlayOrder) ? slide.overlayOrder : index,
            layer: slide?.layer === 'overlay' ? 'overlay' : 'background',
            inheritBackgroundFilters: slide?.inheritBackgroundFilters !== false,
            animationStyle: ['none', 'fade', 'rise', 'pop', 'slide', 'blur'].includes(slide?.animationStyle) ? slide.animationStyle : 'fade',
            animationDuration: typeof slide?.animationDuration === 'number' && Number.isFinite(slide.animationDuration) ? slide.animationDuration : 0.24,
            opacity: typeof slide?.opacity === 'number' && Number.isFinite(slide.opacity) ? slide.opacity : 1,
            imageBorderColor: typeof slide?.imageBorderColor === 'string' ? slide.imageBorderColor : '#FFFFFF',
            imageBorderWidth: typeof slide?.imageBorderWidth === 'number' && Number.isFinite(slide.imageBorderWidth) ? slide.imageBorderWidth : 0,
            imageShadowColor: typeof slide?.imageShadowColor === 'string' ? slide.imageShadowColor : '#00000066',
            imageShadowSize: typeof slide?.imageShadowSize === 'number' && Number.isFinite(slide.imageShadowSize) ? slide.imageShadowSize : 0,
            textColor: typeof slide?.textColor === 'string' ? slide.textColor : '#FFFFFF',
            textStrokeColor: typeof slide?.textStrokeColor === 'string' ? slide.textStrokeColor : '#000000',
            textStrokeWidth: typeof slide?.textStrokeWidth === 'number' && Number.isFinite(slide.textStrokeWidth) ? slide.textStrokeWidth : 0,
            textShadowColor: typeof slide?.textShadowColor === 'string' ? slide.textShadowColor : '#00000088',
            textShadowSize: typeof slide?.textShadowSize === 'number' && Number.isFinite(slide.textShadowSize) ? slide.textShadowSize : 0,
            fontFamily: typeof slide?.fontFamily === 'string' ? slide.fontFamily : 'system-ui',
            fontSize: typeof slide?.fontSize === 'number' && Number.isFinite(slide.fontSize) ? slide.fontSize : 96,
            fontWeight: typeof slide?.fontWeight === 'string' ? slide.fontWeight : '700',
          }))
        : []
    },
    speakers: Object.fromEntries(
      Object.entries({ ...DEFAULT_PROJECT_CONFIG.speakers, ...(parsed?.speakers || {}) }).map(([speakerId, speaker]: [string, any]) => [
        speakerId,
        {
          ...speaker,
          style: {
            ...DEFAULT_BUBBLE_STYLE,
            ...(speaker?.style || {})
          }
        }
      ])
    ),
    ui: {
      ...DEFAULT_UI_CONFIG,
      ...(parsed?.ui || {}),
      themeColor: typeof parsed?.ui?.themeColor === 'string' && THEME_COLOR_VALUES.includes(parsed.ui.themeColor)
        ? parsed.ui.themeColor
        : DEFAULT_UI_CONFIG.themeColor,
      secondaryThemeColor: typeof parsed?.ui?.secondaryThemeColor === 'string' && THEME_COLOR_VALUES.includes(parsed.ui.secondaryThemeColor)
        ? parsed.ui.secondaryThemeColor
        : DEFAULT_UI_CONFIG.secondaryThemeColor,
      autoSaveProject: parsed?.ui?.autoSaveProject === true,
      proxy: typeof parsed?.ui?.proxy === 'string' ? parsed.ui.proxy : '',
      settingsPosition: parsed?.ui?.settingsPosition === 'left' ? 'left' : 'right',
      recentProject: typeof parsed?.ui?.recentProject === 'string' ? parsed.ui.recentProject : null,
      recentProjects: Array.isArray(parsed?.ui?.recentProjects) ? parsed.ui.recentProjects.filter((item: unknown) => typeof item === 'string').slice(0, 10) : [],
      playbackPositions: parsed?.ui?.playbackPositions && typeof parsed.ui.playbackPositions === 'object' ? parsed.ui.playbackPositions : {},
      presets: parsed?.ui?.presets && typeof parsed.ui.presets === 'object' ? parsed.ui.presets : {},
      annotationPresets: parsed?.ui?.annotationPresets && typeof parsed.ui.annotationPresets === 'object' ? parsed.ui.annotationPresets : {}
    }
  };

  return merged;
};

const createBlankProjectConfig = (projectTitle: string) => ({
  ...DEFAULT_PROJECT_CONFIG,
  fps: 30,
  projectId: `project-${Date.now()}`,
  projectTitle,
  audioPath: '',
  assPath: '',
  subtitleFormat: 'ass' as SubtitleFormat,
  content: [],
  speakers: {
    A: {
      name: translate(DEFAULT_I18N_LANGUAGE, 'defaults.speakerGeneric'),
      avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=A',
      side: 'left',
      style: { ...DEFAULT_BUBBLE_STYLE }
    },
    ANNOTATION: {
      name: translate(DEFAULT_I18N_LANGUAGE, 'defaults.annotationSpeaker'),
      avatar: '',
      side: 'center',
      type: 'annotation',
      style: {
        ...DEFAULT_BUBBLE_STYLE,
        bgColor: '#111827',
        textColor: '#ffffff',
        borderRadius: 28,
        annotationBorderRadius: 28,
        paddingX: 24,
        paddingY: 12,
        maxWidth: 720,
        fontSize: 24,
        annotationPosition: 'bottom',
        annotationAlign: 'center',
        annotationMarginX: 0,
      }
    }
  },
  ui: { ...DEFAULT_UI_CONFIG }
});

const sanitizeProjectOverrides = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const candidate = value as Record<string, unknown>;
  const overrides: Record<string, unknown> = {};

  if (typeof candidate.audioPath === 'string') {
    overrides.audioPath = candidate.audioPath;
  }

  if (typeof candidate.assPath === 'string') {
    overrides.assPath = candidate.assPath;
  }

  if (candidate.subtitleFormat === 'ass' || candidate.subtitleFormat === 'srt' || candidate.subtitleFormat === 'lrc') {
    overrides.subtitleFormat = candidate.subtitleFormat;
  }

  if (Array.isArray(candidate.content)) {
    overrides.content = candidate.content;
  }

  if (candidate.speakers && typeof candidate.speakers === 'object' && !Array.isArray(candidate.speakers)) {
    overrides.speakers = candidate.speakers;
  }

  return overrides;
};

function PreviewBackgroundAsset({
  src,
  blur,
  brightness,
  canvasWidth,
  canvasHeight,
  scale = 1,
  offsetX = 0,
  offsetY = 0,
  rotation = 0,
  intrinsicWidth,
  intrinsicHeight,
  animationStyle = 'none',
  animationDuration = 0.2,
  opacity = 1,
  imageBorderColor = '#FFFFFF',
  imageBorderWidth = 0,
  imageShadowColor = '#00000066',
  imageShadowSize = 0,
  currentTime,
  start = 0,
  end,
  draggable = false,
  onPointerDown,
  onDoubleClick,
  editOverlay,
  onEditBoxChange,
  onNaturalSizeChange,
}: {
  src?: string;
  blur: number;
  brightness: number;
  canvasWidth: number;
  canvasHeight: number;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  rotation?: number;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
  animationStyle?: 'none' | 'fade' | 'rise' | 'pop' | 'slide' | 'blur';
  animationDuration?: number;
  opacity?: number;
  imageBorderColor?: string;
  imageBorderWidth?: number;
  imageShadowColor?: string;
  imageShadowSize?: number;
  currentTime: number;
  start?: number;
  end?: number;
  draggable?: boolean;
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onDoubleClick?: () => void;
  editOverlay?: React.ReactNode;
  onEditBoxChange?: (box: { centerX: number; centerY: number; width: number; height: number }) => void;
  onNaturalSizeChange?: (size: { width: number; height: number }) => void;
}) {
  // Track container size and natural image size to compute contain-fit overlay rect
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(intrinsicWidth && intrinsicHeight ? { w: intrinsicWidth, h: intrinsicHeight } : null);
  useEffect(() => {
    if (intrinsicWidth && intrinsicHeight) {
      setNaturalSize((prev) => prev?.w === intrinsicWidth && prev?.h === intrinsicHeight ? prev : { w: intrinsicWidth, h: intrinsicHeight });
      return;
    }
    setNaturalSize(null);
  }, [intrinsicHeight, intrinsicWidth, src]);

  const appearanceTime = Math.max(0, start - (animationStyle === 'none' ? 0 : animationDuration));
  const progress = animationStyle === 'none' || animationDuration <= 0
    ? 1
    : Math.max(0, Math.min(1, (currentTime - appearanceTime) / animationDuration));
  const disappearProgress = typeof end === 'number' && currentTime > end && animationStyle !== 'none' && animationDuration > 0
    ? Math.max(0, Math.min(1, 1 - ((currentTime - end) / animationDuration)))
    : 1;
  const motionState = getBubbleMotionState(progress * disappearProgress, animationStyle, 'left');
  // Transform applied to the asset (and matched by the edit overlay so controls track the image).
  // transformOrigin is always 50% 50% so rotate/scale behaves like PS Free Transform (center-based).
  const assetTransform = `translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg) scale(${scale}) ${motionState.transform || ''}`.trim();
  const assetStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'fill',
    filter: `blur(${blur}px) brightness(${brightness})`,
    transform: assetTransform,
    transformOrigin: '50% 50%',
    opacity: opacity * motionState.opacity,
    boxShadow: [
      imageBorderWidth > 0 ? `inset 0 0 0 ${imageBorderWidth}px ${imageBorderColor}` : null,
      imageShadowSize > 0 ? `0 0 ${imageShadowSize}px ${imageShadowColor}` : null,
    ].filter(Boolean).join(', ') || undefined,
  };

  const effectiveNaturalSize = intrinsicWidth && intrinsicHeight
    ? { w: intrinsicWidth, h: intrinsicHeight }
    : naturalSize;

  let overlayRect: React.CSSProperties = { inset: 0 };
  if (effectiveNaturalSize && effectiveNaturalSize.w > 0 && effectiveNaturalSize.h > 0) {
    const left = (canvasWidth - effectiveNaturalSize.w) / 2;
    const top = (canvasHeight - effectiveNaturalSize.h) / 2;
    overlayRect = { left, top, width: effectiveNaturalSize.w, height: effectiveNaturalSize.h };
  }

  const overlayWidth = 'width' in overlayRect && typeof overlayRect.width === 'number' ? overlayRect.width : canvasWidth;
  const overlayHeight = 'height' in overlayRect && typeof overlayRect.height === 'number' ? overlayRect.height : canvasHeight;
  const overlayLeft = 'left' in overlayRect && typeof overlayRect.left === 'number' ? overlayRect.left : 0;
  const overlayTop = 'top' in overlayRect && typeof overlayRect.top === 'number' ? overlayRect.top : 0;

  useEffect(() => {
    if (!onEditBoxChange) return;
    if (!src) return;
    if (overlayWidth <= 1 || overlayHeight <= 1) return;
    onEditBoxChange({
      centerX: overlayLeft + overlayWidth / 2 + offsetX,
      centerY: overlayTop + overlayHeight / 2 + offsetY,
      width: overlayWidth * scale,
      height: overlayHeight * scale,
    });
  }, [offsetX, offsetY, onEditBoxChange, overlayHeight, overlayLeft, overlayTop, overlayWidth, scale, src]);
  useEffect(() => {
    if (!onNaturalSizeChange || !effectiveNaturalSize) return;
    onNaturalSizeChange({ width: effectiveNaturalSize.w, height: effectiveNaturalSize.h });
  }, [effectiveNaturalSize, onNaturalSizeChange]);

  // The edit overlay shares the same transform so controls naturally stick to the image
  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    ...overlayRect,
    transform: assetTransform,
    transformOrigin: '50% 50%',
    pointerEvents: 'none',
  };
  const interactionStyle: React.CSSProperties = {
    position: 'absolute',
    ...overlayRect,
    transform: assetTransform,
    transformOrigin: '50% 50%',
    pointerEvents: onPointerDown || onDoubleClick ? 'auto' : 'none',
    cursor: draggable ? 'grab' : undefined,
    touchAction: draggable ? 'none' : undefined,
  };

  const isVideo = /\.(mp4|webm|mov|mkv)(\?|$)/i.test(src || '');
  const media = isVideo
    ? <video src={src} muted loop playsInline className="w-full h-full" style={{ ...assetStyle, pointerEvents: 'none' }} onLoadedMetadata={(e) => setNaturalSize({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })} />
    : (
      <img
        src={src}
        alt="Background asset"
        draggable={false}
        referrerPolicy="no-referrer"
        className="w-full h-full select-none"
        style={{ ...assetStyle, pointerEvents: 'none' }}
        onLoad={(e) => {
          const img = e.currentTarget;
          setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
        }}
      />
    );

  if (!src) {
    return null;
  }

  if (!effectiveNaturalSize || overlayWidth <= 1 || overlayHeight <= 1) {
    return (
      <div className="w-full h-full relative" style={{ pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none' }}>
          {media}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative" style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', ...overlayRect }}>
        {media}
      </div>
      {(onPointerDown || onDoubleClick) && <div onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} style={interactionStyle} />}
      {editOverlay && <div style={overlayStyle}>{editOverlay}</div>}
    </div>
  );
}

function PreviewTextAsset({
  slide,
  currentTime,
  onDoubleClick,
  onPointerDown,
  editOverlay,
  onEditBoxChange,
  canvasWidth,
  canvasHeight,
  blur = 0,
  brightness = 1,
}: {
  slide: BackgroundSlideItem;
  currentTime: number;
  onDoubleClick?: () => void;
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
  editOverlay?: React.ReactNode;
  onEditBoxChange?: (box: { centerX: number; centerY: number; width: number; height: number }) => void;
  canvasWidth: number;
  canvasHeight: number;
  blur?: number;
  brightness?: number;
}) {
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
  const textGroupRef = useRef<SVGGElement | null>(null);
  const [textBox, setTextBox] = useState<{ width: number; height: number } | null>(null);
  const transform = `translate(-50%, -50%) translate(${slide.offsetX ?? 0}px, ${slide.offsetY ?? 0}px) rotate(${slide.rotation ?? 0}deg) scale(${slide.scale ?? 1}) ${motionState.transform || ''}`.trim();
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform,
    transformOrigin: '50% 50%',
    opacity: (slide.opacity ?? 1) * motionState.opacity,
  };

  useLayoutEffect(() => {
    const group = textGroupRef.current;
    if (!group) return;
    try {
      const bbox = group.getBBox();
      const padding = strokeWidth + 4;
      const nextBox = {
        width: Math.max(1, bbox.width + padding * 2),
        height: Math.max(1, bbox.height + padding * 2),
      };
      setTextBox((prev) => (
        prev && prev.width === nextBox.width && prev.height === nextBox.height
          ? prev
          : nextBox
      ));
    } catch {
      setTextBox((prev) => prev ?? { width: estimatedWidth, height: estimatedHeight });
    }
  }, [estimatedHeight, estimatedWidth, fontSize, slide.fontFamily, slide.fontWeight, slide.text, strokeWidth]);

  const measuredWidth = textBox?.width ?? estimatedWidth;
  const measuredHeight = textBox?.height ?? estimatedHeight;
  const { textAnchorX, getLineY } = getTextAssetSvgMetrics({ width: estimatedWidth, height: estimatedHeight, fontSize, lineCount: textLines.length });

  useEffect(() => {
    if (!onEditBoxChange) return;
    onEditBoxChange({
      centerX: canvasWidth / 2 + (slide.offsetX ?? 0),
      centerY: canvasHeight / 2 + (slide.offsetY ?? 0),
      width: measuredWidth * (slide.scale ?? 1),
      height: measuredHeight * (slide.scale ?? 1),
    });
  }, [canvasHeight, canvasWidth, measuredHeight, measuredWidth, onEditBoxChange, slide.offsetX, slide.offsetY, slide.scale]);

  return (
    <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
      <div
        onDoubleClick={onDoubleClick}
        onPointerDown={onPointerDown}
        style={{
          ...baseStyle,
          width: `${measuredWidth}px`,
          height: `${measuredHeight}px`,
          filter: `blur(${blur}px) brightness(${brightness})`,
          pointerEvents: onDoubleClick || onPointerDown ? 'auto' : 'none',
          cursor: onPointerDown ? 'grab' : undefined,
          touchAction: onPointerDown ? 'none' : undefined,
          position: 'absolute',
        }}
      >
        <svg
          width={estimatedWidth}
          height={estimatedHeight}
          overflow="visible"
          style={{
            display: 'block',
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <g ref={textGroupRef}>
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
                stroke={slide.textStrokeWidth ? (slide.textStrokeColor || '#000000') : 'none'}
                strokeWidth={slide.textStrokeWidth ?? 0}
                paintOrder="stroke"
                filter={(slide.textShadowSize ?? 0) > 0 ? `drop-shadow(0 0 ${slide.textShadowSize ?? 0}px ${slide.textShadowColor || '#00000088'})` : undefined}
              >
                {line || ' '}
              </text>
            ))}
          </g>
        </svg>
      </div>
      {editOverlay ? <div style={{ ...baseStyle, pointerEvents: 'none' }}>{editOverlay}</div> : null}
    </div>
  );
}

function getPreviewSlideBounds(slide: BackgroundSlideItem, canvasWidth: number, canvasHeight: number) {
  if (slide.type === 'text') {
    const fontSize = slide.fontSize ?? 96;
    const text = slide.text || '';
    const longestLine = text.split('\n').reduce((max, line) => Math.max(max, line.length), 1);
    const lineCount = Math.max(1, text.split('\n').length);
    const width = Math.max(120, longestLine * fontSize * 0.62 + (slide.textStrokeWidth ?? 0) * 4 + 16) * (slide.scale ?? 1);
    const height = Math.max(fontSize * 1.4, lineCount * fontSize * 1.15 + (slide.textStrokeWidth ?? 0) * 4 + 16) * (slide.scale ?? 1);
    return {
      left: canvasWidth / 2 + (slide.offsetX ?? 0) - width / 2,
      top: canvasHeight / 2 + (slide.offsetY ?? 0) - height / 2,
      width,
      height,
    };
  }

  if (slide.intrinsicWidth && slide.intrinsicHeight) {
    const scale = slide.scale ?? 1;
    const width = slide.intrinsicWidth * scale;
    const height = slide.intrinsicHeight * scale;
    return {
      left: canvasWidth / 2 + (slide.offsetX ?? 0) - width / 2,
      top: canvasHeight / 2 + (slide.offsetY ?? 0) - height / 2,
      width,
      height,
    };
  }

  const fit = slide.fit === 'contain' || slide.fit === 'fill' ? slide.fit : 'cover';
  const scale = slide.scale ?? 1;
  if (fit === 'contain') {
    const base = Math.min(canvasWidth, canvasHeight) * 0.72;
    const width = base * scale;
    const height = base * scale;
    return {
      left: canvasWidth / 2 + (slide.offsetX ?? 0) - width / 2,
      top: canvasHeight / 2 + (slide.offsetY ?? 0) - height / 2,
      width,
      height,
    };
  }

  return {
    left: canvasWidth / 2 + (slide.offsetX ?? 0) - (canvasWidth * scale) / 2,
    top: canvasHeight / 2 + (slide.offsetY ?? 0) - (canvasHeight * scale) / 2,
    width: canvasWidth * scale,
    height: canvasHeight * scale,
  };
}

function App() {
  const getSpeakerNameSnapshot = (speakers: Record<string, any>) =>
    Object.fromEntries(Object.entries(speakers || {}).map(([key, speaker]) => [key, speaker?.name || '']));
  const getSystemPrefersDark = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return true;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  };

  const isDesktopMode = typeof window !== 'undefined' && Boolean(window.electron);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [recentProject, setRecentProject] = useState<string | null>(() => isDesktopMode ? null : localStorage.getItem(STORAGE_KEY + '_recent_project'));

  // Load initial from localStorage if available
  const [config, setConfig] = useState(() => {
    if (!isDesktopMode) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return sanitizeProjectConfig(parsed);
        } catch {
          return sanitizeProjectConfig(DEFAULT_PROJECT_CONFIG);
        }
      }
    }
    return sanitizeProjectConfig(DEFAULT_PROJECT_CONFIG);
  });

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  
  const [isDarkMode, setIsDarkMode] = useState(() => getSystemPrefersDark());
  const [themeColorState, setThemeColorState] = useState(() => config.ui?.themeColor ?? DEFAULT_UI_CONFIG.themeColor);
  const [secondaryThemeColorState, setSecondaryThemeColorState] = useState(() => config.ui?.secondaryThemeColor ?? DEFAULT_UI_CONFIG.secondaryThemeColor);
  const [autoSaveProject, setAutoSaveProject] = useState(() => config.ui?.autoSaveProject ?? DEFAULT_UI_CONFIG.autoSaveProject);
  const [proxyState, setProxyState] = useState(() => config.ui?.proxy ?? DEFAULT_UI_CONFIG.proxy);
  const [showSettings, setShowSettings] = useState(false);
  const [showSubtitlePanel, setShowSubtitlePanel] = useState(true);
  
  const [settingsPosition, setSettingsPosition] = useState<'left'|'right'>(() => config.ui?.settingsPosition ?? DEFAULT_UI_CONFIG.settingsPosition);

  // Panel Widths
  const [subtitleWidth, setSubtitleWidth] = useState(320);
  const [settingsWidth, setSettingsWidth] = useState(400);
  const [activeTab, setActiveTab] = useState<'subtitle' | 'global' | 'project' | 'speakers' | 'annotation'>(
    !window.electron && window.innerWidth < 700 ? 'subtitle' : 'speakers'
  );
  const [isMobileBottomPanelCollapsed, setIsMobileBottomPanelCollapsed] = useState(false);
  const [isMobileBottomPanelExpanded, setIsMobileBottomPanelExpanded] = useState(false);
  const [mobileBottomPanelHeight, setMobileBottomPanelHeight] = useState(340);
  const [isMobileBottomResizeActive, setIsMobileBottomResizeActive] = useState(false);
  const [editingSub, setEditingSub] = useState<{ id: string, start: number, end: number, text: string } | null>(null);
  const [importAssData, setImportAssData] = useState<{ path: string, content: string } | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [quickSavePath, setQuickSavePath] = useState('');
  const [exportOutputPath, setExportOutputPath] = useState('');
  const [exportRange, setExportRange] = useState({ start: 0, end: 0 });
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgressState | null>(null);
  const [exportStatusMessage, setExportStatusMessage] = useState<string | null>(null);
  const [lastExportOutputPath, setLastExportOutputPath] = useState('');
  const [lastExportSucceeded, setLastExportSucceeded] = useState(false);
  const [activeInsertImageId, setActiveInsertImageId] = useState<string | null>(null);
  const [isInsertImageEditMode, setIsInsertImageEditMode] = useState(false);
  const [focusInsertImageSettingsKey, setFocusInsertImageSettingsKey] = useState(0);
  const insertImageDragRef = useRef<{ id: string; mode: 'move' | 'scale' | 'rotate'; startX: number; startY: number; initialOffsetX: number; initialOffsetY: number; initialScale: number; initialRotation: number; initialDistance?: number; initialAngle?: number } | null>(null);
  const [slideEditBoxes, setSlideEditBoxes] = useState<Record<string, { centerX: number; centerY: number; width: number; height: number }>>({});
  const [renderCacheInfo, setRenderCacheInfo] = useState<RenderCacheInfo | null>(null);
  const [exportQuality, setExportQuality] = useState<'fast' | 'balance' | 'high'>('balance');
  const [exportHardware, setExportHardware] = useState<'auto' | 'gpu' | 'cpu'>('auto');
  const [exportFormat, setExportFormat] = useState<'mp4' | 'mov-alpha' | 'webm-alpha'>('mp4');
  const [exportLogEnabled, setExportLogEnabled] = useState(false);
  const [filenameTemplate, setFilenameTemplate] = useState<'default' | 'timestamp' | 'unix' | 'custom'>('default');
  const [customFilename, setCustomFilename] = useState('');
  const [persistedCustomFilename, setPersistedCustomFilename] = useState('');
  const [cachedRemoteAssets, setCachedRemoteAssets] = useState<Record<string, string>>({});
  const [presets, setPresets] = useState<Record<string, any>>(() => config.ui?.presets ?? DEFAULT_UI_CONFIG.presets);
  const [annotationPresets, setAnnotationPresets] = useState<Record<string, any>>(() => config.ui?.annotationPresets ?? DEFAULT_UI_CONFIG.annotationPresets);
  const [webAudioObjectUrl, setWebAudioObjectUrl] = useState('');
  const [webAssContent, setWebAssContent] = useState<string | null>(null);
  const webPresetInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [seekTick, setSeekTick] = useState(0);
  const portraitAutoCollapseRef = useRef<{ subtitle: boolean; settings: boolean } | null>(null);
  const savedSpeakerNamesRef = useRef<Record<string, string>>(getSpeakerNameSnapshot(config.speakers));
  const exportRangeTouchedRef = useRef(false);
  const lastPlaybackPersistAtRef = useRef(0);
  const lastUiFrameAtRef = useRef(0);
  const historyPastRef = useRef<HistorySnapshot[]>([]);
  const historyFutureRef = useRef<HistorySnapshot[]>([]);
  const isRestoringHistoryRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isProjectDirty, setIsProjectDirty] = useState(false);
  const [projectChangeTick, setProjectChangeTick] = useState(0);
  const [speakerReplaceDialog, setSpeakerReplaceDialog] = useState<SpeakerReplaceDialogState | null>(null);
  const exportProgressActiveRef = useRef(false);
  const hasHydratedElectronConfigRef = useRef(!isDesktopMode);
  const lastUiSyncSnapshotRef = useRef('');
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const webAudioInputRef = useRef<HTMLInputElement>(null);
  const webSubtitleInputRef = useRef<HTMLInputElement>(null);
  const webProjectInputRef = useRef<HTMLInputElement>(null);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const previewBackgroundVideoRef = useRef<HTMLVideoElement>(null);
  const subtitleFormat = (config.subtitleFormat || 'ass') as SubtitleFormat;
  const { subtitles, setSubtitles, loading: subtitlesLoading } = useAssSubtitle(config.assPath, config.speakers, webAssContent, config.content, subtitleFormat);
  const latestSubtitleEnd = useMemo(() => subtitles.reduce((max, item) => Math.max(max, item.end || 0), 0), [subtitles]);
  const previewTimelineDuration = useMemo(
    () => Math.max(0, duration || 0, latestSubtitleEnd || 0, exportRange.end || 0),
    [duration, latestSubtitleEnd, exportRange.end]
  );
  const hasAudioSource = Boolean(webAudioObjectUrl || config.audioPath);
  const cloneHistorySnapshot = useCallback((snapshot: HistorySnapshot): HistorySnapshot => JSON.parse(JSON.stringify(snapshot)), []);
  const createHistorySnapshot = useCallback((): HistorySnapshot => ({
    config: JSON.parse(JSON.stringify(config)),
    subtitles: JSON.parse(JSON.stringify(subtitles)),
    webAssContent,
    exportRange: JSON.parse(JSON.stringify(exportRange)),
    exportRangeTouched: exportRangeTouchedRef.current,
    exportQuality,
    exportFormat,
    exportLogEnabled,
    filenameTemplate,
    customFilename,
    persistedCustomFilename,
  }), [config, subtitles, webAssContent, exportRange, exportQuality, exportFormat, exportLogEnabled, filenameTemplate, customFilename, persistedCustomFilename]);
  const syncHistoryAvailability = useCallback(() => {
    setCanUndo(historyPastRef.current.length > 0);
    setCanRedo(historyFutureRef.current.length > 0);
  }, []);
  const markProjectDirty = useCallback(() => {
    setIsProjectDirty(true);
    setProjectChangeTick((prev) => prev + 1);
  }, []);
  const clearProjectDirty = useCallback(() => {
    setIsProjectDirty(false);
  }, []);
  const clearHistory = useCallback(() => {
    historyPastRef.current = [];
    historyFutureRef.current = [];
    syncHistoryAvailability();
  }, [syncHistoryAvailability]);
  const pushHistorySnapshot = useCallback(() => {
    if (isRestoringHistoryRef.current) {
      return;
    }

    historyPastRef.current.push(createHistorySnapshot());
    if (historyPastRef.current.length > HISTORY_LIMIT) {
      historyPastRef.current.shift();
    }
    historyFutureRef.current = [];
    syncHistoryAvailability();
  }, [createHistorySnapshot, syncHistoryAvailability]);
  const restoreHistorySnapshot = useCallback((snapshot: HistorySnapshot) => {
    isRestoringHistoryRef.current = true;
    setConfig(sanitizeProjectConfig(snapshot.config));
    setWebAssContent(snapshot.webAssContent);
    setSubtitles(JSON.parse(JSON.stringify(snapshot.subtitles)));
    exportRangeTouchedRef.current = snapshot.exportRangeTouched;
    setExportRange(snapshot.exportRange);
    setExportQuality(snapshot.exportQuality);
    setExportFormat(snapshot.exportFormat);
    setExportLogEnabled(snapshot.exportLogEnabled);
    setFilenameTemplate(snapshot.filenameTemplate);
    setCustomFilename(snapshot.customFilename);
    setPersistedCustomFilename(snapshot.persistedCustomFilename);
    setEditingSub(null);
    markProjectDirty();
    window.setTimeout(() => {
      isRestoringHistoryRef.current = false;
    }, 0);
  }, [markProjectDirty, setSubtitles]);
  const applyTrackedConfigChange = useCallback((nextConfig: any) => {
    pushHistorySnapshot();
    setConfig(nextConfig);
    markProjectDirty();
  }, [markProjectDirty, pushHistorySnapshot]);
  const applyTrackedConfigUpdater = useCallback((updater: (prev: any) => any) => {
    pushHistorySnapshot();
    setConfig((prev: any) => updater(prev));
    markProjectDirty();
  }, [markProjectDirty, pushHistorySnapshot]);
  const undoProjectChange = useCallback(() => {
    const previousSnapshot = historyPastRef.current.pop();
    if (!previousSnapshot) {
      syncHistoryAvailability();
      return;
    }

    historyFutureRef.current.unshift(createHistorySnapshot());
    restoreHistorySnapshot(cloneHistorySnapshot(previousSnapshot));
    syncHistoryAvailability();
  }, [cloneHistorySnapshot, createHistorySnapshot, restoreHistorySnapshot, syncHistoryAvailability]);
  const redoProjectChange = useCallback(() => {
    const nextSnapshot = historyFutureRef.current.shift();
    if (!nextSnapshot) {
      syncHistoryAvailability();
      return;
    }

    historyPastRef.current.push(createHistorySnapshot());
    restoreHistorySnapshot(cloneHistorySnapshot(nextSnapshot));
    syncHistoryAvailability();
  }, [cloneHistorySnapshot, createHistorySnapshot, restoreHistorySnapshot, syncHistoryAvailability]);
  const activePlaybackSubtitle = useMemo(
    () => subtitles.find((sub) => currentTime >= sub.start && currentTime <= sub.end) ?? null,
    [subtitles, currentTime]
  );
  const nearestSubtitleIndex = useMemo(() => {
    if (subtitles.length === 0) return -1;
    const activeIndex = subtitles.findIndex((sub) => currentTime >= sub.start && currentTime <= sub.end);
    if (activeIndex >= 0) return activeIndex;

    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    subtitles.forEach((sub, index) => {
      const distance = currentTime < sub.start
        ? sub.start - currentTime
        : currentTime > sub.end
          ? currentTime - sub.end
          : 0;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  }, [subtitles, currentTime]);
  const nearbySubtitles = useMemo(() => {
    if (nearestSubtitleIndex < 0) return [];
    const start = Math.max(0, nearestSubtitleIndex - 2);
    const end = Math.min(subtitles.length, nearestSubtitleIndex + 3);
    return subtitles.slice(start, end);
  }, [subtitles, nearestSubtitleIndex]);
  const canvasWidth = config.dimensions?.width || 1920;
  const canvasHeight = config.dimensions?.height || 1080;
  
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const isPortraitCanvas = canvasHeight > canvasWidth;
  const shouldHideSidePanels = windowWidth < 700;
  const isMobileWebLayout = !window.electron && shouldHideSidePanels;
  const aspectRatio = `${canvasWidth} / ${canvasHeight}`;
  const aspectLabel = `${canvasWidth}:${canvasHeight}`;
const [previewScale, setPreviewScale] = useState(1);

  useLayoutEffect(() => {
    const areaEl = previewAreaRef.current;
    if (!areaEl) return;

    const updateScale = () => {
      const styles = window.getComputedStyle(areaEl);
      const horizontalPadding = parseFloat(styles.paddingLeft || '0') + parseFloat(styles.paddingRight || '0');
      const verticalPadding = parseFloat(styles.paddingTop || '0') + parseFloat(styles.paddingBottom || '0');
      const availableWidth = areaEl.clientWidth - horizontalPadding;
      const availableHeight = areaEl.clientHeight - verticalPadding;

      if (!availableWidth || !availableHeight) {
        return;
      }
      const widthRatio = availableWidth / canvasWidth;
      const heightRatio = availableHeight / canvasHeight;
      const nextScale = Math.min(widthRatio, heightRatio);
      const safeScale = Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1;
      setPreviewScale(safeScale);
    };

    updateScale();
    const rafId = window.requestAnimationFrame(updateScale);
    const timeoutId = window.setTimeout(updateScale, 80);
    const timeoutId2 = window.setTimeout(updateScale, 220);
    const timeoutId3 = window.setTimeout(updateScale, 420);
    const observer = new ResizeObserver(updateScale);
    observer.observe(areaEl);
    window.addEventListener('resize', updateScale);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      window.clearTimeout(timeoutId2);
      window.clearTimeout(timeoutId3);
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [canvasWidth, canvasHeight, showSubtitlePanel, showSettings, subtitleWidth, settingsWidth, shouldHideSidePanels, isMobileWebLayout, isMobileBottomPanelExpanded, mobileBottomPanelHeight, isMobileBottomPanelCollapsed]);

  useLayoutEffect(() => {
    const forceScale = () => {
      const areaEl = previewAreaRef.current;
      if (!areaEl) return;
      const styles = window.getComputedStyle(areaEl);
      const horizontalPadding = parseFloat(styles.paddingLeft || '0') + parseFloat(styles.paddingRight || '0');
      const verticalPadding = parseFloat(styles.paddingTop || '0') + parseFloat(styles.paddingBottom || '0');
      const availableWidth = areaEl.clientWidth - horizontalPadding;
      const availableHeight = areaEl.clientHeight - verticalPadding;
      if (!availableWidth || !availableHeight) return;
      const nextScale = Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight);
      const safeScale = Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1;
      setPreviewScale(safeScale);
    };

    const t1 = window.setTimeout(forceScale, 50);
    const t2 = window.setTimeout(forceScale, 180);
    const t3 = window.setTimeout(forceScale, 420);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [projectPath, config.projectId, config.dimensions?.width, config.dimensions?.height, subtitles.length, isMobileBottomPanelExpanded, mobileBottomPanelHeight, isMobileBottomPanelCollapsed]);

  const normalizeSubtitleSpeakerFields = (subtitle: any) => {
    const speaker = config.speakers?.[subtitle.speakerId];
    if (!speaker) {
      return subtitle;
    }

    return {
      ...subtitle,
      actor: speaker.name || subtitle.actor,
      style: speaker.name || subtitle.style || 'Default'
    };
  };


  const parseTimeToSeconds = (timeText: string) => {
    const normalized = timeText.replace(',', '.').trim();
    const parts = normalized.split(':').map((part) => part.trim());
    if (parts.length === 0 || parts.length > 3) return null;

    const numeric = parts.map((part) => Number(part));
    if (numeric.some((value) => !Number.isFinite(value) || value < 0)) return null;

    if (numeric.length === 1) {
      return numeric[0];
    }
    if (numeric.length === 2) {
      return numeric[0] * 60 + numeric[1];
    }
    return numeric[0] * 3600 + numeric[1] * 60 + numeric[2];
  };

  const parseSrtSubtitles = (content: string) => {
    const blocks = content.replace(/\r/g, '').split('\n\n').map((block) => block.trim()).filter(Boolean);
    const items: Array<{ start: number; end: number; text: string }> = [];

    blocks.forEach((block) => {
      const lines = block.split('\n').map((line) => line.trimEnd());
      const timingLine = lines.find((line) => line.includes('-->'));
      if (!timingLine) return;

      const [startRaw, endRaw] = timingLine.split('-->').map((value) => value.trim());
      const start = parseTimeToSeconds(startRaw);
      const end = parseTimeToSeconds(endRaw);
      if (start === null || end === null || end <= start) return;

      const textStartIndex = lines.indexOf(timingLine) + 1;
      const text = lines.slice(textStartIndex).join('\n').trim();
      if (!text) return;

      items.push({ start, end, text });
    });

    return items;
  };

  const parseLrcSubtitles = (content: string) => {
    const lines = content.replace(/\r/g, '').split('\n');
    const timedItems: Array<{ start: number; text: string }> = [];
    const timeTagRegex = /\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)\]/g;

    lines.forEach((line) => {
      const tags = Array.from(line.matchAll(timeTagRegex));
      if (tags.length === 0) return;
      const text = line.replace(timeTagRegex, '').trim();
      if (!text) return;

      tags.forEach((match) => {
        const start = parseTimeToSeconds(match[1]);
        if (start !== null) {
          timedItems.push({ start, text });
        }
      });
    });

    timedItems.sort((a, b) => a.start - b.start);

    const minDuration = 1.5;
    return timedItems.map((item, index) => {
      const next = timedItems[index + 1];
      const end = next ? Math.max(item.start + 0.2, next.start - 0.05) : item.start + minDuration;
      return { start: item.start, end, text: item.text };
    });
  };

  const buildPlainSubtitleProjectContent = (
    rows: Array<{ start: number; end: number; text: string }>,
    speakers: Record<string, any>
  ) => {
    const defaultSpeakerId = Object.keys(speakers || {}).find((key) => speakers[key]?.type !== 'annotation') || 'A';
    return rows.map((row) => ({
      type: 'text',
      start: Number(row.start.toFixed(2)),
      end: Number(row.end.toFixed(2)),
      speaker: defaultSpeakerId,
      text: row.text
    }));
  };

  const backupAssIfSpeakerNamesChanged = async () => {
    if (!window.electron || !config.assPath) return;

    const previousNames = savedSpeakerNamesRef.current;
    const currentNames = getSpeakerNameSnapshot(config.speakers);
    const changed = Object.keys(currentNames).some((key) => currentNames[key] !== previousNames[key]);
    if (!changed) return;

    try {
      await window.electron.backupAssFile(config.assPath);
    } catch (error) {
      console.error('Failed to backup ASS before speaker rename sync:', error);
    }
  };

  const handleUpdateSubtitle = async (id: string, updates: Partial<any>) => {
    pushHistorySnapshot();
    const nextSubtitles = subtitles.map((subtitle: any) => {
      if (subtitle.id !== id) {
        return subtitle;
      }

      const merged = { ...subtitle, ...updates };
      return updates.speakerId ? normalizeSubtitleSpeakerFields(merged) : merged;
    }).sort((a: any, b: any) => a.start - b.start || a.end - b.end);

    setSubtitles(nextSubtitles);
    markProjectDirty();
  };

  const handleDeleteSubtitle = async (id: string) => {
    try {
      pushHistorySnapshot();
      const nextSubtitles = subtitles.filter((sub: any) => sub.id !== id);
      setSubtitles(nextSubtitles);
      if (editingSub?.id === id) {
        setEditingSub(null);
      }
      markProjectDirty();
      showToast(t('app.subtitleDeleted'));
    } catch (e) {
      console.error('Failed to delete subtitle:', e);
    }
  };

  const handleBulkDeleteSubtitles = async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      pushHistorySnapshot();
      const idSet = new Set(ids);
      const nextSubtitles = subtitles.filter((sub: any) => !idSet.has(sub.id));
      setSubtitles(nextSubtitles);
      if (editingSub?.id && idSet.has(editingSub.id)) {
        setEditingSub(null);
      }
      markProjectDirty();
      showToast(t('app.subtitleBatchDeleted', { count: ids.length }));
    } catch (e) {
      console.error('Failed to delete subtitles:', e);
    }
  };

  const handleBulkUpdateSubtitleSpeaker = async (ids: string[], speakerId: string) => {
    if (ids.length === 0 || !speakerId) return;
    pushHistorySnapshot();
    const idSet = new Set(ids);
    const nextSubtitles = subtitles.map((subtitle: any) => {
      if (!idSet.has(subtitle.id)) {
        return subtitle;
      }
      return normalizeSubtitleSpeakerFields({ ...subtitle, speakerId });
    }).sort((a: any, b: any) => a.start - b.start || a.end - b.end);
    setSubtitles(nextSubtitles);
    markProjectDirty();
    showToast(t('app.subtitleBatchSpeakerUpdated', { count: ids.length }));
  };

  const handleAddSubtitle = async () => {
    pushHistorySnapshot();
    const speakerId = Object.keys(config.speakers || {}).find((key) => config.speakers[key]?.type !== 'annotation') || 'A';
    const start = Number(currentTime.toFixed(2));
    const end = Number(Math.max(start + 2, start + 0.5).toFixed(2));
    const newSubtitle = normalizeSubtitleSpeakerFields({
      id: `sub-new-${Date.now()}`,
      start,
      end,
      duration: Number((end - start).toFixed(2)),
      style: config.speakers?.[speakerId]?.name || 'Default',
      actor: config.speakers?.[speakerId]?.name || '',
      text: '',
      speakerId,
      sourceLineIndex: -1
    });

    const nextSubtitles = [...subtitles, newSubtitle].sort((a, b) => a.start - b.start || a.end - b.end);
    setSubtitles(nextSubtitles);
    const createdSubtitle = nextSubtitles.find((subtitle: any) => subtitle.start === newSubtitle.start && subtitle.end === newSubtitle.end && subtitle.text === newSubtitle.text && subtitle.speakerId === newSubtitle.speakerId);

    if (createdSubtitle) {
      setEditingSub({ id: createdSubtitle.id, start: createdSubtitle.start, end: createdSubtitle.end, text: createdSubtitle.text });
    }

    markProjectDirty();
    showToast(t('app.subtitleAdded'));
  };

  const handleSortSubtitles = async () => {
    pushHistorySnapshot();
    const nextSubtitles = [...subtitles].sort((a, b) => a.start - b.start || a.end - b.end);
    setSubtitles(nextSubtitles);
    markProjectDirty();
    showToast(t('app.subtitleSorted'));
  };

  const handleImportPresets = async () => {
    if (!window.electron) {
      webPresetInputRef.current?.click();
      return;
    }

    try {
      const result = await window.electron.showOpenDialog({
        title: t('menu.importPresets'),
        filters: [{ name: t('dialog.filterJson'), extensions: ['json'] }],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) return;

      const content = await window.electron.readFile(result.filePaths[0]);
      const parsed = JSON.parse(content);
      const existing = { ...presets };
      const existingAnnotationPresets = { ...annotationPresets };
      const imported: Record<string, any> = {};
      const importedAnnotations: Record<string, any> = {};

      if (parsed?.speakers && typeof parsed.speakers === 'object') {
        Object.entries(parsed.speakers).forEach(([speakerKey, speaker]: [string, any]) => {
          const baseName = speaker?.name || speakerKey;
          let presetName = baseName;
          let counter = 2;
          while (existing[presetName] || imported[presetName]) {
            presetName = `${baseName} (${counter})`;
            counter += 1;
          }
          imported[presetName] = {
            style: JSON.parse(JSON.stringify(speaker?.style || {})),
            avatar: speaker?.avatar || ''
          };
        });
      }

      if (parsed?.annotations && typeof parsed.annotations === 'object') {
        Object.entries(parsed.annotations).forEach(([presetName, presetValue]) => {
          let nextName = presetName;
          let counter = 2;
          while (existingAnnotationPresets[nextName] || importedAnnotations[nextName]) {
            nextName = `${presetName} (${counter})`;
            counter += 1;
          }
          importedAnnotations[nextName] = presetValue;
        });
      }

      if (parsed && typeof parsed === 'object' && !parsed.speakers) {
        Object.entries(parsed).forEach(([presetName, presetValue]) => {
          imported[presetName] = presetValue;
        });
      }

      const speakerCount = parsed?.speakers && typeof parsed.speakers === 'object'
        ? Object.keys(parsed.speakers).length
        : 0;
      const presetCount = Object.keys(imported).length;
      const annotationPresetCount = Object.keys(importedAnnotations).length;
      if (presetCount === 0 && annotationPresetCount === 0) {
        return;
      }

      const confirmed = window.confirm(t('app.presetsImportConfirm', { presetCount: presetCount + annotationPresetCount, speakerCount }));
      if (!confirmed) {
        return;
      }

      setPresets({ ...existing, ...imported });
      setAnnotationPresets({ ...existingAnnotationPresets, ...importedAnnotations });
      showToast(t('app.presetsImported'));
    } catch (error) {
      console.error('Failed to import presets:', error);
    }
  };

  const handleExportPresets = async () => {
    if (!window.electron) {
      try {
        const blob = new Blob([JSON.stringify({ speakers: presets, annotations: annotationPresets }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = t('dialog.defaultPresetFilename');
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        showToast(t('app.presetsExported'));
      } catch (error) {
        console.error('Failed to export presets:', error);
      }
      return;
    }

    try {
      const result = await window.electron.showSaveDialog({
        title: t('menu.exportPresets'),
        defaultPath: t('dialog.defaultPresetFilename'),
        filters: [{ name: t('dialog.filterJson'), extensions: ['json'] }]
      });

      if (result.canceled || !result.filePath) return;
        await window.electron.writeFile(result.filePath, JSON.stringify({ speakers: presets, annotations: annotationPresets }, null, 2));
      showToast(t('app.presetsExported'));
    } catch (error) {
      console.error('Failed to export presets:', error);
    }
  };

  const handleCopyPreviewToClipboard = async (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.electron || !previewFrameRef.current) return;

    const rect = previewFrameRef.current.getBoundingClientRect();
    try {
      await window.electron.captureRectToClipboard({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      });
      showToast(t('app.previewCopied'));
    } catch (error) {
      console.error('Failed to copy preview:', error);
    }
  };

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const rememberRecentProject = useCallback((path: string | null | undefined) => {
    if (!path) return;
    setRecentProject(path);
    setConfig((prev: any) => {
      const prevUi = prev?.ui || DEFAULT_UI_CONFIG;
      const nextRecentProjects = [path, ...(prevUi.recentProjects || []).filter((item: string) => item !== path)].slice(0, 10);
      if (prevUi.recentProject === path && JSON.stringify(prevUi.recentProjects || []) === JSON.stringify(nextRecentProjects)) {
        return prev;
      }
      return {
        ...prev,
        ui: {
          ...prevUi,
          recentProject: path,
          recentProjects: nextRecentProjects,
        }
      };
    });
  }, []);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const language = (config.language || 'zh-CN') as Language;
  const t = useCallback((key: string, vars?: Record<string, string | number>) => translate(language, key, vars), [language]);
  const themeColor = themeColorState || (isDarkMode ? DARK_THEME_DEFAULT : LIGHT_THEME_DEFAULT);
  const secondaryThemeColor = secondaryThemeColorState || SECONDARY_THEME_DEFAULT;
  const uiTheme = createThemeTokens(themeColor, isDarkMode);
  const appBackground = isDarkMode
    ? `linear-gradient(180deg, ${uiTheme.appBg} 0%, ${uiTheme.appBg} 74%, ${secondaryThemeColor}14 100%)`
    : `linear-gradient(180deg, ${uiTheme.appBg} 0%, ${uiTheme.appBg} 78%, ${secondaryThemeColor}12 100%)`;
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const openExternalUrl = useCallback(async (url: string) => {
    if (window.electron) {
      await window.electron.openExternal(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    setIsCheckingUpdates(true);
    try {
      if (window.electron) {
        const result = await window.electron.checkForUpdates();
        setUpdateResult(result);
        showToast(result.ok ? (result.hasUpdate ? `${t('about.updateAvailable')}: v${result.latestVersion}` : t('about.upToDate')) : t('about.updateCheckFailed'));
        return;
      }

      const response = await fetch('https://api.github.com/repos/AlanWanco/PomChat/releases/latest', {
        headers: { Accept: 'application/vnd.github+json' }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const release = await response.json() as { tag_name?: string; html_url?: string; published_at?: string };
      const latestVersion = (release.tag_name || __APP_VERSION__).replace(/^v/i, '');
      const result: UpdateCheckResult = {
        ok: true,
        latestVersion,
        currentVersion: __APP_VERSION__,
        htmlUrl: release.html_url,
        publishedAt: release.published_at,
        hasUpdate: latestVersion !== __APP_VERSION__,
      };
      setUpdateResult(result);
      showToast(result.hasUpdate ? `${t('about.updateAvailable')}: v${latestVersion}` : t('about.upToDate'));
    } catch (error) {
      setUpdateResult({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' });
      showToast(t('about.updateCheckFailed'));
    } finally {
      setIsCheckingUpdates(false);
    }
  }, [showToast, t]);

  const handleRequestRemoveSpeaker = useCallback((speakerKey: string) => {
    const speaker = config.speakers?.[speakerKey];
    if (!speaker || speaker.type === 'annotation') {
      return;
    }

    const nonAnnotationKeys = Object.keys(config.speakers || {}).filter((key) => config.speakers[key]?.type !== 'annotation');
    if (nonAnnotationKeys.length <= 1) {
      showToast(t('speakers.keepAtLeastOne'));
      return;
    }

    const replacementCandidates = nonAnnotationKeys.filter((key) => key !== speakerKey);
    const affectedCount = subtitles.filter((sub) => sub.speakerId === speakerKey).length;
    setSpeakerReplaceDialog({
      speakerKey,
      replacementKey: replacementCandidates[0] || '',
      affectedCount
    });
  }, [config.speakers, showToast, subtitles, t]);

  const confirmRemoveSpeakerWithReplacement = useCallback(() => {
    if (!speakerReplaceDialog) {
      return;
    }

    const { speakerKey, replacementKey } = speakerReplaceDialog;
    if (!replacementKey || config.speakers?.[replacementKey]?.type === 'annotation') {
      return;
    }

    pushHistorySnapshot();
    setSubtitles((prev) => prev.map((sub) => (sub.speakerId === speakerKey ? {
      ...sub,
      speakerId: replacementKey
    } : sub)));
    setConfig((prev: any) => {
      const nextSpeakers = { ...(prev?.speakers || {}) };
      delete nextSpeakers[speakerKey];
      return {
        ...prev,
        speakers: nextSpeakers
      };
    });
    markProjectDirty();
    setSpeakerReplaceDialog(null);
    showToast(t('speakers.bulkReassignDone'));
  }, [config.speakers, markProjectDirty, pushHistorySnapshot, showToast, speakerReplaceDialog, t]);

  const loadWebSavedProject = useCallback(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return false;
    }

    try {
      const parsed = JSON.parse(saved);
      const validatedConfig = validateProjectConfig(parsed);
      const requiresAudioReload = Boolean(validatedConfig.audioPath);
      const restoredConfig = requiresAudioReload ? { ...validatedConfig, audioPath: '' } : validatedConfig;
      const normalizedRestoredConfig = restoredConfig.subtitleFormat
        ? restoredConfig
        : { ...restoredConfig, subtitleFormat: restoredConfig.assPath ? 'ass' : (restoredConfig.content?.length ? 'srt' : 'ass') };
      setConfig(normalizedRestoredConfig);
      if (normalizedRestoredConfig.subtitleFormat === 'ass' && normalizedRestoredConfig.assPath) {
        // do not set webAssContent to a path string
      } else {
        setWebAssContent(null);
      }
      setProjectPath('web-demo');
      rememberRecentProject(parsed?.projectTitle || 'web-demo');
      savedSpeakerNamesRef.current = getSpeakerNameSnapshot(normalizedRestoredConfig.speakers);
      if (requiresAudioReload) {
        showToast(t('app.projectLoadedNeedAudio'));
      }
      return true;
    } catch (error) {
      console.error('Failed to restore web project from localStorage:', error);
      return false;
    }
  }, [showToast]);

  useEffect(() => {
    if (window.electron) {
      return;
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved);
      rememberRecentProject(parsed?.projectTitle || 'web-demo');
    } catch (error) {
      console.error('Failed to parse saved web project metadata:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyScheme = (matches: boolean) => {
      setIsDarkMode(matches);
    };

    applyScheme(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      applyScheme(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const ui = config.ui || DEFAULT_UI_CONFIG;
    lastUiSyncSnapshotRef.current = JSON.stringify({
      isDarkMode: ui.isDarkMode,
      themeColor: ui.themeColor,
      secondaryThemeColor: ui.secondaryThemeColor,
      autoSaveProject: Boolean(ui.autoSaveProject),
      proxy: ui.proxy || '',
      settingsPosition: ui.settingsPosition,
      recentProject: ui.recentProject,
      presets: ui.presets ?? DEFAULT_UI_CONFIG.presets,
      annotationPresets: ui.annotationPresets ?? DEFAULT_UI_CONFIG.annotationPresets,
    });
    setThemeColorState((prev: string) => (prev === ui.themeColor ? prev : ui.themeColor));
    setSecondaryThemeColorState((prev: string) => (prev === ui.secondaryThemeColor ? prev : ui.secondaryThemeColor));
    setAutoSaveProject((prev: boolean) => (prev === Boolean(ui.autoSaveProject) ? prev : Boolean(ui.autoSaveProject)));
    setProxyState((prev: string) => (prev === (ui.proxy || '') ? prev : (ui.proxy || '')));
    setSettingsPosition((prev: 'left' | 'right') => (prev === ui.settingsPosition ? prev : ui.settingsPosition));
    if (window.electron) {
      setRecentProject((prev: string | null) => (prev === ui.recentProject ? prev : ui.recentProject));
    }
    setPresets((prev: Record<string, any>) => {
      const next = ui.presets ?? DEFAULT_UI_CONFIG.presets;
      if (prev === next) return prev;
      if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
      return next;
    });
    setAnnotationPresets((prev: Record<string, any>) => {
      const next = ui.annotationPresets ?? DEFAULT_UI_CONFIG.annotationPresets;
      if (prev === next) return prev;
      if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
      return next;
    });
  }, [config.ui]);

  useEffect(() => {
    if (!hasHydratedElectronConfigRef.current) {
      return;
    }

    const nextUiSnapshot = JSON.stringify({
      isDarkMode,
      themeColor: themeColorState || (isDarkMode ? DARK_THEME_DEFAULT : LIGHT_THEME_DEFAULT),
      secondaryThemeColor: secondaryThemeColorState || DEFAULT_UI_CONFIG.secondaryThemeColor,
      autoSaveProject,
      proxy: proxyState.trim(),
      settingsPosition,
      recentProject,
      presets,
      annotationPresets,
    });

    if (lastUiSyncSnapshotRef.current === nextUiSnapshot) {
      return;
    }

    setConfig((prev: any) => {
      const prevUi = prev.ui || DEFAULT_UI_CONFIG;
      const nextPresets = presets;
      const nextAnnotationPresets = annotationPresets;
      const samePresets = prevUi.presets === nextPresets || JSON.stringify(prevUi.presets || {}) === JSON.stringify(nextPresets || {});
      const sameAnnotationPresets = prevUi.annotationPresets === nextAnnotationPresets || JSON.stringify(prevUi.annotationPresets || {}) === JSON.stringify(nextAnnotationPresets || {});
      if (
        prevUi.isDarkMode === isDarkMode &&
        prevUi.themeColor === (themeColorState || (isDarkMode ? DARK_THEME_DEFAULT : LIGHT_THEME_DEFAULT)) &&
        prevUi.secondaryThemeColor === (secondaryThemeColorState || DEFAULT_UI_CONFIG.secondaryThemeColor) &&
        prevUi.autoSaveProject === autoSaveProject &&
        prevUi.proxy === proxyState.trim() &&
        prevUi.settingsPosition === settingsPosition &&
        prevUi.recentProject === recentProject &&
        samePresets &&
        sameAnnotationPresets
      ) {
        return prev;
      }

      lastUiSyncSnapshotRef.current = nextUiSnapshot;

      return {
        ...prev,
        ui: {
          ...prevUi,
          isDarkMode,
          themeColor: themeColorState || (isDarkMode ? DARK_THEME_DEFAULT : LIGHT_THEME_DEFAULT),
          secondaryThemeColor: secondaryThemeColorState || DEFAULT_UI_CONFIG.secondaryThemeColor,
          autoSaveProject,
          proxy: proxyState.trim(),
          settingsPosition,
          recentProject,
          presets: nextPresets,
          annotationPresets: nextAnnotationPresets,
        },
      };
    });
  }, [autoSaveProject, isDarkMode, themeColorState, secondaryThemeColorState, proxyState, settingsPosition, recentProject, presets, annotationPresets]);

  useEffect(() => {
    if (!window.electron || !hasHydratedElectronConfigRef.current) return;
    window.electron.setProxy(proxyState.trim()).catch((err: any) => {
      console.error('Failed to apply proxy settings:', err);
    });
  }, [proxyState]);

  const handleThemeColorChangeTracked = useCallback((color: string) => {
    pushHistorySnapshot();
    setThemeColorState(color);
    markProjectDirty();
  }, [markProjectDirty, pushHistorySnapshot]);

  const handleSecondaryThemeColorChangeTracked = useCallback((color: string) => {
    pushHistorySnapshot();
    setSecondaryThemeColorState(color);
    markProjectDirty();
  }, [markProjectDirty, pushHistorySnapshot]);

  const handleProxyChangeTracked = useCallback((nextProxy: string) => {
    pushHistorySnapshot();
    setProxyState(nextProxy);
    markProjectDirty();
  }, [markProjectDirty, pushHistorySnapshot]);

  const handleLanguageChangeTracked = useCallback((nextLanguage: Language) => {
    applyTrackedConfigUpdater((prev: any) => ({ ...prev, language: nextLanguage }));
  }, [applyTrackedConfigUpdater]);

  const handleThemeModeChangeTracked = useCallback((nextDarkMode: boolean) => {
    pushHistorySnapshot();
    setIsDarkMode(nextDarkMode);
    markProjectDirty();
  }, [markProjectDirty, pushHistorySnapshot]);

  const handlePositionChangeTracked = useCallback((nextPosition: 'left' | 'right') => {
    pushHistorySnapshot();
    setSettingsPosition(nextPosition);
    markProjectDirty();
  }, [markProjectDirty, pushHistorySnapshot]);

  const handlePresetsChangeTracked = useCallback((nextPresets: Record<string, any>) => {
    pushHistorySnapshot();
    setPresets(nextPresets);
    markProjectDirty();
  }, [markProjectDirty, pushHistorySnapshot]);

  const handleAnnotationPresetsChangeTracked = useCallback((nextPresets: Record<string, any>) => {
    pushHistorySnapshot();
    setAnnotationPresets(nextPresets);
    markProjectDirty();
  }, [markProjectDirty, pushHistorySnapshot]);

   // Save config explicitly
   const handleSaveConfig = () => {
     if (!window.electron) {
       localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
     }
      if (window.electron) {
        window.electron.saveConfig(config).catch((err: any) => console.error('Failed to save config to file:', err));
      }
      showToast(t('app.configSaved'));
    };

  useEffect(() => {
    if (!themeColorState) {
      setThemeColorState(isDarkMode ? DARK_THEME_DEFAULT : LIGHT_THEME_DEFAULT);
    }
  }, [isDarkMode, themeColorState]);

  // Load config from Electron config file on startup (only once)
  const hasLoadedElectronConfigRef = useRef(false);
  useEffect(() => {
    if (hasLoadedElectronConfigRef.current || !window.electron) return;
    
    hasLoadedElectronConfigRef.current = true;
    
    const loadElectronConfig = async () => {
      try {
        const electronConfig = await window.electron.loadConfig();
        if (electronConfig) {
          const mergedConfig = sanitizeProjectConfig(electronConfig);
          setConfig(mergedConfig);
        }
      } catch (error) {
        console.error('Failed to load config from Electron:', error);
      } finally {
        hasHydratedElectronConfigRef.current = true;
      }
    };
    
    loadElectronConfig();
  }, []);

  // Save config changes to Electron file (debounced to prevent too frequent saves)
  useEffect(() => {
    // Only save if we have substantive changes (not just on every render)
    if (!window.electron || !hasHydratedElectronConfigRef.current) return;
    
    // Save to file in background without blocking
    const saveTimer = setTimeout(() => {
      window.electron.saveConfig(config).catch((err: any) => 
        console.error('Failed to save config to file:', err)
      );
    }, 500);
    
    return () => clearTimeout(saveTimer);
  }, [config]);

  useEffect(() => {
    if (window.electron) return;

    const saveTimer = setTimeout(() => {
      const webPersistedConfig = {
        ...config,
        content: [...subtitles]
          .sort((a, b) => a.start - b.start || a.end - b.end)
          .map((s) => ({
            start: s.start,
            end: s.end,
            speaker: s.speakerId,
            type: 'text',
            text: s.text
          }))
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(webPersistedConfig));
    }, 250);

    return () => clearTimeout(saveTimer);
  }, [config, subtitles]);

  useEffect(() => {
    const isNarrowOrPortrait = windowWidth < 700;
    
    if (isNarrowOrPortrait) {
      if (!portraitAutoCollapseRef.current) {
        portraitAutoCollapseRef.current = {
          subtitle: showSubtitlePanel,
          settings: showSettings
        };
      }
      setShowSubtitlePanel(false);
      setShowSettings(false);
    } else {
      if (portraitAutoCollapseRef.current) {
        const previousState = portraitAutoCollapseRef.current;
        portraitAutoCollapseRef.current = null;
        setShowSubtitlePanel(previousState.subtitle);
        setShowSettings(previousState.settings);
      }
    }
  }, [isPortraitCanvas, windowWidth]); // intentionally omitted showSettings and showSubtitlePanel to allow manual toggling

  // Update window title with project path
  useEffect(() => {
    if (projectPath) {
      document.title = projectPath === 'web-demo' 
        ? t('app.webDemo')
        : `PomChat Studio - ${projectPath}`;
    } else {
      document.title = 'PomChat Studio';
    }
  }, [projectPath, t]);

  // Audio Sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!hasAudioSource) {
      audio.pause();
      return;
    }
    if (isPlaying) {
      audio.play().catch((err) => {
        console.error("Audio playback failed:", err);
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [isPlaying, hasAudioSource]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.loop = loop;
  }, [loop]);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (audioRef.current) {
      audioRef.current.load();
    }
  }, [webAudioObjectUrl, config.audioPath]);

  const persistPlaybackPosition = useCallback((time: number) => {
    const playbackKey = projectPath || config.assPath || config.audioPath;
    if (!playbackKey || !Number.isFinite(time)) {
      return;
    }

    setConfig((prev: any) => {
      const prevUi = prev.ui || DEFAULT_UI_CONFIG;
      const prevPositions = prevUi.playbackPositions || {};
      const previousTime = prevPositions[playbackKey];
      if (typeof previousTime === 'number' && Math.abs(previousTime - time) < 0.5) {
        return prev;
      }

      return {
        ...prev,
        ui: {
          ...prevUi,
          playbackPositions: {
            ...prevPositions,
            [playbackKey]: time
          }
        }
      };
    });
  }, [projectPath, config.assPath, config.audioPath]);

  const handleTimeUpdate = () => {
    if (!audioRef.current || !hasAudioSource) {
      return;
    }

    const time = audioRef.current.currentTime;
    if (!isPlaying) {
      setCurrentTime(time);
    }
  };

  useEffect(() => {
    if (!isPlaying || !audioRef.current || !hasAudioSource) {
      return;
    }

    let rafId = 0;
    const tick = () => {
      if (audioRef.current) {
        const now = performance.now();
        if (now - lastUiFrameAtRef.current >= 16) {
          lastUiFrameAtRef.current = now;
          setCurrentTime(audioRef.current.currentTime);
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isPlaying, hasAudioSource]);

  useEffect(() => {
    if (!isPlaying || hasAudioSource) {
      return;
    }

    let rafId = 0;
    let lastTickAt = performance.now();
    const tick = () => {
      const now = performance.now();
      const deltaSeconds = Math.max(0, (now - lastTickAt) / 1000);
      lastTickAt = now;

      setCurrentTime((prev) => {
        const next = prev + deltaSeconds * playbackRate;
        if (previewTimelineDuration <= 0) {
          return prev;
        }
        if (next >= previewTimelineDuration) {
          if (loop) {
            return 0;
          }
          setIsPlaying(false);
          return previewTimelineDuration;
        }
        return next;
      });

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isPlaying, hasAudioSource, playbackRate, previewTimelineDuration, loop]);

  useEffect(() => {
    const now = performance.now();
    if (isPlaying) {
      if (now - lastPlaybackPersistAtRef.current < 900) {
        return;
      }
      lastPlaybackPersistAtRef.current = now;
      persistPlaybackPosition(currentTime);
      return;
    }

    persistPlaybackPosition(currentTime);
  }, [currentTime, isPlaying, persistPlaybackPosition]);

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      if (!window.electron && (!Number.isFinite(audioRef.current.duration) || audioRef.current.duration <= 0)) {
        showToast(t('app.audioReloadRequired'));
      }
      setDuration(audioRef.current.duration);
      const playbackKey = projectPath || config.assPath || config.audioPath;
      if (playbackKey) {
        const saved = config.ui?.playbackPositions || {};
        const time = saved[playbackKey];
        if (typeof time === 'number' && time >= 0 && time <= audioRef.current.duration) {
          audioRef.current.currentTime = time;
          setCurrentTime(time);
        }
      }
    }
  };

  const handleSeek = useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
    setCurrentTime(time);
    setSeekTick((prev) => prev + 1);
  }, []);

  // Keep preview chat anchored by virtualized render window.

  const generateFilename = (template: 'default' | 'timestamp' | 'unix' | 'custom', customName: string, format: 'mp4' | 'mov-alpha' | 'webm-alpha'): string => {
    const extension = format === 'mov-alpha' ? 'mov' : format === 'webm-alpha' ? 'webm' : 'mp4';
    if (template === 'custom' && customName.trim()) {
      const name = customName.trim();
      return /\.[A-Za-z0-9]+$/.test(name) ? name : `${name}.${extension}`;
    }

    const now = new Date();
    const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const timeStr = String(now.getHours()).padStart(2, '0') + '-' + String(now.getMinutes()).padStart(2, '0') + '-' + String(now.getSeconds()).padStart(2, '0');
    const unixTime = Math.floor(now.getTime() / 1000);

    if (template === 'timestamp') {
      return `pomchat_${dateStr}_${timeStr}.${extension}`;
    }
    if (template === 'unix') {
      return `pomchat_${unixTime}.${extension}`;
    }
    return `pomchat.${extension}`;
  };

  const normalizeExportDirectory = (rawPath: string) => {
    const trimmedPath = rawPath.trim();
    if (!trimmedPath) return '';

    const normalized = trimmedPath.replace(/\\/g, '/');
    const lastSlashIndex = normalized.lastIndexOf('/');
    const lastSegment = lastSlashIndex >= 0 ? normalized.slice(lastSlashIndex + 1) : normalized;
    const hasFileExtension = /\.[A-Za-z0-9]+$/.test(lastSegment);

    if (hasFileExtension) {
      const separatorIndex = Math.max(trimmedPath.lastIndexOf('/'), trimmedPath.lastIndexOf('\\'));
      return separatorIndex >= 0 ? trimmedPath.slice(0, separatorIndex) : '';
    }

    return trimmedPath.endsWith('/') || trimmedPath.endsWith('\\') ? trimmedPath.slice(0, -1) : trimmedPath;
  };

  const applyFilenameTemplateToPath = (rawPath: string, filename: string) => {
    const directory = normalizeExportDirectory(rawPath);
    if (!directory) return filename;
    const separator = directory.includes('\\') && !directory.includes('/') ? '\\' : '/';
    return `${directory}${separator}${filename}`;
  };

  const calculateCRF = (quality: 'fast' | 'balance' | 'high'): number => {
    // fast = high compression ratio (smaller file, slower encode)
    if (quality === 'fast') return 28;
    // high = minimal compression (larger file, faster encode)
    if (quality === 'high') return 14;
    return 20;
  };

  const calculateX264Preset = (quality: 'fast' | 'balance' | 'high'): 'ultrafast' | 'veryfast' | 'fast' => {
    if (quality === 'fast') return 'fast';
    if (quality === 'high') return 'ultrafast';
    return 'veryfast';
  };

  const getProjectConfig = () => {
    const restConfig: any = Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'ui'));
    return {
      ...restConfig,
      content: [...subtitles].sort((a, b) => a.start - b.start || a.end - b.end).map(s => ({
        start: s.start,
        end: s.end,
        speaker: s.speakerId,
        type: 'text',
        text: s.text
      }))
    };
  };

  const getExportConfig = (slideIntrinsicSizeOverrides?: Record<string, { width: number; height: number }>) => {
    const restConfig = getProjectConfig();
    const resolveExportAssetPath = (assetPath: string | undefined) => {
      const cachedPath = cachedRemoteAssets[assetPath || ''] || assetPath;
      return resolvePath(cachedPath) || cachedPath || '';
    };
    const remapMarkdownImagePaths = (text: string) => text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => `![${alt}](${resolveExportAssetPath((src || '').trim())})`);
    const remappedSpeakers = Object.fromEntries(
      Object.entries(restConfig.speakers || {}).map(([key, speaker]: [string, any]) => [
        key,
        {
          ...speaker,
          avatar: resolveExportAssetPath(speaker?.avatar)
        }
      ])
    );
    return {
      ...restConfig,
      content: Array.isArray(restConfig.content)
        ? restConfig.content.map((item: any) => item?.type === 'text' ? { ...item, text: remapMarkdownImagePaths(item.text || '') } : item)
        : restConfig.content,
      speakers: remappedSpeakers,
      background: restConfig.background
        ? {
            ...restConfig.background,
            image: resolveExportAssetPath(restConfig.background.image),
            slides: Array.isArray(restConfig.background.slides)
              ? restConfig.background.slides.map((slide: BackgroundSlideItem) => ({
                  ...slide,
                  intrinsicWidth: slideIntrinsicSizeOverrides?.[slide.id]?.width ?? slide.intrinsicWidth,
                  intrinsicHeight: slideIntrinsicSizeOverrides?.[slide.id]?.height ?? slide.intrinsicHeight,
                  image: resolveExportAssetPath(slide.image)
                }))
              : []
          }
        : restConfig.background
    };
  };

  async function loadRenderableAssetNaturalSize(assetPath: string) {
    const resolved = resolvePath(assetPath) || assetPath;
    if (!resolved) {
      return null;
    }

    return await new Promise<{ width: number; height: number } | null>((resolve) => {
      if (/\.(mp4|webm|mov|mkv)(\?|$)/i.test(resolved)) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        video.onloadedmetadata = () => resolve(
          Number.isFinite(video.videoWidth) && Number.isFinite(video.videoHeight) && video.videoWidth > 0 && video.videoHeight > 0
            ? { width: video.videoWidth, height: video.videoHeight }
            : null
        );
        video.onerror = () => resolve(null);
        video.src = resolved;
        return;
      }

      const image = new Image();
      image.referrerPolicy = 'no-referrer';
      image.onload = () => resolve(
        Number.isFinite(image.naturalWidth) && Number.isFinite(image.naturalHeight) && image.naturalWidth > 0 && image.naturalHeight > 0
          ? { width: image.naturalWidth, height: image.naturalHeight }
          : null
      );
      image.onerror = () => resolve(null);
      image.src = resolved;
    });
  }

  async function ensureBackgroundSlideIntrinsicSizes() {
    const slides = Array.isArray(config.background?.slides) ? config.background.slides : [];
    const targets = slides.filter((slide: BackgroundSlideItem) => slide.type !== 'text' && slide.image && (!slide.intrinsicWidth || !slide.intrinsicHeight));
    if (targets.length === 0) {
      return {} as Record<string, { width: number; height: number }>;
    }

    const measured = await Promise.all(targets.map(async (slide: BackgroundSlideItem) => ({
      id: slide.id,
      size: await loadRenderableAssetNaturalSize(slide.image || ''),
    })));
    const updates = measured.filter((item) => item.size);
    if (updates.length === 0) {
      return {} as Record<string, { width: number; height: number }>;
    }

    const sizeMap = Object.fromEntries(updates.map((item) => [item.id, { width: item.size!.width, height: item.size!.height }])) as Record<string, { width: number; height: number }>;

    setConfig((prev: any) => {
      const prevSlides = Array.isArray(prev?.background?.slides) ? prev.background.slides : [];
      let changed = false;
      const nextSlides = prevSlides.map((slide: BackgroundSlideItem) => {
        const match = updates.find((item) => item.id === slide.id);
        if (!match?.size) {
          return slide;
        }
        if (slide.intrinsicWidth === match.size.width && slide.intrinsicHeight === match.size.height) {
          return slide;
        }
        changed = true;
        return { ...slide, intrinsicWidth: match.size.width, intrinsicHeight: match.size.height };
      });

      if (!changed) {
        return prev;
      }

      return {
        ...prev,
        background: {
          ...(prev?.background || DEFAULT_PROJECT_CONFIG.background),
          slides: nextSlides,
        },
      };
    });

    return sizeMap;
  }


  const getDefaultExportRange = useCallback(() => {
    const latestSubtitle = subtitles.reduce((max, item) => Math.max(max, item.end), 0);
    const start = 0;
    const end = Number(Math.max(duration || 0, latestSubtitle || 0, start).toFixed(2));
    return { start, end };
  }, [duration, subtitles]);

  const isSameRange = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start === b.start && a.end === b.end;

  const updateExportRange = useCallback((updates: { start?: number; end?: number }, markTouched = true) => {
    pushHistorySnapshot();
    if (markTouched) {
      exportRangeTouchedRef.current = true;
    }

    setExportRange((prev) => {
      const rawStart = updates.start ?? prev.start;
      const rawEnd = updates.end ?? prev.end;
      const nextStart = Number(Math.max(0, Math.min(rawStart, rawEnd)).toFixed(2));
      const nextEnd = Number(Math.max(nextStart, rawEnd).toFixed(2));
      return { start: nextStart, end: nextEnd };
    });
    markProjectDirty();
  }, [markProjectDirty, pushHistorySnapshot]);

  useEffect(() => {
    if (!audioRef.current || duration <= 0) return;
    if (exportRangeTouchedRef.current || config.exportRangeCustomized) return;
    
    // Only auto-expand if range hasn't been touched.
    // Do not reset user-visible start when reloading audio.
    const defaults = getDefaultExportRange();
    setExportRange((prev) => {
      if (prev.start === 0 && prev.end === 0) {
        return isSameRange(prev, defaults) ? prev : defaults;
      }
      const nextEnd = Number(Math.max(prev.end, defaults.end).toFixed(2));
      return nextEnd === prev.end ? prev : { ...prev, end: nextEnd };
    });
  }, [duration, subtitles.length, config.exportRangeCustomized, getDefaultExportRange]);

  const handleExportQualityChange = useCallback((nextQuality: 'fast' | 'balance' | 'high') => {
    if (exportQuality === nextQuality) {
      return;
    }
    pushHistorySnapshot();
    setExportQuality(nextQuality);
    markProjectDirty();
  }, [exportQuality, markProjectDirty, pushHistorySnapshot]);

  const handleFilenameTemplateChange = useCallback((nextTemplate: 'default' | 'timestamp' | 'unix' | 'custom') => {
    if (filenameTemplate === nextTemplate) {
      return;
    }
    pushHistorySnapshot();
    setFilenameTemplate(nextTemplate);
    markProjectDirty();
  }, [filenameTemplate, markProjectDirty, pushHistorySnapshot]);

  const handleExportFormatChange = useCallback((nextFormat: 'mp4' | 'mov-alpha' | 'webm-alpha') => {
    if (exportFormat === nextFormat) {
      return;
    }
    pushHistorySnapshot();
    setExportFormat(nextFormat);
    markProjectDirty();
  }, [exportFormat, markProjectDirty, pushHistorySnapshot]);

  const handleExportLogEnabledChange = useCallback((nextEnabled: boolean) => {
    if (exportLogEnabled === nextEnabled) {
      return;
    }
    pushHistorySnapshot();
    setExportLogEnabled(nextEnabled);
    markProjectDirty();
  }, [exportLogEnabled, markProjectDirty, pushHistorySnapshot]);

  const handleCustomFilenameChange = useCallback((nextFilename: string) => {
    if (customFilename === nextFilename) {
      return;
    }
    pushHistorySnapshot();
    setCustomFilename(nextFilename);
    markProjectDirty();
  }, [customFilename, markProjectDirty, pushHistorySnapshot]);

  const loadExportPaths = useCallback(async () => {
    if (!window.electron) {
      return null;
    }

    const paths = await window.electron.getExportPaths({
      projectPath,
      projectTitle: config.projectTitle || t('app.untitled')
    });

    setQuickSavePath(paths.quickSavePath);
    setExportOutputPath((prev) => prev || paths.suggestedPath || paths.quickSavePath);
    return paths;
  }, [config.projectTitle, projectPath, t]);

  useEffect(() => {
    exportRangeTouchedRef.current = false;
    setExportOutputPath('');
    setExportStatusMessage(null);
    setLastExportSucceeded(false);
  }, [config.projectId]);

  useEffect(() => {
    if (config.exportRangeCustomized) {
      exportRangeTouchedRef.current = true;
    }
    const sourceRange = config.exportRange;
    if (sourceRange && typeof sourceRange.start === 'number' && typeof sourceRange.end === 'number') {
      setExportRange({
        start: Math.max(0, sourceRange.start),
        end: Math.max(sourceRange.start, sourceRange.end)
      });
    }
  }, [config.projectId]); // Only run on project load/change, not continuously

  useEffect(() => {
    const nextQuality = config.exportQuality === 'fast' || config.exportQuality === 'balance' || config.exportQuality === 'high'
      ? config.exportQuality
      : 'balance';
    setExportQuality((prev) => (prev === nextQuality ? prev : nextQuality));

    const nextTemplate = config.filenameTemplate === 'default' || config.filenameTemplate === 'timestamp' || config.filenameTemplate === 'unix' || config.filenameTemplate === 'custom'
      ? config.filenameTemplate
      : 'default';
    setFilenameTemplate((prev) => (prev === nextTemplate ? prev : nextTemplate));

    const nextCustomFilename = typeof config.customFilename === 'string' ? config.customFilename : '';
    setCustomFilename((prev) => (prev === nextCustomFilename ? prev : nextCustomFilename));
    setPersistedCustomFilename((prev) => (prev === nextCustomFilename ? prev : nextCustomFilename));
    const nextHardware = config.exportHardware === 'gpu' || config.exportHardware === 'cpu' ? config.exportHardware : 'auto';
    setExportHardware((prev) => (prev === nextHardware ? prev : nextHardware));
    const nextFormat = config.exportFormat === 'mov-alpha' || config.exportFormat === 'webm-alpha' ? config.exportFormat : 'mp4';
    setExportFormat((prev) => (prev === nextFormat ? prev : nextFormat));
    setExportLogEnabled((prev) => (prev === Boolean(config.exportLogEnabled) ? prev : Boolean(config.exportLogEnabled)));
  }, [config.exportQuality, config.filenameTemplate, config.customFilename, config.exportHardware, config.exportFormat, config.exportLogEnabled]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPersistedCustomFilename((prev) => (prev === customFilename ? prev : customFilename));
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [customFilename]);

  useEffect(() => {
    if (!hasHydratedElectronConfigRef.current) {
      return;
    }

    setConfig((prev: any) => {
      const sameExportRange =
        prev.exportRange?.start === exportRange.start &&
        prev.exportRange?.end === exportRange.end;
      const sameExportRangeCustomized = Boolean(prev.exportRangeCustomized) === exportRangeTouchedRef.current;
      const sameQuality = prev.exportQuality === exportQuality;
      const sameHardware = prev.exportHardware === exportHardware;
      const sameFormat = prev.exportFormat === exportFormat;
      const sameLogEnabled = Boolean(prev.exportLogEnabled) === exportLogEnabled;
      const sameTemplate = prev.filenameTemplate === filenameTemplate;
      const sameCustomFilename = prev.customFilename === persistedCustomFilename;

      if (sameExportRange && sameExportRangeCustomized && sameQuality && sameHardware && sameFormat && sameLogEnabled && sameTemplate && sameCustomFilename) {
        return prev;
      }

      return {
        ...prev,
        exportRange,
        exportRangeCustomized: exportRangeTouchedRef.current,
        exportQuality,
        exportHardware,
        exportFormat,
        exportLogEnabled,
        filenameTemplate,
        customFilename: persistedCustomFilename
      };
    });
  }, [exportRange, exportQuality, exportHardware, exportFormat, exportLogEnabled, filenameTemplate, persistedCustomFilename]);

  useEffect(() => {
    if (!window.electron) {
      return;
    }

    const unsubscribe = window.electron.onExportProgress((payload) => {
      if (!exportProgressActiveRef.current) {
        return;
      }
      const stage = payload.stage;
      const normalizedStage = stage === 'Rendering frames'
        ? t('export.stageRendering')
        : stage === 'Frame-by-frame rendering'
          ? t('export.stageFrameByFrame')
        : stage === 'Encoding video'
          ? t('export.stageEncoding')
          : stage === 'Encoding video (FFmpeg)'
            ? t('export.stageEncodingFfmpeg')
            : stage === 'Encoding MOV alpha (FFmpeg)'
              ? t('export.stageEncodingMovAlpha')
            : stage === 'Encoding WebM alpha (FFmpeg)'
              ? t('export.stageEncodingWebmAlpha')
            : stage === 'Muxing audio/video'
              ? t('export.stageMuxing')
              : stage;
      setExportProgress({ ...payload, stage: normalizedStage });
    });

    return unsubscribe;
  }, [t]);

  const handleOpenExportModal = useCallback(async () => {
    if (!window.electron) {
      alert(t('export.clientOnly'));
      return;
    }

    const paths = await loadExportPaths();
    const defaults = getDefaultExportRange();
    if (!exportRangeTouchedRef.current) {
      setExportRange((prev) => (isSameRange(prev, defaults) ? prev : defaults));
    }
    if (paths?.suggestedPath && !exportOutputPath) {
      setExportOutputPath(paths.suggestedPath);
    }
    if (window.electron) {
      try {
        const info = await window.electron.getRenderCacheInfo();
        setRenderCacheInfo(info);
      } catch (error) {
        console.error('Failed to load render cache info:', error);
      }
    }
    setExportStatusMessage(t('export.statusIdle'));
    setShowExportModal(true);
  }, [exportOutputPath, getDefaultExportRange, loadExportPaths, t]);

  const handleClearRenderCache = useCallback(async (type: 'remote-assets' | 'remotion-temp') => {
    if (!window.electron || isExporting) {
      return;
    }
    try {
      await window.electron.clearRenderCache(type);
      const info = await window.electron.getRenderCacheInfo();
      setRenderCacheInfo(info);
      setExportStatusMessage(type === 'remote-assets' ? t('export.cacheClearedRemote') : t('export.cacheClearedTemp'));
    } catch (error) {
      console.error('Failed to clear render cache:', error);
      setExportStatusMessage(t('export.cacheClearFailed'));
    }
  }, [isExporting, t]);

  const handleChooseExportPath = useCallback(async () => {
    if (!window.electron) return;
    const result = await window.electron.showOpenDialog({
      title: t('export.title'),
      defaultPath: exportOutputPath || quickSavePath,
      properties: ['openDirectory', 'createDirectory']
    });

    if (!result.canceled && result.filePaths?.[0]) {
      setExportOutputPath(result.filePaths[0]);
    }
  }, [exportOutputPath, quickSavePath, t]);

  const handleStartExport = useCallback(async () => {
    if (!window.electron) {
      alert(t('export.clientOnly'));
      return;
    }

    let trimmedPath = exportOutputPath.trim();
    if (!trimmedPath) {
      setExportStatusMessage(t('export.pathRequired'));
      return;
    }

    const filename = generateFilename(filenameTemplate, customFilename, exportFormat);
    trimmedPath = applyFilenameTemplateToPath(trimmedPath, filename);

    if (exportRange.end <= exportRange.start) {
      setExportStatusMessage(t('export.invalidRange'));
      return;
    }

    setIsExporting(true);
    exportProgressActiveRef.current = true;
    setLastExportOutputPath(trimmedPath);
    setLastExportSucceeded(false);
    setExportProgress({ progress: 0, elapsedMs: 0, estimatedRemainingMs: null, stage: t('export.preparing') });
    setExportStatusMessage(t('export.preparing'));

    try {
      const slideIntrinsicSizeOverrides = await ensureBackgroundSlideIntrinsicSizes();
      const crf = calculateCRF(exportQuality);
      const preset = calculateX264Preset(exportQuality);
      
      const res = await window.electron.exportVideo({
        ...getExportConfig(slideIntrinsicSizeOverrides),
        outputPath: trimmedPath,
        exportRange,
        exportQuality,
        exportHardware,
        exportFormat,
        exportLogEnabled,
        crf,
        x264Preset: preset
      });

      if (res.success) {
        setLastExportSucceeded(true);
        setExportStatusMessage(res.message || t('app.exportSuccess'));
        showToast(t(res.placeholder ? 'app.exportPlaceholder' : 'app.exportSuccess'));
      } else {
        setLastExportSucceeded(false);
        const errorMsg = res.error || t('export.failed');
        setExportStatusMessage(errorMsg);
        showToast(errorMsg);
      }
    } catch (error: any) {
      setLastExportSucceeded(false);
      const errorMsg = `${t('export.failed')}: ${error.message}`;
      setExportStatusMessage(errorMsg);
      showToast(errorMsg);
    } finally {
      setIsExporting(false);
      exportProgressActiveRef.current = false;
    }
  }, [exportOutputPath, exportRange, exportQuality, exportHardware, exportFormat, exportLogEnabled, filenameTemplate, customFilename, getExportConfig, showToast, t, generateFilename, calculateCRF, calculateX264Preset, ensureBackgroundSlideIntrinsicSizes]);

  const handleRevealExport = useCallback(async () => {
    const targetPath = lastExportOutputPath || exportOutputPath.trim();
    if (!window.electron || !targetPath) return;
    await window.electron.showItemInFolder(targetPath);
  }, [exportOutputPath, lastExportOutputPath]);

  const exportConfig = () => {
    const finalConfig = getProjectConfig();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(finalConfig, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "pomchat_project.pomchat");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  // Drag Resizing Logic
  const startResizing = (e: React.MouseEvent, type: 'subtitle' | 'settings') => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = type === 'subtitle' ? subtitleWidth : settingsWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      
      // Determine direction based on position
      if (type === 'subtitle') {
        // Subtitle is ALWAYS on the left
        const newWidth = Math.max(200, Math.min(600, startWidth + delta));
        setSubtitleWidth(newWidth);
      } else {
        // Settings could be left or right
        if (settingsPosition === 'left') {
           // It's on the left, but after Subtitle if both are left
           // Actually, if settings is left, it's on the left side of the main workspace
           const newWidth = Math.max(250, Math.min(600, startWidth + delta));
           setSettingsWidth(newWidth);
        } else {
           // Settings on the right
           const newWidth = Math.max(250, Math.min(600, startWidth - delta));
           setSettingsWidth(newWidth);
        }
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  const startMobileBottomResizePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setIsMobileBottomResizeActive(true);
    const startY = e.clientY;
    const startHeight = mobileBottomPanelHeight;

    const onPointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const delta = startY - moveEvent.clientY;
      const next = Math.max(220, Math.min(560, startHeight + delta));
      setMobileBottomPanelHeight(next);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      document.body.style.touchAction = '';
      setIsMobileBottomResizeActive(false);
    };

    document.body.style.touchAction = 'none';
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const toFsServePath = (localPath: string) => {
    const normalized = localPath.replace(/\\/g, '/');

    if (/^[a-zA-Z]:\//.test(normalized)) {
      const [drive, ...segments] = normalized.split('/');
      return `file:///${drive}/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
    }

    if (normalized.startsWith('//')) {
      const [host, ...segments] = normalized.replace(/^\/\//, '').split('/');
      return `file://${host}/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
    }

    const segments = normalized.split('/');
    return `file://${segments.map((segment, index) => (index === 0 ? segment : `/${encodeURIComponent(segment)}`)).join('')}`;
  };

  const toFilePreviewPath = (localPath: string) => {
    const normalized = localPath.replace(/\\/g, '/');
    if (/^[a-zA-Z]:\//.test(normalized)) {
      const [drive, ...segments] = normalized.split('/');
      return `file:///${drive}/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
    }
    if (normalized.startsWith('//')) {
      const [host, ...segments] = normalized.replace(/^\/\//, '').split('/');
      return `file://${host}/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
    }
    const segments = normalized.split('/');
    return `file://${segments.map((segment, index) => (index === 0 ? segment : encodeURIComponent(segment))).join('/')}`;
  };

  const resolveLocalPreviewPath = (path: string | undefined): string | undefined => {
    if (!path) return path;
    const trimmed = path.trim();
    if (!trimmed) return undefined;
    const useFilePreviewPath = typeof window !== 'undefined' && Boolean(window.electron);
    if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
    if (trimmed.startsWith('file://')) {
      try {
        const url = new URL(trimmed);
        const host = url.host ? `//${url.host}` : '';
        const pathname = decodeURIComponent(url.pathname);
        const normalizedPath = /^\/[a-zA-Z]:\//.test(pathname) ? pathname.slice(1) : pathname;
        return useFilePreviewPath ? toFilePreviewPath(`${host}${normalizedPath}`) : toFsServePath(`${host}${normalizedPath}`);
      } catch {
        const fallbackPath = trimmed.replace(/^file:\/\/?/, '/');
        return useFilePreviewPath ? toFilePreviewPath(fallbackPath) : toFsServePath(fallbackPath);
      }
    }
    if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
    if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return useFilePreviewPath ? toFilePreviewPath(trimmed) : toFsServePath(trimmed);
    if (trimmed.startsWith('\\\\')) return useFilePreviewPath ? toFilePreviewPath(trimmed) : toFsServePath(trimmed);
    if (trimmed.startsWith('/') && !trimmed.startsWith('/projects/') && !trimmed.startsWith('/assets/')) return useFilePreviewPath ? toFilePreviewPath(trimmed) : toFsServePath(trimmed);
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  };

  const detectVideoMediaInfo = useCallback(async (src: string) => {
    return await new Promise<{ hasAudio: boolean; duration: number | null }>((resolve) => {
      const video = document.createElement('video');
      let done = false;
      const finish = (value: boolean) => {
        if (done) return;
        done = true;
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
        video.src = '';
        resolve({ hasAudio: value, duration });
      };

      const timeout = window.setTimeout(() => finish(false), 2500);
      video.preload = 'metadata';
      video.muted = true;
      video.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        const directTrack = Boolean((video as any).mozHasAudio)
          || ((video as any).audioTracks && (video as any).audioTracks.length > 0)
          || ((video as any).webkitAudioDecodedByteCount && (video as any).webkitAudioDecodedByteCount > 0);

        if (directTrack) {
          finish(true);
          return;
        }

        try {
          const stream = (video as any).captureStream?.();
          finish(Boolean(stream && stream.getAudioTracks().length > 0));
        } catch (_error) {
          finish(false);
        }
      };
      video.onerror = () => {
        window.clearTimeout(timeout);
        finish(false);
      };
      video.src = src;
    });
  }, []);

  const resolvePath = (path: string | undefined): string | undefined => {
    if (!path) return undefined;

    const trimmed = path.trim();
    if (!trimmed) return undefined;

    if (cachedRemoteAssets[trimmed]) {
      return resolveLocalPreviewPath(cachedRemoteAssets[trimmed]);
    }

    return resolveLocalPreviewPath(trimmed);
  };

  useEffect(() => {
    if (!window.electron) {
      return;
    }

    const urls = [
      config.background?.image,
      ...(config.background?.slides || []).map((slide: BackgroundSlideItem) => slide?.image),
      ...Object.values(config.speakers || {}).map((speaker: any) => speaker?.avatar)
    ].filter((value): value is string => Boolean(value) && /^https?:\/\//i.test(value));

    if (!urls.length) {
      return;
    }

    let cancelled = false;

    const cacheAssets = async () => {
      for (const url of urls) {
        if (cachedRemoteAssets[url]) {
          continue;
        }
        try {
          const cachedPath = await window.electron.cacheRemoteAsset(url);
          if (!cancelled && cachedPath) {
            setCachedRemoteAssets((prev) => (prev[url] === cachedPath ? prev : { ...prev, [url]: cachedPath }));
          }
        } catch (error) {
          console.warn('Failed to cache remote asset:', url, error);
        }
      }
    };

    cacheAssets();

    return () => {
      cancelled = true;
    };
  }, [config.background?.image, config.background?.slides, config.speakers, cachedRemoteAssets]);

  const resolvedAudioPath = webAudioObjectUrl || resolvePath(config.audioPath) || '';
  const backgroundSlides = Array.isArray(config.background?.slides) ? config.background.slides : [];
  const activeInsertImageSlide = backgroundSlides.find((slide: BackgroundSlideItem) => slide.id === activeInsertImageId) || null;
  const enterInsertImageEditMode = useCallback((id: string) => {
    setActiveInsertImageId(id);
    setIsInsertImageEditMode(true);
  }, []);
  const focusInsertImageSettings = useCallback(() => {
    setFocusInsertImageSettingsKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!isInsertImageEditMode || !activeInsertImageSlide) {
      return;
    }

    const editModeTimeEpsilon = 1 / Math.max(1, config.fps || 60);
    if (currentTime < (activeInsertImageSlide.start - editModeTimeEpsilon) || currentTime > (activeInsertImageSlide.end + editModeTimeEpsilon)) {
      setIsInsertImageEditMode(false);
    }
  }, [activeInsertImageSlide, config.fps, currentTime, isInsertImageEditMode]);

  const activeInsertImageBounds = useMemo(() => {
    if (!activeInsertImageSlide) {
      return null;
    }
    const editBox = slideEditBoxes[activeInsertImageSlide.id];
    if (editBox) {
      return {
        left: editBox.centerX - editBox.width / 2,
        top: editBox.centerY - editBox.height / 2,
        width: editBox.width,
        height: editBox.height,
      };
    }
    return getPreviewSlideBounds(activeInsertImageSlide, canvasWidth, canvasHeight);
  }, [activeInsertImageSlide, canvasWidth, canvasHeight, slideEditBoxes]);
  const updateSlideEditBox = useCallback((slideId: string, box: { centerX: number; centerY: number; width: number; height: number }) => {
    if (!Number.isFinite(box.width) || !Number.isFinite(box.height) || box.width <= 1 || box.height <= 1) {
      return;
    }
    setSlideEditBoxes((prev) => {
      const current = prev[slideId];
      if (current && current.centerX === box.centerX && current.centerY === box.centerY && current.width === box.width && current.height === box.height) {
        return prev;
      }
      return { ...prev, [slideId]: box };
    });
  }, []);
  const updateSlideIntrinsicSize = useCallback((slideId: string, width: number, height: number) => {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return;
    }
    setConfig((prev: any) => {
      const slides = Array.isArray(prev?.background?.slides) ? prev.background.slides : [];
      let changed = false;
      const nextSlides = slides.map((slide: any) => {
        if (slide.id !== slideId) return slide;
        if (slide.intrinsicWidth === width && slide.intrinsicHeight === height) return slide;
        changed = true;
        return { ...slide, intrinsicWidth: width, intrinsicHeight: height };
      });
      if (!changed) return prev;
      return {
        ...prev,
        background: {
          ...(prev?.background || DEFAULT_PROJECT_CONFIG.background),
          slides: nextSlides,
        }
      };
    });
  }, [setConfig]);
  useEffect(() => {
    if (!activeInsertImageSlide?.id) return;
    setSlideEditBoxes((prev) => {
      const current = prev[activeInsertImageSlide.id];
      if (!current) {
        return prev;
      }
      if (current.width > 1 && current.height > 1) {
        return prev;
      }
      const next = { ...prev };
      delete next[activeInsertImageSlide.id];
      return next;
    });
  }, [activeInsertImageSlide?.id, activeInsertImageSlide?.image]);

  const getBackgroundObjectPosition = (position?: string) => {
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
  };

  const getBackgroundObjectFit = (fit?: string) => {
    if (fit === 'contain' || fit === 'fill') {
      return fit;
    }
    return 'cover';
  };

  const validateProjectConfig = (parsed: any) => {
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(t('dialog.invalidConfigNotObject'));
    }
    
    const requiredKeys = ['fps', 'dimensions', 'audioPath', 'assPath', 'speakers'];
    for (const key of requiredKeys) {
      if (parsed[key] === undefined) {
        throw new Error(t('dialog.invalidConfigMissingField', { key }));
      }
    }
    
    if (typeof parsed.dimensions !== 'object' || !parsed.dimensions.width || !parsed.dimensions.height) {
      throw new Error(t('dialog.invalidConfigBadDimensions'));
    }

    if (typeof parsed.speakers !== 'object') {
      throw new Error(t('dialog.invalidConfigBadSpeakers'));
    }

    // 默认值合并（兼容旧版本或缺失非必填字段的配置）
    return sanitizeProjectConfig(parsed);
  };

  const handleNewProject = async (initialOverrides?: any) => {
    const safeOverrides = sanitizeProjectOverrides(initialOverrides);
    if (!window.electron) {
      setWebAssContent(null);
      if (webAudioObjectUrl) {
        URL.revokeObjectURL(webAudioObjectUrl);
        setWebAudioObjectUrl('');
      }
    }
    if (!window.electron) {
      // Web mode fallback
      setProjectPath('web-demo');
      const cleanConfig = { ...createBlankProjectConfig(t('app.newProject')), ...safeOverrides };
      clearHistory();
      clearProjectDirty();
      setConfig((prev: any) => ({
        ...cleanConfig,
        ui: prev?.ui || DEFAULT_UI_CONFIG
      }));
      setShowSettings(true);
      return;
    }
    
    try {
      const result = await window.electron.showSaveDialog({
        title: t('dialog.newProjectTitle'),
        defaultPath: t('dialog.defaultProjectFilename'),
        filters: [{ name: t('dialog.filterProject'), extensions: ['pomchat', 'json'] }]
      });
      
      if (!result.canceled && result.filePath) {
        const newConfig = { ...createBlankProjectConfig(t('app.newProject')), ...safeOverrides };
        await window.electron.writeFile(result.filePath, JSON.stringify(newConfig, null, 2));
        clearHistory();
        clearProjectDirty();
        setProjectPath(result.filePath);
        rememberRecentProject(result.filePath);
        if (!window.electron) {
          localStorage.setItem(STORAGE_KEY + '_recent_project', result.filePath);
        }
        setConfig((prev: any) => ({
          ...newConfig,
          ui: {
            ...(prev?.ui || DEFAULT_UI_CONFIG),
            recentProject: result.filePath
          }
        }));
        savedSpeakerNamesRef.current = getSpeakerNameSnapshot(newConfig.speakers);
        setShowSettings(true);
        showToast(t('welcome.new'));
      }
    } catch (e: any) {
      alert(`${t('dialog.errorCreateProjectFailed')}: ${e.message}`);
    }
  };

  const handleCloseProject = () => {
    clearHistory();
    clearProjectDirty();
    setProjectPath(null);
    setShowSettings(false);
    if (!window.electron) {
      setWebAssContent(null);
      if (webAudioObjectUrl) {
        URL.revokeObjectURL(webAudioObjectUrl);
        setWebAudioObjectUrl('');
      }
    }
    document.title = 'PomChat Studio';
  };

  const handleSetAudio = async () => {
    if (!window.electron) {
      webAudioInputRef.current?.click();
      return;
    }
    try {
      const res = await window.electron.showOpenDialog({
        title: t('dialog.selectAudioTitle'),
        filters: [{ name: t('dialog.filterAudio'), extensions: ['mp3', 'wav', 'aac', 'm4a', 'flac'] }],
        properties: ['openFile']
      });
      if (!res.canceled && res.filePaths.length > 0) {
        applyTrackedConfigUpdater((prev: any) => ({ ...prev, audioPath: res.filePaths[0] }));
        showToast(t('app.audioUpdated'));
      }
    } catch (e: any) {
      alert(`${t('dialog.errorSelectAudioFailed')}: ${e.message}`);
    }
  };

  const handleSetSubtitle = async () => {
    if (!window.electron) {
      webSubtitleInputRef.current?.click();
      return;
    }
    try {
      const res = await window.electron.showOpenDialog({
        title: t('dialog.selectSubtitleTitle'),
        filters: [{ name: t('dialog.filterSubtitle'), extensions: ['ass', 'srt', 'lrc'] }],
        properties: ['openFile']
      });
      if (!res.canceled && res.filePaths.length > 0) {
        const path = res.filePaths[0];
        const content = await window.electron.readFile(path);
        const lower = path.toLowerCase();
        if (lower.endsWith('.ass')) {
          setImportAssData({ path, content });
        } else {
          const rows = lower.endsWith('.srt') ? parseSrtSubtitles(content) : parseLrcSubtitles(content);
          const projectContent = buildPlainSubtitleProjectContent(rows, config.speakers);
          applyTrackedConfigUpdater((prev: any) => ({
            ...prev,
            assPath: '',
            subtitleFormat: lower.endsWith('.srt') ? 'srt' : 'lrc',
            content: projectContent
          }));
          setWebAssContent(null);
          showToast(t('app.subtitleImported'));
        }
      }
    } catch (e: any) {
      alert(`${t('dialog.errorSelectSubtitleFailed')}: ${e.message}`);
    }
  };

  const handleClearAudio = useCallback(() => {
    const previousWebAudioObjectUrl = webAudioObjectUrl;

    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }

    setWebAudioObjectUrl('');
    applyTrackedConfigUpdater((prev: any) => ({ ...prev, audioPath: '' }));
    if (previousWebAudioObjectUrl) {
      window.setTimeout(() => URL.revokeObjectURL(previousWebAudioObjectUrl), 0);
    }
    showToast(t('app.audioCleared'));
  }, [applyTrackedConfigUpdater, showToast, t, webAudioObjectUrl]);

  const handleClearSubtitle = useCallback(() => {
    setWebAssContent(null);
    applyTrackedConfigUpdater((prev: any) => ({
      ...prev,
      assPath: '',
      content: []
    }));
    showToast(t('app.subtitleCleared'));
  }, [applyTrackedConfigUpdater, showToast, t]);

  const importFileByPath = useCallback(async (filePath: string, currentProjectPath: string | null) => {
    if (!window.electron || !filePath) return;

    const normalizedPath = filePath.toLowerCase();
    const isJson = normalizedPath.endsWith('.json') || normalizedPath.endsWith('.pomchat');
    const isAss = normalizedPath.endsWith('.ass');
    const isSrt = normalizedPath.endsWith('.srt');
    const isLrc = normalizedPath.endsWith('.lrc');
    const isVideo = /\.(mp4|webm|mov|mkv)$/i.test(normalizedPath);
    const isImage = /\.(png|jpg|jpeg|webp|gif)$/i.test(normalizedPath);
    const isAudio = /(\.mp3|\.wav|\.aac|\.m4a|\.flac|\.ogg|\.opus)$/i.test(normalizedPath);

    if (isJson) {
      await loadProjectFromPath(filePath);
      showToast(t('app.projectImported'));
      return;
    }

    if (!isAss && !isSrt && !isLrc && !isAudio && !isImage && !isVideo) {
      showToast(t('app.dropUnsupported'));
      return;
    }

    if (!currentProjectPath) {
      // 位于欢迎页时，先询问新建项目，然后注入对应的路径
      const overrides: any = {};
      if (isAudio) overrides.audioPath = filePath;
      if (isImage || isVideo) overrides.background = { ...(DEFAULT_PROJECT_CONFIG.background || {}), image: filePath };
      
      const result = await window.electron.showSaveDialog({
        title: t('dialog.newProjectTitle'),
        defaultPath: t('dialog.defaultProjectFilename'),
        filters: [{ name: t('dialog.filterProject'), extensions: ['pomchat', 'json'] }]
      });
      
      if (result.canceled || !result.filePath) return;
      
      const newConfig = { ...createBlankProjectConfig(t('app.newProject')), ...overrides };
      await window.electron.writeFile(result.filePath, JSON.stringify(newConfig, null, 2));
      
      setProjectPath(result.filePath);
      rememberRecentProject(result.filePath);
      localStorage.setItem('pomchat_recent_project', result.filePath);
      setConfig((prev: any) => ({
        ...newConfig,
        ui: {
          ...(prev?.ui || DEFAULT_UI_CONFIG),
          recentProject: result.filePath
        }
      }));
      savedSpeakerNamesRef.current = Object.fromEntries(Object.entries(newConfig.speakers || {}).map(([key, speaker]: [string, any]) => [key, speaker?.name || '']));
      setShowSettings(true);
      showToast(t('welcome.new'));

      if (isAss || isSrt || isLrc) {
        const content = await window.electron.readFile(filePath);
        if (isAss) {
          setImportAssData({ path: filePath, content });
        } else {
          const rows = isSrt ? parseSrtSubtitles(content) : parseLrcSubtitles(content);
          const projectContent = buildPlainSubtitleProjectContent(rows, newConfig.speakers || {});
          setConfig((prev: any) => ({
            ...prev,
            subtitleFormat: isSrt ? 'srt' : 'lrc',
            assPath: '',
            content: projectContent,
            ui: {
              ...(prev?.ui || DEFAULT_UI_CONFIG),
              recentProject: result.filePath
            }
          }));
          showToast(t('app.subtitleImported'));
        }
      }

      if (isImage || isVideo) {
        setConfig((prev: any) => ({
            ...prev,
            background: {
              ...(prev?.background || DEFAULT_PROJECT_CONFIG.background),
              image: filePath,
              duration: isVideo ? prev?.background?.duration : undefined
            },
          ui: {
            ...(prev?.ui || DEFAULT_UI_CONFIG),
            recentProject: result.filePath
          }
        }));
        showToast(t('app.imageImported'));

        if (isVideo) {
          const mediaInfo = await detectVideoMediaInfo(toFsServePath(filePath));
          if (mediaInfo.duration) {
            setConfig((prev: any) => ({
              ...prev,
              background: {
                ...(prev?.background || DEFAULT_PROJECT_CONFIG.background),
                duration: mediaInfo.duration
              }
            }));
          }
          const shouldUseVideoAudio = window.confirm(t('app.videoAudioPrompt'));
          if (shouldUseVideoAudio) {
            setConfig((prev: any) => ({ ...prev, audioPath: filePath }));
            showToast(t('app.audioImported'));
          }
        }
      }
      return;
    }

    if (isAss) {
      const content = await window.electron.readFile(filePath);
      setImportAssData({ path: filePath, content });
      showToast(t('app.assImported'));
      return;
    }

    if (isSrt || isLrc) {
      const content = await window.electron.readFile(filePath);
      const rows = isSrt ? parseSrtSubtitles(content) : parseLrcSubtitles(content);
      const projectContent = buildPlainSubtitleProjectContent(rows, config.speakers);
      applyTrackedConfigUpdater((prev: any) => ({
        ...prev,
        subtitleFormat: isSrt ? 'srt' : 'lrc',
        assPath: '',
        content: projectContent
      }));
      setWebAssContent(null);
      showToast(t('app.subtitleImported'));
      return;
    }

    if (isAudio) {
      applyTrackedConfigUpdater((prev: any) => ({ ...prev, audioPath: filePath }));
      showToast(t('app.audioImported'));
      return;
    }

    if (isImage || isVideo) {
      applyTrackedConfigUpdater((prev: any) => ({
        ...prev,
        background: {
          ...(prev?.background || DEFAULT_PROJECT_CONFIG.background),
          image: filePath,
          duration: isVideo ? prev?.background?.duration : undefined
        }
      }));
      showToast(t('app.imageImported'));

      if (isVideo) {
        const mediaInfo = await detectVideoMediaInfo(toFsServePath(filePath));
        applyTrackedConfigUpdater((prev: any) => ({
          ...prev,
          background: {
            ...(prev?.background || DEFAULT_PROJECT_CONFIG.background),
            image: filePath,
            duration: mediaInfo.duration ?? prev?.background?.duration
          }
        }));

        const shouldUseVideoAudio = window.confirm(t('app.videoAudioPrompt'));
        if (shouldUseVideoAudio) {
          applyTrackedConfigUpdater((prev: any) => ({ ...prev, audioPath: filePath }));
          showToast(t('app.audioImported'));
        }
      }
      return;
    }
  }, [applyTrackedConfigUpdater, config.speakers, detectVideoMediaInfo, presets, showToast, t]);


  const handleSelectImage = async (): Promise<string | null> => {
    if (!window.electron) {
      alert(t('dialog.webImageInputOnly'));
      return null;
    }
    try {
      const res = await window.electron.showOpenDialog({
        title: t('dialog.selectImageTitle'),
        filters: [{ name: t('dialog.filterMedia'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov', 'mkv'] }],
        properties: ['openFile']
      });
      if (!res.canceled && res.filePaths.length > 0) {
        const filePath = res.filePaths[0];
        
        if (/\.(mp4|webm|mov|mkv)$/i.test(filePath)) {
          const shouldUseVideoAudio = window.confirm(t('app.videoAudioPrompt'));
          if (shouldUseVideoAudio) {
            applyTrackedConfigUpdater((prev: any) => ({ ...prev, audioPath: filePath }));
            showToast(t('app.audioImported'));
          }
        }
        
        return filePath;
      }
    } catch (e: any) {
      alert(`${t('dialog.errorSelectImageFailed')}: ${e.message}`);
    }
    return null;
  };

  const loadProjectFromPath = async (filePath: string) => {
    try {
      const content = await window.electron.readFile(filePath);
      const parsed = JSON.parse(content);
      const validatedConfig = validateProjectConfig(parsed);
      const normalizedConfig = validatedConfig.subtitleFormat
        ? validatedConfig
        : { ...validatedConfig, subtitleFormat: validatedConfig.assPath ? 'ass' : (validatedConfig.content?.length ? 'srt' : 'ass') };
      const shouldUseAssSource = !window.electron && normalizedConfig.subtitleFormat === 'ass' && Boolean(normalizedConfig.assPath);
      
      setProjectPath(filePath);
      rememberRecentProject(filePath);
      clearHistory();
      clearProjectDirty();
      if (!window.electron) {
        localStorage.setItem(STORAGE_KEY + '_recent_project', filePath);
      }
      setConfig((prev: any) => ({
        ...normalizedConfig,
        ui: {
          ...(prev?.ui || DEFAULT_UI_CONFIG),
          recentProject: filePath
        }
      }));
      setWebAssContent(shouldUseAssSource ? normalizedConfig.assPath : null);
      setIsMobileBottomPanelExpanded(false);
      savedSpeakerNamesRef.current = getSpeakerNameSnapshot(normalizedConfig.speakers);
      setShowSettings(true);
      showToast(t('app.projectLoaded'));
    } catch (e: any) {
      alert(`${t('dialog.errorLoadFailed')}: ${e.message}`);
      if (filePath === recentProject) {
        setRecentProject(null);
        if (!window.electron) {
          localStorage.removeItem(STORAGE_KEY + '_recent_project');
        }
      }
    }
  };

  const handleOpenProject = async () => {
    if (!window.electron) {
      webProjectInputRef.current?.click();
      return;
    }

    try {
      const result = await window.electron.showOpenDialog({
        title: t('dialog.openProjectTitle'),
        filters: [{ name: t('dialog.filterProject'), extensions: ['pomchat', 'json'] }],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        await loadProjectFromPath(result.filePaths[0]);
      }
    } catch (e: any) {
      alert(`${t('dialog.errorSelectFileFailed')}: ${e.message}`);
    }
  };

  const handleWebAudioSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const nextObjectUrl = URL.createObjectURL(file);
    if (webAudioObjectUrl) {
      URL.revokeObjectURL(webAudioObjectUrl);
    }

    if (!projectPath) {
      setProjectPath('web-demo');
      setShowSettings(true);
    }

    setWebAudioObjectUrl(nextObjectUrl);
    applyTrackedConfigUpdater((prev: any) => ({ ...prev, audioPath: nextObjectUrl }));
    showToast(t('app.audioImported'));
    event.target.value = '';
  };

  const handleWebSubtitleSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const content = await file.text();
    if (!projectPath) {
      setProjectPath('web-demo');
      setShowSettings(true);
    }

    const normalizedName = file.name.toLowerCase();
    if (normalizedName.endsWith('.ass')) {
      setImportAssData({ path: file.name, content });
    } else if (normalizedName.endsWith('.srt') || normalizedName.endsWith('.lrc')) {
      const rows = normalizedName.endsWith('.srt') ? parseSrtSubtitles(content) : parseLrcSubtitles(content);
      const projectContent = buildPlainSubtitleProjectContent(rows, config.speakers);
      applyTrackedConfigUpdater((prev: any) => ({
        ...prev,
        subtitleFormat: normalizedName.endsWith('.srt') ? 'srt' : 'lrc',
        assPath: '',
        content: projectContent
      }));
      setWebAssContent(null);
      showToast(t('app.subtitleImported'));
    } else {
      showToast(t('app.dropUnsupported'));
    }
    event.target.value = '';
  };

  const handleWebPresetSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const parsed = JSON.parse(content);
      const existing = { ...presets };
      const existingAnnotationPresets = { ...annotationPresets };
      const imported: Record<string, any> = {};
      const importedAnnotations: Record<string, any> = {};

      if (parsed?.speakers && typeof parsed.speakers === 'object') {
        Object.entries(parsed.speakers).forEach(([speakerKey, speaker]: [string, any]) => {
          const baseName = speaker?.name || speakerKey;
          let presetName = baseName;
          let counter = 2;
          while (existing[presetName] || imported[presetName]) {
            presetName = `${baseName} (${counter})`;
            counter += 1;
          }
          imported[presetName] = {
            style: JSON.parse(JSON.stringify(speaker?.style || {})),
            avatar: speaker?.avatar || ''
          };
        });
      }

      if (parsed?.annotations && typeof parsed.annotations === 'object') {
        Object.entries(parsed.annotations).forEach(([presetName, presetValue]) => {
          let nextName = presetName;
          let counter = 2;
          while (existingAnnotationPresets[nextName] || importedAnnotations[nextName]) {
            nextName = `${presetName} (${counter})`;
            counter += 1;
          }
          importedAnnotations[nextName] = presetValue;
        });
      }

      if (parsed && typeof parsed === 'object' && !parsed.speakers) {
        Object.entries(parsed).forEach(([presetName, presetValue]) => {
          imported[presetName] = presetValue;
        });
      }

      const speakerCount = parsed?.speakers && typeof parsed.speakers === 'object'
        ? Object.keys(parsed.speakers).length
        : 0;
      const presetCount = Object.keys(imported).length;
      const annotationPresetCount = Object.keys(importedAnnotations).length;
      if (presetCount === 0 && annotationPresetCount === 0) {
        showToast(t('app.dropUnsupported'));
        return;
      }

      const confirmed = window.confirm(t('app.presetsImportConfirm', { presetCount: presetCount + annotationPresetCount, speakerCount }));
      if (!confirmed) {
        return;
      }

      pushHistorySnapshot();
      setPresets({ ...existing, ...imported });
      setAnnotationPresets({ ...existingAnnotationPresets, ...importedAnnotations });
      markProjectDirty();
      showToast(t('app.presetsImported'));
    } catch (error) {
      console.error('Failed to import presets:', error);
      showToast(t('app.dropUnsupported'));
    } finally {
      event.target.value = '';
    }
  };

  const importWebFile = useCallback(async (file: File, currentProjectPath: string | null) => {
    const normalizedName = file.name.toLowerCase();
    const isJson = normalizedName.endsWith('.json') || normalizedName.endsWith('.pomchat');
    const isAss = normalizedName.endsWith('.ass');
    const isSrt = normalizedName.endsWith('.srt');
    const isLrc = normalizedName.endsWith('.lrc');
    const isVideo = /\.(mp4|webm|mov|mkv)$/i.test(normalizedName);
    const isImage = /\.(png|jpg|jpeg|webp|gif)$/i.test(normalizedName);
    const isAudio = /\.(mp3|wav|aac|m4a|flac|ogg|opus)$/i.test(normalizedName);

    if (isJson) {
      try {
        const content = await file.text();
        const parsed = JSON.parse(content);
        const validatedConfig = validateProjectConfig(parsed);
        const normalizedConfig = validatedConfig.subtitleFormat
          ? validatedConfig
          : { ...validatedConfig, subtitleFormat: validatedConfig.assPath ? 'ass' : (validatedConfig.content?.length ? 'srt' : 'ass') };
        const shouldUseAssSource = normalizedConfig.subtitleFormat === 'ass' && Boolean(normalizedConfig.assPath);
        setProjectPath('web-demo');
        rememberRecentProject(file.name);
        clearHistory();
        clearProjectDirty();
        setConfig((prev: any) => ({
          ...normalizedConfig,
          ui: {
            ...(prev?.ui || DEFAULT_UI_CONFIG),
            recentProject: file.name
          }
        }));
        setWebAssContent(shouldUseAssSource ? normalizedConfig.assPath : null);
        setIsMobileBottomPanelExpanded(false);
        savedSpeakerNamesRef.current = getSpeakerNameSnapshot(normalizedConfig.speakers);
        setShowSettings(true);
        const requiresAudioReload = Boolean(normalizedConfig.audioPath);
        if (requiresAudioReload) {
          setConfig((prev: any) => ({ ...prev, audioPath: '' }));
        }
        showToast(requiresAudioReload ? t('app.projectLoadedNeedAudio') : t('app.projectLoaded'));
      } catch (e: any) {
        alert(`${t('dialog.errorLoadFailed')}: ${e.message}`);
      }
      return;
    }

    if (isAss) {
      const content = await file.text();
      if (!currentProjectPath) {
        setProjectPath('web-demo');
        setShowSettings(true);
      }
      setImportAssData({ path: file.name, content });
      return;
    }

    if (isSrt || isLrc) {
      const content = await file.text();
      if (!currentProjectPath) {
        setProjectPath('web-demo');
        setShowSettings(true);
      }
      const rows = isSrt ? parseSrtSubtitles(content) : parseLrcSubtitles(content);
      const projectContent = buildPlainSubtitleProjectContent(rows, config.speakers);
      setConfig((prev: any) => ({
        ...prev,
        subtitleFormat: isSrt ? 'srt' : 'lrc',
        assPath: '',
        content: projectContent
      }));
      setWebAssContent(null);
      showToast(t('app.subtitleImported'));
      return;
    }

    if (isAudio) {
      const nextObjectUrl = URL.createObjectURL(file);
      if (webAudioObjectUrl) {
        URL.revokeObjectURL(webAudioObjectUrl);
      }
      if (!currentProjectPath) {
        setProjectPath('web-demo');
        setShowSettings(true);
      }
      setWebAudioObjectUrl(nextObjectUrl);
      applyTrackedConfigUpdater((prev: any) => ({ ...prev, audioPath: nextObjectUrl }));
      showToast(t('app.audioImported'));
      return;
    }

    if (isImage || isVideo) {
      const mediaObjectUrl = URL.createObjectURL(file);
      if (!currentProjectPath) {
        setProjectPath('web-demo');
        setShowSettings(true);
      }
      applyTrackedConfigUpdater((prev: any) => ({
        ...prev,
        background: {
          ...(prev?.background || DEFAULT_PROJECT_CONFIG.background),
          image: mediaObjectUrl,
          duration: isVideo ? prev?.background?.duration : undefined
        }
      }));
      showToast(t('app.imageImported'));

      if (isVideo) {
        const mediaInfo = await detectVideoMediaInfo(mediaObjectUrl);
        applyTrackedConfigUpdater((prev: any) => ({
          ...prev,
          background: {
            ...(prev?.background || DEFAULT_PROJECT_CONFIG.background),
            image: mediaObjectUrl,
            duration: mediaInfo.duration ?? prev?.background?.duration
          }
        }));

        const shouldUseVideoAudio = window.confirm(t('app.videoAudioPrompt'));
        if (shouldUseVideoAudio) {
          applyTrackedConfigUpdater((prev: any) => ({ ...prev, audioPath: mediaObjectUrl }));
          showToast(t('app.audioImported'));
        }
      }
      return;
    }

    showToast(t('app.dropUnsupported'));
  }, [applyTrackedConfigUpdater, config.speakers, detectVideoMediaInfo, showToast, t, validateProjectConfig, webAudioObjectUrl]);

  const handleSaveProject = useCallback(async (options?: { silent?: boolean }) => {
    if (!window.electron || !projectPath || projectPath === 'web-demo') {
      const finalConfig = getProjectConfig();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(finalConfig));
      rememberRecentProject(finalConfig.projectTitle || 'web-demo');
      clearProjectDirty();
      if (!options?.silent) {
        showToast(t('app.projectSaved'));
      }
      return;
    }

    try {
      await backupAssIfSpeakerNamesChanged();
      const finalConfig = getProjectConfig();
      await window.electron.writeFile(projectPath, JSON.stringify(finalConfig, null, 2));
      savedSpeakerNamesRef.current = getSpeakerNameSnapshot(config.speakers);
      clearProjectDirty();
      if (!options?.silent) {
        showToast(t('app.projectSaved'));
      }
    } catch (e: any) {
      alert(`${t('dialog.errorSaveFailed')}: ${e.message}`);
    }
  }, [backupAssIfSpeakerNamesChanged, clearProjectDirty, config.speakers, getProjectConfig, projectPath, showToast, subtitles, t]);

  const handleWebProjectSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const parsed = JSON.parse(content);
      const validatedConfig = validateProjectConfig(parsed);
      const requiresAudioReload = !window.electron && Boolean(validatedConfig.audioPath);
      const normalizedConfig = validatedConfig.subtitleFormat
        ? validatedConfig
        : { ...validatedConfig, subtitleFormat: validatedConfig.assPath ? 'ass' : (validatedConfig.content?.length ? 'srt' : 'ass') };
      const shouldUseAssSource = normalizedConfig.subtitleFormat === 'ass' && Boolean(normalizedConfig.assPath);
      setProjectPath('web-demo');
      rememberRecentProject(file.name);
      clearHistory();
      clearProjectDirty();
      setConfig((prev: any) => ({
        ...(requiresAudioReload ? { ...normalizedConfig, audioPath: '' } : normalizedConfig),
        ui: {
          ...(prev?.ui || DEFAULT_UI_CONFIG),
          recentProject: file.name
        }
      }));
      setWebAssContent(shouldUseAssSource ? normalizedConfig.assPath : null);
      setIsMobileBottomPanelExpanded(false);
      savedSpeakerNamesRef.current = getSpeakerNameSnapshot(normalizedConfig.speakers);
      setShowSettings(true);
      showToast(requiresAudioReload ? t('app.projectLoadedNeedAudio') : t('app.projectLoaded'));
    } catch (e: any) {
      alert(`${t('dialog.errorLoadFailed')}: ${e.message}`);
    } finally {
      event.target.value = '';
    }
  };

  useEffect(() => {
    if (!autoSaveProject || !isProjectDirty || !projectPath) {
      return;
    }

    const timer = window.setTimeout(() => {
      void handleSaveProject({ silent: true });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [autoSaveProject, handleSaveProject, isProjectDirty, projectChangeTick, projectPath]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = insertImageDragRef.current;
      if (!drag) return;
      const safePreviewScale = previewScale > 0 ? previewScale : 1;
      const deltaX = (event.clientX - drag.startX) / safePreviewScale;
      const deltaY = (event.clientY - drag.startY) / safePreviewScale;
      const currentDistance = drag.mode === 'scale' && previewFrameRef.current && activeInsertImageBounds
        ? (() => {
            const frameRect = previewFrameRef.current!.getBoundingClientRect();
            const centerX = frameRect.left + (activeInsertImageBounds.left + activeInsertImageBounds.width / 2) * safePreviewScale;
            const centerY = frameRect.top + (activeInsertImageBounds.top + activeInsertImageBounds.height / 2) * safePreviewScale;
            return Math.sqrt((event.clientX - centerX) ** 2 + (event.clientY - centerY) ** 2) / safePreviewScale;
          })()
        : 0;
      const currentAngle = drag.mode === 'rotate' && previewFrameRef.current && activeInsertImageBounds
        ? (() => {
            const frameRect = previewFrameRef.current!.getBoundingClientRect();
            const centerX = frameRect.left + (activeInsertImageBounds.left + activeInsertImageBounds.width / 2) * safePreviewScale;
            const centerY = frameRect.top + (activeInsertImageBounds.top + activeInsertImageBounds.height / 2) * safePreviewScale;
            return Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI;
          })()
        : 0;
      applyTrackedConfigUpdater((prev: any) => ({
        ...prev,
        background: {
          ...(prev?.background || DEFAULT_PROJECT_CONFIG.background),
          slides: (prev?.background?.slides || []).map((slide: BackgroundSlideItem) => slide.id === drag.id
            ? drag.mode === 'move'
              ? { ...slide, offsetX: Math.round(drag.initialOffsetX + deltaX), offsetY: Math.round(drag.initialOffsetY + deltaY) }
              : drag.mode === 'scale'
                ? { ...slide, scale: Math.max(0.1, Number((drag.initialScale * (Math.max(1, currentDistance) / Math.max(1, drag.initialDistance ?? 1))).toFixed(3))) }
                : { ...slide, rotation: Number((drag.initialRotation + (currentAngle - (drag.initialAngle ?? currentAngle))).toFixed(2)) }
            : slide)
        }
      }));
    };

    const handlePointerUp = () => {
      insertImageDragRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsInsertImageEditMode(false);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeInsertImageBounds, applyTrackedConfigUpdater, previewScale]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      const tag = target.tagName;
      return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        if (isEditableTarget(event.target)) {
          return;
        }
        event.preventDefault();
        undoProjectChange();
        return;
      }

      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        if (isEditableTarget(event.target)) {
          return;
        }
        event.preventDefault();
        redoProjectChange();
        return;
      }

      if (key === 's') {
        event.preventDefault();
        void handleSaveProject();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSaveProject, redoProjectChange, undoProjectChange]);

  const textClass = isDarkMode ? "text-white" : "text-gray-900";
  const canvasBg = isDarkMode ? "bg-[#111]" : "bg-gray-200/50";
  const dividerClass = isDarkMode ? "hover:opacity-100" : "hover:opacity-100";
  const defaultExportRange = getDefaultExportRange();
  const previewRenderTime = useMemo(() => {
    const fps = Math.max(1, config.fps || 60);
    return Math.round(currentTime * fps) / fps;
  }, [currentTime, config.fps]);
  const visibleBackgroundSlides = backgroundSlides.filter((slide: BackgroundSlideItem) => {
    const animationDuration = slide.animationDuration ?? 0.24;
    const instantAppearanceEpsilon = (slide.animationStyle || 'fade') === 'none' || animationDuration <= 0 ? (1 / Math.max(1, config.fps || 60)) : 0;
    const appearanceTime = Math.max(0, slide.start - ((slide.animationStyle || 'fade') === 'none' ? 0 : animationDuration) - instantAppearanceEpsilon);
    return previewRenderTime >= appearanceTime && previewRenderTime <= (slide.end + animationDuration);
  });
  const backgroundSlidesBelowChat = visibleBackgroundSlides
    .filter((slide: BackgroundSlideItem) => (slide.layer || 'background') === 'background')
    .sort((a: BackgroundSlideItem, b: BackgroundSlideItem) => (a.backgroundOrder ?? 0) - (b.backgroundOrder ?? 0));
  const backgroundSlidesAboveChat = visibleBackgroundSlides
    .filter((slide: BackgroundSlideItem) => slide.layer === 'overlay')
    .sort((a: BackgroundSlideItem, b: BackgroundSlideItem) => (a.overlayOrder ?? 0) - (b.overlayOrder ?? 0));
  const visibleAnnotations = subtitles.filter((item) => {
    const speaker = config.speakers[item.speakerId];
    if (!speaker || speaker.type !== 'annotation') return false;
    const animationStyle = config.chatLayout?.animationStyle || 'rise';
    const animationDuration = config.chatLayout?.animationDuration ?? 0.2;
    const appearanceTime = Math.max(0, item.start - (animationStyle === 'none' ? 0 : animationDuration));
    return previewRenderTime >= appearanceTime && previewRenderTime <= item.end;
  });
  const appearedMessages = useMemo(() => subtitles.filter((item) => {
    const speaker = config.speakers[item.speakerId];
    if (!speaker || speaker.type === 'annotation') return false;
    const animationStyle = config.chatLayout?.animationStyle || 'rise';
    const animationDuration = config.chatLayout?.animationDuration ?? 0.2;
    const animationLeadTime = animationStyle === 'none' ? 0 : animationDuration;
    const appearanceTime = Math.max(0, item.start - animationLeadTime);
    return previewRenderTime >= appearanceTime;
  }), [subtitles, config.speakers, config.chatLayout?.animationStyle, config.chatLayout?.animationDuration, previewRenderTime]);
  const visibleMessageRows = useMemo(() => {
    return computeInterruptedMessageRows(appearedMessages, config.speakers, config.chatLayout?.maxVisibleBubbles ?? MESSAGE_FALLBACK_COUNT);
  }, [appearedMessages, config.speakers, config.chatLayout?.maxVisibleBubbles]);
  const flatVisibleMessages = useMemo(
    () => visibleMessageRows.flatMap((row) => [row.left, row.right].filter(Boolean)),
    [visibleMessageRows]
  );
  useEffect(() => {
    const bgVideo = previewBackgroundVideoRef.current;
    const backgroundImage = config.background?.image || '';
    if (!bgVideo || !/\.(mp4|webm|mov|mkv)(\?|$)/i.test(backgroundImage)) {
      return;
    }

    const targetTime = Math.max(0, previewRenderTime);
    const drift = Math.abs((bgVideo.currentTime || 0) - targetTime);
    if (drift > 0.08) {
      try {
        bgVideo.currentTime = targetTime;
      } catch (_error) {
        // ignore not-ready seek errors
      }
    }
  }, [previewRenderTime, seekTick, isPlaying, config.background?.image]);

  useEffect(() => {
    const bgVideo = previewBackgroundVideoRef.current;
    const backgroundImage = config.background?.image || '';
    if (!bgVideo || !/\.(mp4|webm|mov|mkv)(\?|$)/i.test(backgroundImage)) {
      return;
    }

    if (isPlaying) {
      const playPromise = bgVideo.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // ignore autoplay policy errors in preview
        });
      }
    } else {
      bgVideo.pause();
    }
  }, [isPlaying, config.background?.image]);

  const previewChatLayout = useMemo(() => {
    if (!isMobileWebLayout) {
      return config.chatLayout;
    }

    const baseBubbleScale = config.chatLayout?.bubbleScale ?? 1.5;
    const baseAvatarSize = config.chatLayout?.avatarSize ?? 80;
    const baseSpeakerNameSize = config.chatLayout?.speakerNameSize ?? 22;
    return {
      ...config.chatLayout,
      bubbleScale: Math.max(0.8, baseBubbleScale * 0.78),
      avatarSize: Math.max(42, Math.round(baseAvatarSize * 0.82)),
      speakerNameSize: Math.max(12, Math.round(baseSpeakerNameSize * 0.86))
    };
  }, [config.chatLayout, isMobileWebLayout]);
  const previewChatContentWidth = Math.max(1, canvasWidth - (previewChatLayout?.paddingLeft ?? previewChatLayout?.paddingX ?? 48) - (previewChatLayout?.paddingRight ?? previewChatLayout?.paddingX ?? 48));
  const previewTrackLayout = useMemo(() => {
    const enabled = Boolean(previewChatLayout?.independentTracksEnabled);
    const trackCount = Math.max(1, Math.round(previewChatLayout?.trackCount ?? 1));
    if (!enabled || trackCount <= 1) {
      return null;
    }

    const maxVisible = previewChatLayout?.maxVisibleBubbles ?? MESSAGE_FALLBACK_COUNT;
    const tracks = Array.from({ length: trackCount }, (_, index) => ({ index, items: [] as typeof appearedMessages }));

    for (let index = 0; index < trackCount; index += 1) {
      const trackMessages = appearedMessages.filter((item) => {
        const speaker = config.speakers[item.speakerId];
        const trackIndex = Math.max(0, Math.min(trackCount - 1, (speaker?.style?.trackIndex ?? 1) - 1));
        return trackIndex === index;
      });

      tracks[index].items = trackMessages.slice(-maxVisible);
    }

    return { trackCount, tracks };
  }, [appearedMessages, config.speakers, previewChatLayout]);
  const previewTopFadeStyle = useMemo(() => {
    if (!(previewChatLayout?.topFadeEnabled ?? false)) {
      return undefined;
    }

    const fadeHeight = Math.max(20, previewChatLayout?.topFadeHeight ?? 120);
    const gradient = `linear-gradient(to bottom, transparent 0px, black ${fadeHeight}px, black 100%)`;
    return {
      WebkitMaskImage: gradient,
      maskImage: gradient,
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskSize: '100% 100%',
      maskSize: '100% 100%',
    } as React.CSSProperties;
  }, [previewChatLayout?.topFadeEnabled, previewChatLayout?.topFadeHeight]);
  const handleAppDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('application/x-pomchat-insert-image-tab')) {
      return;
    }
    if (isInsertImageEditMode) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };
  const handleAppDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('application/x-pomchat-insert-image-tab')) {
      return;
    }
    if (isInsertImageEditMode) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };
  const handleAppDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('application/x-pomchat-insert-image-tab')) {
      return;
    }
    if (isInsertImageEditMode) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files || []);

    if (!window.electron) {
      const firstFile = droppedFiles[0];
      if (firstFile) {
        void importWebFile(firstFile, projectPath);
      } else {
        showToast(t('app.dropUnsupported'));
      }
      return;
    }

    const firstFile = droppedFiles[0];
    const firstPath = firstFile ? window.electron.getDroppedFilePath(firstFile) : '';

    if (firstPath) {
      // Delay opening native dialogs to let OS drag-and-drop state machine finish
      setTimeout(() => {
        void importFileByPath(firstPath, projectPath);
      }, 100);
      return;
    }

    showToast(t('app.dropUnsupported'));
  };

  if (!projectPath) {
    return (
      <div className="relative w-full h-[100dvh]" style={{ background: appBackground, color: uiTheme.text, ['--pomchat-scrollbar-thumb' as any]: `${secondaryThemeColor}77`, ['--pomchat-scrollbar-thumb-hover' as any]: `${secondaryThemeColor}AA`, ['--pomchat-number-spin-color' as any]: secondaryThemeColor }} onDragOver={handleAppDragOver} onDragLeave={handleAppDragLeave} onDrop={handleAppDrop}>
        {!window.electron && (
          <>
            <input
              ref={webProjectInputRef}
              type="file"
              accept=".pomchat,.json,application/json"
              className="hidden"
              onChange={handleWebProjectSelected}
            />
            <input
              ref={webAudioInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.aac,.m4a,.flac"
              className="hidden"
              onChange={handleWebAudioSelected}
            />
            <input
              ref={webSubtitleInputRef}
              type="file"
              accept=".ass,.srt,.lrc,text/plain"
              className="hidden"
              onChange={handleWebSubtitleSelected}
            />
            <input
              ref={webPresetInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleWebPresetSelected}
            />
          </>
        )}
        <WelcomeScreen 
          onNewProject={handleNewProject} 
          onOpenProject={handleOpenProject} 
          onOpenRecent={(path) => {
            if (window.electron) {
              if (path) {
                void loadProjectFromPath(path);
              }
              return;
            }
            loadWebSavedProject();
          }}
          onOpenSettings={() => setShowSettings(true)}
          recentProject={recentProject}
          recentProjects={config.ui?.recentProjects ?? DEFAULT_UI_CONFIG.recentProjects}
          isDarkMode={isDarkMode} 
          language={language}
          themeColor={themeColor}
          secondaryThemeColor={secondaryThemeColor}
        />

        {showSettings && (
          <div className="absolute inset-y-0 right-0 z-[120] flex">
            <div
              className="absolute inset-0 bg-black/20"
              onClick={() => setShowSettings(false)}
            />
            <div style={{ width: shouldHideSidePanels ? Math.min(windowWidth - 24, 420) : settingsWidth }} className="relative h-full shrink-0 flex flex-col min-h-0 overflow-hidden shadow-2xl">
              <SettingsPanel
                config={config}
                onConfigChange={applyTrackedConfigChange}
                isDarkMode={isDarkMode}
                language={language}
                themeColor={themeColor}
                secondaryThemeColor={secondaryThemeColor}
                autoSaveProject={autoSaveProject}
                proxy={proxyState}
                onThemeColorChange={handleThemeColorChangeTracked}
                onSecondaryThemeColorChange={handleSecondaryThemeColorChangeTracked}
                onAutoSaveProjectChange={(enabled: boolean) => {
                  pushHistorySnapshot();
                  setAutoSaveProject(enabled);
                  markProjectDirty();
                }}
                onProxyChange={handleProxyChangeTracked}
                onLanguageChange={handleLanguageChangeTracked}
                onThemeChange={handleThemeModeChangeTracked}
                settingsPosition={settingsPosition}
                onPositionChange={handlePositionChangeTracked}
                onClose={() => setShowSettings(false)}
                onSave={handleSaveConfig}
                showToast={showToast}
                presets={presets}
                onPresetsChange={handlePresetsChangeTracked}
                annotationPresets={annotationPresets}
                onAnnotationPresetsChange={handleAnnotationPresetsChangeTracked}
                onRequestRemoveSpeaker={handleRequestRemoveSpeaker}
                globalOnly
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                onSelectImage={handleSelectImage}
                resolveAssetSrc={resolvePath}
              />
            </div>
          </div>
        )}

        {isDragOver && (
          <div className="absolute inset-0 z-[140] backdrop-blur-sm border-2 border-dashed flex items-center justify-center pointer-events-none" style={{ backgroundColor: uiTheme.accentSoft, borderColor: uiTheme.accentBorder }}>
            <div className="px-6 py-4 rounded-2xl text-sm font-medium shadow-xl" style={{ color: themeColor, border: `1px solid ${uiTheme.accentBorder}`, backgroundColor: isDarkMode ? uiTheme.panelBgElevated : uiTheme.panelBg }}>
              {t('app.dropHint')}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`w-full h-[100dvh] flex flex-col font-sans ${textClass} overflow-hidden transition-colors duration-300 relative`}
      style={{ background: appBackground, ['--pomchat-scrollbar-thumb' as any]: `${secondaryThemeColor}77`, ['--pomchat-scrollbar-thumb-hover' as any]: `${secondaryThemeColor}AA`, ['--pomchat-number-spin-color' as any]: secondaryThemeColor }}
      onDragOver={handleAppDragOver}
      onDragLeave={handleAppDragLeave}
      onDrop={handleAppDrop}

    >
      
      <MenuBar 
        shouldHideSidePanels={shouldHideSidePanels}
        isDarkMode={isDarkMode}
        projectPath={projectPath}
        assPath={config.assPath}
        projectName={config.projectTitle || t('app.untitled')}
        language={language}
        themeColor={themeColor}
        secondaryThemeColor={secondaryThemeColor}
        onNewProject={handleNewProject}
        onOpenProject={handleOpenProject}
        onSaveProject={handleSaveProject}
        onSetAudio={handleSetAudio}
        onSetSubtitle={handleSetSubtitle}
        onClearAudio={handleClearAudio}
        onClearSubtitle={handleClearSubtitle}
        onAddSubtitle={handleAddSubtitle}
        onImportPresets={handleImportPresets}
        onExportPresets={handleExportPresets}
        onSortSubtitles={handleSortSubtitles}
        onUndo={undoProjectChange}
        onRedo={redoProjectChange}
        canUndo={canUndo}
        canRedo={canRedo}
        onCloseProject={handleCloseProject}
        onExportVideo={() => {
          if (!window.electron) {
            showToast(t('welcome.webMode'));
            return;
          }
          void handleOpenExportModal();
        }}
        onExportConfig={exportConfig}
        onOpenAbout={() => setShowAboutModal(true)}
      />

      {!window.electron && (
        <>
          <input
            ref={webProjectInputRef}
            type="file"
            accept=".pomchat,.json,application/json"
            className="hidden"
            onChange={handleWebProjectSelected}
          />
          <input
            ref={webAudioInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.aac,.m4a,.flac"
            className="hidden"
            onChange={handleWebAudioSelected}
          />
          <input
            ref={webSubtitleInputRef}
            type="file"
            accept=".ass,.srt,.lrc,text/plain"
            className="hidden"
            onChange={handleWebSubtitleSelected}
          />
          <input
            ref={webPresetInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleWebPresetSelected}
          />
        </>
      )}

      <audio 
        ref={audioRef}
        className="hidden"
        src={resolvedAudioPath || undefined}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => !loop && setIsPlaying(false)}
        preload="metadata"
      />

      {/* TOP SECTION: Panels + Workspace */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        
        {/* LEFT PANELS */}
        <div className="flex h-full shrink-0 z-20 relative min-h-0">
          {!shouldHideSidePanels && showSubtitlePanel && (
            <div style={{ width: subtitleWidth }} className="h-full border-r border-gray-800 shrink-0 flex flex-col min-h-0 overflow-hidden">
              <SubtitlePanel 
                subtitles={subtitles} 
                currentTime={currentTime} 
                isDarkMode={isDarkMode} 
                language={language}
                themeColor={themeColor}
                secondaryThemeColor={secondaryThemeColor}
                speakers={config.speakers}
                onSeek={handleSeek} 
                onUpdateSubtitle={handleUpdateSubtitle}
                onDeleteSubtitle={handleDeleteSubtitle}
                onBulkDeleteSubtitles={handleBulkDeleteSubtitles}
                onBulkUpdateSpeaker={handleBulkUpdateSubtitleSpeaker}
                editingSub={editingSub}
                setEditingSub={setEditingSub}
              />
            </div>
          )}
          {!shouldHideSidePanels && showSubtitlePanel && (
            <div 
              className={`w-1 h-full cursor-col-resize shrink-0 transition-colors ${dividerClass}`}
              style={{ backgroundColor: uiTheme.border }}
              onMouseDown={(e) => startResizing(e, 'subtitle')}
            />
          )}
          
          {settingsPosition === 'left' && showSettings && !shouldHideSidePanels && (
            <div style={{ width: settingsWidth }} className="h-full shrink-0 flex flex-col min-h-0 overflow-hidden">
              <SettingsPanel 
                config={config} 
                onConfigChange={applyTrackedConfigChange} 
                isDarkMode={isDarkMode}
                language={language}
                themeColor={themeColor}
                secondaryThemeColor={secondaryThemeColor}
                autoSaveProject={autoSaveProject}
                proxy={proxyState}
                onThemeColorChange={handleThemeColorChangeTracked}
                onSecondaryThemeColorChange={handleSecondaryThemeColorChangeTracked}
                onAutoSaveProjectChange={(enabled: boolean) => {
                  pushHistorySnapshot();
                  setAutoSaveProject(enabled);
                  markProjectDirty();
                }}
                onProxyChange={handleProxyChangeTracked}
                onLanguageChange={handleLanguageChangeTracked}
                onThemeChange={handleThemeModeChangeTracked}
                settingsPosition={settingsPosition}
                onPositionChange={handlePositionChangeTracked}
                onClose={() => setShowSettings(false)}
                onSave={handleSaveProject}
                showToast={showToast}
                presets={presets}
                   onPresetsChange={handlePresetsChangeTracked}
                   annotationPresets={annotationPresets}
                   onAnnotationPresetsChange={handleAnnotationPresetsChangeTracked}
                   onRequestRemoveSpeaker={handleRequestRemoveSpeaker}
                   activeTab={activeTab}
                   setActiveTab={setActiveTab}
                   onSelectImage={handleSelectImage}
                   onSeek={handleSeek}
                   currentTime={previewRenderTime}
                   activeInsertImageId={activeInsertImageId}
                   focusInsertImageSettingsKey={focusInsertImageSettingsKey}
                   onActiveInsertImageChange={setActiveInsertImageId}
                    onEditInsertImage={(id) => {
                      enterInsertImageEditMode(id);
                      focusInsertImageSettings();
                    }}
                   resolveAssetSrc={resolvePath}
                  />
            </div>
          )}
          {settingsPosition === 'left' && showSettings && !shouldHideSidePanels && (
            <div 
              className={`w-1 h-full cursor-col-resize shrink-0 transition-colors ${dividerClass}`}
              style={{ backgroundColor: uiTheme.border }}
              onMouseDown={(e) => startResizing(e, 'settings')}
            />
          )}
        </div>

        {/* Main Workspace */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full relative">
          
          {/* Top Toolbar */}
          <div className="h-12 border-b flex items-center px-4 justify-between shrink-0 z-30 shadow-sm" style={{ backgroundColor: uiTheme.toolbarBg, borderColor: uiTheme.border }}>
            <div className="flex items-center gap-2">
              {!isMobileWebLayout && (
                <Tooltip
                  content={showSubtitlePanel ? t('subtitle.collapseTip') : t('subtitle.expand')}
                  placement="bottom"
                  width={180}
                  backgroundColor={isDarkMode ? 'rgba(17, 24, 39, 0.78)' : 'rgba(255, 255, 255, 0.78)'}
                  borderColor={`${secondaryThemeColor}33`}
                  textColor={uiTheme.text}
                >
                  <button
                    onClick={() => {
                      setShowSubtitlePanel((prev) => {
                        const next = !prev;
                        if (shouldHideSidePanels && next) {
                          setShowSettings(false);
                        }
                        return next;
                      });
                    }}
                    className={`p-1.5 rounded transition-colors mr-2 ${isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}
                    title={t('project.toggleSubtitleList')}
                  >
                    {showSubtitlePanel ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
                  </button>
                </Tooltip>
              )}
              {isMobileWebLayout && (
                <div className="flex items-center gap-2">
                  <div className="text-xs px-2 py-1 rounded border" style={{ color: uiTheme.textMuted, backgroundColor: uiTheme.panelBgSubtle, borderColor: `${secondaryThemeColor}44` }}>
                    {canvasWidth}x{canvasHeight} ({aspectLabel}) @ {config.fps}FPS
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              {!isMobileWebLayout && (
                <>
                  <div className="text-xs px-2 py-1 rounded border" style={{ color: uiTheme.textMuted, backgroundColor: uiTheme.panelBgSubtle, borderColor: `${secondaryThemeColor}44`, boxShadow: `0 2px 10px ${secondaryThemeColor}14` }}>
                    {canvasWidth}x{canvasHeight} ({aspectLabel}) @ {config.fps}FPS
                  </div>
                  <button
                    onClick={() => {
                      setShowSettings((prev) => {
                        const next = !prev;
                        if (shouldHideSidePanels && next) {
                          setShowSubtitlePanel(false);
                        }
                        return next;
                      });
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors ${showSettings ? '' : (isDarkMode ? 'hover:bg-gray-800 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900')}`}
                    style={showSettings ? { backgroundColor: `${secondaryThemeColor}18`, color: secondaryThemeColor, border: `1px solid ${secondaryThemeColor}55`, boxShadow: `0 4px 12px ${secondaryThemeColor}22` } : { border: `1px solid ${secondaryThemeColor}22` }}
                    title={t('menu.settings')}
                  >
                    <Settings size={14} />
                    {t('menu.settings')}
                  </button>
                </>
              )}
              {isMobileWebLayout && (
                <button
                  type="button"
                  onClick={() => void handleSaveProject()}
                  className="text-xs px-2 py-1 rounded border transition-colors"
                  style={{ color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}12`, borderColor: `${secondaryThemeColor}44` }}
                  title={t('settings.save')}
                >
                  {t('settings.save')}
                </button>
              )}
            </div>
          </div>

          {/* Canvas Area (Preview) */}
          {!isMobileWebLayout && shouldHideSidePanels && showSubtitlePanel && (
            <div className="absolute inset-x-0 top-12 bottom-0 z-40 flex">
              <div className="absolute inset-0 bg-black/25" onClick={() => setShowSubtitlePanel(false)} />
              <div
                className="relative h-full shrink-0 border-r overflow-hidden"
                style={{
                  width: `${Math.min(subtitleWidth, Math.max(300, windowWidth - 24))}px`,
                  borderColor: uiTheme.border,
                  backgroundColor: uiTheme.panelBg
                }}
              >
                <SubtitlePanel
                  subtitles={subtitles}
                  currentTime={currentTime}
                  isDarkMode={isDarkMode}
                  language={language}
                  themeColor={themeColor}
                  secondaryThemeColor={secondaryThemeColor}
                  speakers={config.speakers}
                  onSeek={handleSeek}
                  onUpdateSubtitle={handleUpdateSubtitle}
                  onDeleteSubtitle={handleDeleteSubtitle}
                  onBulkDeleteSubtitles={handleBulkDeleteSubtitles}
                  onBulkUpdateSpeaker={handleBulkUpdateSubtitleSpeaker}
                  editingSub={editingSub}
                  setEditingSub={setEditingSub}
                />
              </div>
            </div>
          )}

          {!isMobileWebLayout && shouldHideSidePanels && showSettings && (
            <div className="absolute inset-x-0 top-12 bottom-0 z-40 flex justify-end">
              <div className="absolute inset-0 bg-black/25" onClick={() => setShowSettings(false)} />
              <div
                className="relative h-full shrink-0 overflow-hidden border-l"
                style={{
                  width: `${Math.min(settingsWidth, Math.max(320, windowWidth - 24))}px`,
                  borderColor: uiTheme.border,
                  backgroundColor: uiTheme.panelBg
                }}
              >
                <SettingsPanel
                  config={config}
                  onConfigChange={applyTrackedConfigChange}
                  isDarkMode={isDarkMode}
                   language={language}
                   themeColor={themeColor}
                   secondaryThemeColor={secondaryThemeColor}
                   autoSaveProject={autoSaveProject}
                   proxy={proxyState}
                   onThemeColorChange={handleThemeColorChangeTracked}
                   onSecondaryThemeColorChange={handleSecondaryThemeColorChangeTracked}
                   onAutoSaveProjectChange={(enabled: boolean) => {
                     pushHistorySnapshot();
                     setAutoSaveProject(enabled);
                     markProjectDirty();
                   }}
                   onProxyChange={handleProxyChangeTracked}
                   onLanguageChange={handleLanguageChangeTracked}
                   onThemeChange={handleThemeModeChangeTracked}
                  settingsPosition={settingsPosition}
                  onPositionChange={handlePositionChangeTracked}
                  onClose={() => setShowSettings(false)}
                  onSave={handleSaveProject}
                  showToast={showToast}
                  presets={presets}
                   onPresetsChange={handlePresetsChangeTracked}
                   annotationPresets={annotationPresets}
                   onAnnotationPresetsChange={handleAnnotationPresetsChangeTracked}
                   onRequestRemoveSpeaker={handleRequestRemoveSpeaker}
                   activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  onSelectImage={handleSelectImage}
                  resolveAssetSrc={resolvePath}
                />
              </div>
            </div>
          )}

          {toastMessage && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded z-50 animate-fade-in text-sm flex items-center gap-2 border" style={{ backgroundColor: uiTheme.panelBgElevated, color: uiTheme.text, borderColor: uiTheme.border, boxShadow: '0 8px 18px rgba(0,0,0,0.14)' }}>
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              {toastMessage}
            </div>
          )}
          <div ref={previewAreaRef} className={`flex-1 min-w-0 min-h-0 relative z-10 ${isMobileWebLayout ? 'p-1' : 'p-8'} overflow-hidden ${canvasBg}`}>
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
              <div 
                ref={previewFrameRef}
                onContextMenuCapture={handleCopyPreviewToClipboard}
                onContextMenu={handleCopyPreviewToClipboard}
                className="relative pointer-events-auto bg-transparent rounded-lg overflow-hidden flex flex-col border shrink-0"
                style={{
                  width: `${canvasWidth}px`,
                  height: `${canvasHeight}px`,
                  aspectRatio,
                  borderColor: isDarkMode ? '#1f2937' : '#d1d5db',
                  isolation: 'isolate',
                  boxShadow: '0 12px 28px rgba(0,0,0,0.16)',
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'center center',
                }}
              >
              
              {/* Fallback color layer if no background image */}
              <div className="absolute inset-0 z-0" style={{ backgroundColor: isDarkMode ? '#111111' : '#ffffff', borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.12)' }} />

              {/* Background Image Wrapper */}
              {config.background?.image && (
                <div className="absolute inset-0 z-10 overflow-hidden">
                  {(() => {
                    const resolvedBackground = resolvePath(config.background.image) || '';
                    const isVideoBackground = /\.(mp4|webm|mov|mkv)(\?|$)/i.test(resolvedBackground);
                    const objectFit = getBackgroundObjectFit(config.background?.fit);
                    const objectPosition = getBackgroundObjectPosition(config.background?.position);
                    const sharedStyle: React.CSSProperties = {
                      width: '100%',
                      height: '100%',
                      objectFit,
                      objectPosition,
                      filter: `blur(${config.background.blur || 0}px) brightness(${config.background.brightness ?? 1.0})`,
                      transform: objectFit === 'cover' ? 'scale(1.05)' : undefined,
                      transformOrigin: objectPosition
                    };

                    return isVideoBackground ? (
                      <video
                        ref={previewBackgroundVideoRef}
                        src={resolvedBackground}
                        muted
                        loop
                        playsInline
                        className="w-full h-full"
                        style={sharedStyle}
                      />
                    ) : (
                      <img
                        src={resolvedBackground}
                        alt="Background"
                        referrerPolicy="no-referrer"
                        className="w-full h-full"
                        style={sharedStyle}
                      />
                    );
                  })()}
                </div>
              )}

              {backgroundSlidesBelowChat.map((slide: BackgroundSlideItem) => (
                <div
                  key={slide.id}
                  className="absolute inset-0"
                  style={{ zIndex: 12 + (slide.backgroundOrder ?? 0), overflow: activeInsertImageId === slide.id && isInsertImageEditMode ? 'visible' : 'hidden', pointerEvents: 'none' }}
                >
                  {slide.type === 'text' ? (
                    <PreviewTextAsset
                      slide={slide}
                      currentTime={previewRenderTime}
                      canvasWidth={canvasWidth}
                      canvasHeight={canvasHeight}
                      blur={slide.inheritBackgroundFilters === false ? 0 : (config.background.blur || 0)}
                      brightness={slide.inheritBackgroundFilters === false ? 1 : (config.background.brightness ?? 1)}
                      onEditBoxChange={(box) => updateSlideEditBox(slide.id, box)}
                      onDoubleClick={() => {
                        enterInsertImageEditMode(slide.id);
                        setShowSettings(true);
                        setActiveTab('project');
                        focusInsertImageSettings();
                      }}
                      onPointerDown={undefined}
                    editOverlay={undefined}
                    />
                  ) : <PreviewBackgroundAsset
                    src={resolvePath(slide.image)}
                    canvasWidth={canvasWidth}
                    canvasHeight={canvasHeight}
                    intrinsicWidth={slide.intrinsicWidth}
                    intrinsicHeight={slide.intrinsicHeight}
                    blur={slide.inheritBackgroundFilters === false ? 0 : (config.background.blur || 0)}
                    brightness={slide.inheritBackgroundFilters === false ? 1 : (config.background.brightness ?? 1)}
                    scale={slide.scale ?? 1}
                    offsetX={slide.offsetX ?? 0}
                    offsetY={slide.offsetY ?? 0}
                    rotation={slide.rotation ?? 0}
                    animationStyle={slide.animationStyle || 'fade'}
                    animationDuration={slide.animationDuration ?? 0.24}
                    opacity={slide.opacity ?? 1}
                    imageBorderColor={slide.imageBorderColor || '#FFFFFF'}
                    imageBorderWidth={slide.imageBorderWidth ?? 0}
                    imageShadowColor={slide.imageShadowColor || '#00000066'}
                    imageShadowSize={slide.imageShadowSize ?? 0}
                    currentTime={previewRenderTime}
                    start={slide.start}
                    end={slide.end}
                    draggable={activeInsertImageId === slide.id && isInsertImageEditMode}
                    onEditBoxChange={(box) => updateSlideEditBox(slide.id, box)}
                    onNaturalSizeChange={(size) => updateSlideIntrinsicSize(slide.id, size.width, size.height)}
                    onDoubleClick={() => {
                      enterInsertImageEditMode(slide.id);
                      setShowSettings(true);
                      setActiveTab('project');
                      focusInsertImageSettings();
                    }}
                    onPointerDown={undefined}
                    editOverlay={undefined}
                  />}
                </div>
              ))}

              <div className="absolute inset-0 z-[24] pointer-events-none">
                {backgroundSlidesBelowChat.map((slide: BackgroundSlideItem) => {
                  const box = slideEditBoxes[slide.id];
                  if (!box) return null;
                  return (
                    <div
                      key={`below-hit-${slide.id}`}
                      className="absolute pointer-events-auto"
                      style={{
                        left: `${box.centerX - box.width / 2}px`,
                        top: `${box.centerY - box.height / 2}px`,
                        width: `${box.width}px`,
                        height: `${box.height}px`,
                        transform: `rotate(${slide.rotation ?? 0}deg)`,
                        transformOrigin: '50% 50%',
                        cursor: activeInsertImageId === slide.id && isInsertImageEditMode ? 'grab' : 'pointer',
                        touchAction: 'none',
                        backgroundColor: 'transparent',
                      }}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        enterInsertImageEditMode(slide.id);
                      }}
                      onPointerDown={activeInsertImageId === slide.id && isInsertImageEditMode ? (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        insertImageDragRef.current = {
                          id: slide.id,
                          mode: 'move',
                          startX: event.clientX,
                          startY: event.clientY,
                          initialOffsetX: slide.offsetX ?? 0,
                          initialOffsetY: slide.offsetY ?? 0,
                          initialScale: slide.scale ?? 1,
                          initialRotation: slide.rotation ?? 0,
                        };
                        document.body.style.userSelect = 'none';
                        document.body.style.cursor = 'grabbing';
                      } : undefined}
                    />
                  );
                })}
              </div>

              {/* Chat Stream */}
              <div
                className="absolute inset-0 z-20 flex flex-col overflow-hidden"
                style={{
                  paddingTop: `${previewChatLayout?.paddingTop ?? 48}px`,
                  paddingLeft: `${previewChatLayout?.paddingLeft ?? previewChatLayout?.paddingX ?? 48}px`,
                  paddingRight: `${previewChatLayout?.paddingRight ?? previewChatLayout?.paddingX ?? 48}px`,
                  justifyContent: 'space-between'
                }}
              >
                <div
                  className="flex-1 min-h-0 overflow-hidden relative"
                  style={previewTopFadeStyle}
                >
                  <div
                    className="absolute left-0 right-0 flex flex-col"
                    style={{
                      bottom: `${previewChatLayout?.paddingBottom ?? 80}px`
                    }}
                  >
                    {subtitlesLoading ? (
                      <div className="text-center opacity-50 my-auto">{t('app.loadSubtitle')}</div>
                    ) : previewTrackLayout ? (
                      <div style={{ display: 'flex', width: '100%', alignItems: 'flex-end' }}>
                        {previewTrackLayout.tracks.map((track) => {
                          const trackWidth = previewChatContentWidth / previewTrackLayout.trackCount;
                          return (
                            <div key={`track-${track.index}`} style={{ width: `${100 / previewTrackLayout.trackCount}%`, minWidth: 0, position: 'relative' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                {track.items.map((item, itemIndex) => {
                                  const speaker = config.speakers[item.speakerId];
                                  if (!speaker) return null;
                                  const prevSpeakerId = itemIndex > 0 ? track.items[itemIndex - 1]?.speakerId : undefined;
                                  const nextSpeakerId = itemIndex < track.items.length - 1 ? track.items[itemIndex + 1]?.speakerId : undefined;
                                  const trackPaddingLeft = speaker.style?.trackPaddingLeft ?? 5;
                                  const trackPaddingRight = speaker.style?.trackPaddingRight ?? 5;
                                  const bubbleWidth = Math.max(80, trackWidth - trackPaddingLeft - trackPaddingRight);
                                  return (
                                    <div key={item.id} style={{ display: 'flex', justifyContent: speaker.side === 'right' ? 'flex-end' : 'flex-start', paddingLeft: `${trackPaddingLeft}px`, paddingRight: `${trackPaddingRight}px` }}>
                                      <ChatMessageBubble
                                        item={{ key: item.id, start: item.start, end: item.end, text: item.text, speakerId: item.speakerId }}
                                        speaker={speaker}
                                        currentTime={previewRenderTime}
                                        canvasWidth={trackWidth}
                                        layoutScale={1}
                                        chatLayout={previewChatLayout}
                                        fallbackAvatarBorderColor={isDarkMode ? '#1f2937' : '#ffffff'}
                                        prevSpeakerId={prevSpeakerId}
                                        nextSpeakerId={nextSpeakerId}
                                        isLatestVisible={itemIndex === track.items.length - 1}
                                        bubbleMaxWidthOverridePx={bubbleWidth}
                                        renderInlineImage={({ src, alt, style }) => <img key={`${item.id}-${src}`} src={resolvePath(src)} alt={alt} referrerPolicy="no-referrer" style={style} />}
                                        renderAvatar={({ src, alt, style }) => {
                                          const bubbleScale = previewChatLayout?.bubbleScale ?? 1.5;
                                          const combinedScale = Math.max(0.1, 1) * bubbleScale;
                                          const borderWidth = Math.max(2, Math.round(4 * combinedScale));
                                          const borderColor = speaker.style?.avatarBorderColor || (isDarkMode ? '#1f2937' : '#ffffff');
                                          return <img src={resolvePath(src)} alt={alt} referrerPolicy="no-referrer" className="rounded-full shrink-0 object-cover" style={{ ...style, pointerEvents: 'none', boxSizing: 'border-box', border: `${borderWidth}px solid ${borderColor}`, backgroundColor: borderColor }} />;
                                        }}
                                        renderBubble={({ outerStyle, contentStyle, children }) => <div style={{ ...outerStyle, pointerEvents: 'none' }}><div style={{ ...contentStyle, pointerEvents: 'none' }}>{children}</div></div>}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      visibleMessageRows.map((row, rowIndex) => {
                        const isLatestRow = rowIndex === visibleMessageRows.length - 1;

                        const renderRowBubble = (side: 'left' | 'right') => {
                          const item = row[side];
                          if (!item) return null;
                          const speaker = config.speakers[item.speakerId];
                          if (!speaker || speaker.type === 'annotation') return null;
                          const flatIndex = flatVisibleMessages.findIndex((candidate) => candidate?.id === item.id);
                          const prevSpeakerId = flatIndex > 0 ? flatVisibleMessages[flatIndex - 1]?.speakerId : undefined;
                          const nextSpeakerId = flatIndex < flatVisibleMessages.length - 1 ? flatVisibleMessages[flatIndex + 1]?.speakerId : undefined;

                          return (
                            <div
                              key={item.id}
                              style={{
                                  flex: '0 1 auto',
                                  minWidth: 0,
                                  display: 'flex',
                                  justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
                                  marginLeft: side === 'right' ? 'auto' : undefined,
                              }}
                            >
                              <ChatMessageBubble
                                item={{ key: item.id, start: item.start, end: item.end, text: item.text, speakerId: item.speakerId }}
                                speaker={speaker}
                                currentTime={previewRenderTime}
                                canvasWidth={canvasWidth}
                                layoutScale={1}
                                chatLayout={previewChatLayout}
                                fallbackAvatarBorderColor={isDarkMode ? '#1f2937' : '#ffffff'}
                                prevSpeakerId={prevSpeakerId}
                                nextSpeakerId={nextSpeakerId}
                                isLatestVisible={isLatestRow}
                                renderInlineImage={({ src, alt, style }) => (
                                  <img
                                    key={`${item.id}-${src}`}
                                    src={resolvePath(src)}
                                    alt={alt}
                                    referrerPolicy="no-referrer"
                                    style={style}
                                  />
                                )}
                                renderAvatar={({ src, alt, style }) => {
                                  const bubbleScale = previewChatLayout?.bubbleScale ?? 1.5;
                                  const combinedScale = Math.max(0.1, 1) * bubbleScale;
                                  const borderWidth = Math.max(2, Math.round(4 * combinedScale));
                                  const borderColor = speaker.style?.avatarBorderColor || (isDarkMode ? '#1f2937' : '#ffffff');
                                  return (
                                    <img
                                      src={resolvePath(src)}
                                      alt={alt}
                                      referrerPolicy="no-referrer"
                                      className="rounded-full shrink-0 object-cover"
                                      style={{
                                        ...style,
                                        pointerEvents: 'none',
                                        boxSizing: 'border-box',
                                        border: `${borderWidth}px solid ${borderColor}`,
                                        backgroundColor: borderColor
                                      }}
                                    />
                                  );
                                }}
                                renderBubble={({ outerStyle, contentStyle, children }) => (
                                  <div style={{ ...outerStyle, pointerEvents: 'none' }}>
                                    <div style={{ ...contentStyle, pointerEvents: 'none' }}>{children}</div>
                                  </div>
                                )}
                              />
                            </div>
                          );
                        };

                        return (
                          <div key={`message-row-${rowIndex}`} style={{ display: 'flex', alignItems: 'flex-end', width: '100%' }}>
                            {renderRowBubble('left')}
                            {renderRowBubble('right')}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {backgroundSlidesAboveChat.map((slide: BackgroundSlideItem) => (
                <div
                  key={slide.id}
                  className="absolute inset-0"
                  style={{ zIndex: 25 + (slide.overlayOrder ?? 0), overflow: activeInsertImageId === slide.id && isInsertImageEditMode ? 'visible' : 'hidden', pointerEvents: 'none' }}
                >
                  {slide.type === 'text' ? (
                    <PreviewTextAsset
                      slide={slide}
                      currentTime={previewRenderTime}
                      canvasWidth={canvasWidth}
                      canvasHeight={canvasHeight}
                      blur={0}
                      brightness={1}
                      onEditBoxChange={(box) => updateSlideEditBox(slide.id, box)}
                    onDoubleClick={() => {
                      enterInsertImageEditMode(slide.id);
                      setShowSettings(true);
                      setActiveTab('project');
                      focusInsertImageSettings();
                    }}
                    onPointerDown={activeInsertImageId === slide.id && isInsertImageEditMode ? (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        insertImageDragRef.current = {
                          id: slide.id,
                          mode: 'move',
                          startX: event.clientX,
                          startY: event.clientY,
                          initialOffsetX: slide.offsetX ?? 0,
                          initialOffsetY: slide.offsetY ?? 0,
                          initialScale: slide.scale ?? 1,
                          initialRotation: slide.rotation ?? 0,
                        };
                        document.body.style.userSelect = 'none';
                        document.body.style.cursor = 'grabbing';
                      } : undefined}
                      editOverlay={undefined}
                    />
                  ) : <PreviewBackgroundAsset
                    src={resolvePath(slide.image)}
                    canvasWidth={canvasWidth}
                    canvasHeight={canvasHeight}
                    intrinsicWidth={slide.intrinsicWidth}
                    intrinsicHeight={slide.intrinsicHeight}
                    blur={0}
                    brightness={1}
                    scale={slide.scale ?? 1}
                    offsetX={slide.offsetX ?? 0}
                    offsetY={slide.offsetY ?? 0}
                    rotation={slide.rotation ?? 0}
                    animationStyle={slide.animationStyle || 'fade'}
                    animationDuration={slide.animationDuration ?? 0.24}
                    opacity={slide.opacity ?? 1}
                    imageBorderColor={slide.imageBorderColor || '#FFFFFF'}
                    imageBorderWidth={slide.imageBorderWidth ?? 0}
                    imageShadowColor={slide.imageShadowColor || '#00000066'}
                    imageShadowSize={slide.imageShadowSize ?? 0}
                    currentTime={previewRenderTime}
                    start={slide.start}
                    end={slide.end}
                    draggable={activeInsertImageId === slide.id && isInsertImageEditMode}
                    onEditBoxChange={(box) => updateSlideEditBox(slide.id, box)}
                    onNaturalSizeChange={(size) => updateSlideIntrinsicSize(slide.id, size.width, size.height)}
                    onDoubleClick={() => {
                      enterInsertImageEditMode(slide.id);
                      setShowSettings(true);
                      setActiveTab('project');
                      focusInsertImageSettings();
                    }}
                    onPointerDown={activeInsertImageId === slide.id && isInsertImageEditMode ? (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      insertImageDragRef.current = {
                        id: slide.id,
                        mode: 'move',
                        startX: event.clientX,
                        startY: event.clientY,
                        initialOffsetX: slide.offsetX ?? 0,
                        initialOffsetY: slide.offsetY ?? 0,
                        initialScale: slide.scale ?? 1,
                        initialRotation: slide.rotation ?? 0,
                      };
                      document.body.style.userSelect = 'none';
                      document.body.style.cursor = 'grabbing';
                    } : undefined}
                    editOverlay={undefined}
                  />}
                </div>
              ))}

              {visibleAnnotations.length > 0 && (
                <div className="absolute inset-x-0 top-0 bottom-0 z-30 pointer-events-none flex flex-col justify-between" style={{ padding: '24px 32px' }}>
                  <div className="flex flex-col items-stretch gap-3 w-full">
                    {visibleAnnotations.filter((item) => config.speakers[item.speakerId]?.style?.annotationPosition === 'top').map((item) => {
                      const speaker = config.speakers[item.speakerId];
                      return (
                        <div key={item.id} className="w-full flex flex-col">
                          <ChatAnnotationBubble
                            item={{ key: item.id, start: item.start, end: item.end, text: item.text, speakerId: item.speakerId }}
                            speaker={speaker}
                            currentTime={previewRenderTime}
                            layoutScale={1}
                            chatLayout={{ ...previewChatLayout, bubbleScale: previewChatLayout?.bubbleScale }}
                            renderInlineImage={({ src, alt, style }) => <img key={`${item.id}-${src}`} src={resolvePath(src)} alt={alt} referrerPolicy="no-referrer" style={style} />}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-col items-stretch gap-3 w-full">
                    {visibleAnnotations.filter((item) => (config.speakers[item.speakerId]?.style?.annotationPosition || 'bottom') === 'bottom').map((item) => {
                      const speaker = config.speakers[item.speakerId];
                      return (
                        <div key={item.id} className="w-full flex flex-col">
                          <ChatAnnotationBubble
                            item={{ key: item.id, start: item.start, end: item.end, text: item.text, speakerId: item.speakerId }}
                            speaker={speaker}
                            currentTime={previewRenderTime}
                            layoutScale={1}
                            chatLayout={{ ...previewChatLayout, bubbleScale: previewChatLayout?.bubbleScale }}
                            renderInlineImage={({ src, alt, style }) => <img key={`${item.id}-${src}`} src={resolvePath(src)} alt={alt} referrerPolicy="no-referrer" style={style} />}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {activeInsertImageSlide && activeInsertImageBounds && isInsertImageEditMode && (
                <div className="absolute inset-0 z-40 pointer-events-none">
                  <div
                    className="absolute"
                    style={{
                      left: `${activeInsertImageBounds.left}px`,
                      top: `${activeInsertImageBounds.top}px`,
                      width: `${activeInsertImageBounds.width}px`,
                      height: `${activeInsertImageBounds.height}px`,
                      transform: `rotate(${activeInsertImageSlide.rotation ?? 0}deg)`,
                      transformOrigin: '50% 50%',
                    }}
                  >
                    <div className="absolute inset-0 border-2 border-dashed rounded pointer-events-none" style={{ borderColor: `${secondaryThemeColor}99`, boxShadow: `0 0 0 1px ${themeColor}44 inset` }} />
                    <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none" style={{ top: '-56px', width: '2px', height: '56px', backgroundColor: `${secondaryThemeColor}88` }} />
                    <button
                      type="button"
                      className="absolute left-1/2 rounded-full border pointer-events-auto"
                      style={{ top: '-56px', width: '40px', height: '40px', transform: 'translate(-50%, -50%)', backgroundColor: isDarkMode ? '#111827' : '#ffffff', borderColor: secondaryThemeColor, boxShadow: `0 0 0 4px ${secondaryThemeColor}33`, cursor: 'grab', touchAction: 'none' }}
                      title={t('project.rotate')}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const frameRect = previewFrameRef.current?.getBoundingClientRect();
                        const centerX = (frameRect?.left ?? 0) + (activeInsertImageBounds.left + activeInsertImageBounds.width / 2) * (previewScale > 0 ? previewScale : 1);
                        const centerY = (frameRect?.top ?? 0) + (activeInsertImageBounds.top + activeInsertImageBounds.height / 2) * (previewScale > 0 ? previewScale : 1);
                        const initialAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI;
                        insertImageDragRef.current = {
                          id: activeInsertImageSlide.id,
                          mode: 'rotate',
                          startX: event.clientX,
                          startY: event.clientY,
                          initialOffsetX: activeInsertImageSlide.offsetX ?? 0,
                          initialOffsetY: activeInsertImageSlide.offsetY ?? 0,
                          initialScale: activeInsertImageSlide.scale ?? 1,
                          initialRotation: activeInsertImageSlide.rotation ?? 0,
                          initialAngle,
                        };
                        document.body.style.userSelect = 'none';
                        document.body.style.cursor = 'grabbing';
                      }}
                    />
                    {([
                      { left: '0%', top: '0%', cursor: 'nwse-resize' },
                      { left: '100%', top: '0%', cursor: 'nesw-resize' },
                      { left: '0%', top: '100%', cursor: 'nesw-resize' },
                      { left: '100%', top: '100%', cursor: 'nwse-resize' },
                    ]).map((handle, index) => (
                      <button
                        key={index}
                        type="button"
                        className="absolute rounded-sm border pointer-events-auto"
                        style={{ left: handle.left, top: handle.top, width: '32px', height: '32px', backgroundColor: isDarkMode ? '#111827' : '#ffffff', borderColor: secondaryThemeColor, boxShadow: `0 0 0 4px ${secondaryThemeColor}33`, transform: 'translate(-50%, -50%)', cursor: handle.cursor, touchAction: 'none' }}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const frameRect = previewFrameRef.current?.getBoundingClientRect();
                          const boundsCenterX = activeInsertImageBounds.left + activeInsertImageBounds.width / 2;
                          const boundsCenterY = activeInsertImageBounds.top + activeInsertImageBounds.height / 2;
                          const localCenterX = frameRect ? frameRect.left + boundsCenterX * (previewScale > 0 ? previewScale : 1) : event.clientX;
                          const localCenterY = frameRect ? frameRect.top + boundsCenterY * (previewScale > 0 ? previewScale : 1) : event.clientY;
                          const initialDistance = Math.sqrt((event.clientX - localCenterX) ** 2 + (event.clientY - localCenterY) ** 2) / (previewScale > 0 ? previewScale : 1);
                          insertImageDragRef.current = {
                            id: activeInsertImageSlide.id,
                            mode: 'scale',
                            startX: event.clientX,
                            startY: event.clientY,
                            initialOffsetX: activeInsertImageSlide.offsetX ?? 0,
                            initialOffsetY: activeInsertImageSlide.offsetY ?? 0,
                            initialScale: activeInsertImageSlide.scale ?? 1,
                            initialRotation: activeInsertImageSlide.rotation ?? 0,
                            initialDistance,
                          };
                          document.body.style.userSelect = 'none';
                          document.body.style.cursor = handle.cursor;
                        }}
                      />
                    ))}
                    <button
                      type="button"
                      className="absolute rounded-full border pointer-events-auto inline-flex items-center justify-center font-bold"
                      style={{ top: '-28px', right: '-92px', width: '56px', height: '56px', fontSize: '38px', lineHeight: 1, backgroundColor: isDarkMode ? 'rgba(17,24,39,0.92)' : 'rgba(255,255,255,0.96)', borderColor: `${secondaryThemeColor}66`, boxShadow: `0 0 0 4px ${secondaryThemeColor}2e`, color: uiTheme.text, cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => setIsInsertImageEditMode(false)}
                      title={t('project.exitEdit')}
                    >
                      <X size={28} strokeWidth={2.6} />
                    </button>
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANELS */}
         {settingsPosition === 'right' && showSettings && !shouldHideSidePanels && (
           <div className="flex h-full shrink-0 z-20 relative min-h-0">
            <div 
              className={`w-1 h-full cursor-col-resize shrink-0 transition-colors ${dividerClass}`}
              style={{ backgroundColor: uiTheme.border }}
              onMouseDown={(e) => startResizing(e, 'settings')}
            />
            <div style={{ width: settingsWidth }} className="h-full shrink-0 flex flex-col min-h-0 overflow-hidden">
              <SettingsPanel 
                config={config} 
                onConfigChange={applyTrackedConfigChange} 
                isDarkMode={isDarkMode}
                language={language}
                themeColor={themeColor}
                secondaryThemeColor={secondaryThemeColor}
                autoSaveProject={autoSaveProject}
                proxy={proxyState}
                onThemeColorChange={handleThemeColorChangeTracked}
                onSecondaryThemeColorChange={handleSecondaryThemeColorChangeTracked}
                onAutoSaveProjectChange={(enabled: boolean) => {
                  pushHistorySnapshot();
                  setAutoSaveProject(enabled);
                  markProjectDirty();
                }}
                onProxyChange={handleProxyChangeTracked}
                onLanguageChange={handleLanguageChangeTracked}
                onThemeChange={handleThemeModeChangeTracked}
                settingsPosition={settingsPosition}
                onPositionChange={handlePositionChangeTracked}
                onClose={() => setShowSettings(false)}
                onSave={handleSaveProject}
                showToast={showToast}
                presets={presets}
                onPresetsChange={handlePresetsChangeTracked}
                annotationPresets={annotationPresets}
                onAnnotationPresetsChange={handleAnnotationPresetsChangeTracked}
                onRequestRemoveSpeaker={handleRequestRemoveSpeaker}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                onSelectImage={handleSelectImage}
                onSeek={handleSeek}
                currentTime={previewRenderTime}
                activeInsertImageId={activeInsertImageId}
                focusInsertImageSettingsKey={focusInsertImageSettingsKey}
                onActiveInsertImageChange={setActiveInsertImageId}
                onEditInsertImage={(id) => {
                  enterInsertImageEditMode(id);
                  focusInsertImageSettings();
                }}
                resolveAssetSrc={resolvePath}
              />
            </div>
          </div>
        )}
      </div>

      <PlayerControls 
        key={resolvedAudioPath || 'no-audio'}
        audioPath={resolvedAudioPath}
        audioRef={audioRef}
        duration={duration}
        isPlaying={isPlaying}
        loop={loop}
        playbackRate={playbackRate}
        onPlayPause={() => setIsPlaying(!isPlaying)}
        onReset={() => {
          handleSeek(0);
          setIsPlaying(false);
        }}
        onSeek={handleSeek}
        onLoopChange={setLoop}
        onRateChange={setPlaybackRate}
        isDarkMode={isDarkMode}
        language={language}
        themeColor={themeColor}
        secondaryThemeColor={secondaryThemeColor}
        exportRangeStart={exportRange.start}
        exportRangeEnd={exportRange.end}
        defaultExportStart={defaultExportRange.start}
        defaultExportEnd={defaultExportRange.end}
        onExportRangeChange={updateExportRange}
        editingSub={editingSub}
        rangeSubtitle={editingSub ?? activePlaybackSubtitle}
        nearbySubtitles={nearbySubtitles}
        backgroundSlides={backgroundSlides.map((slide: BackgroundSlideItem, index: number) => ({
          id: slide.id,
          start: slide.start,
          end: slide.end,
          name: (slide.name || '').trim() || (slide.type === 'text'
            ? translate(DEFAULT_I18N_LANGUAGE, 'defaults.textAssetName', { index: index + 1 })
            : translate(DEFAULT_I18N_LANGUAGE, 'defaults.imageAssetName', { index: index + 1 })),
          type: slide.type || 'image',
          image: slide.image ? resolvePath(slide.image) : undefined,
          text: slide.text,
          layer: slide.layer || 'background',
          backgroundOrder: slide.backgroundOrder ?? index,
          overlayOrder: slide.overlayOrder ?? index,
        }))}
        onBackgroundSlidesChange={(slides) => {
          applyTrackedConfigUpdater((prev: any) => ({
            ...prev,
            background: {
              ...(prev?.background || DEFAULT_PROJECT_CONFIG.background),
              slides: (prev?.background?.slides || []).map((slide: BackgroundSlideItem) => {
                const next = slides.find((item) => item.id === slide.id);
                return next ? { ...slide, start: next.start, end: next.end } : slide;
              })
            }
          }));
        }}
        onEditingSubChange={(start, end) => {
          if (editingSub) {
            setEditingSub({ ...editingSub, start, end });
            handleUpdateSubtitle(editingSub.id, { start, end, duration: Number((end - start).toFixed(2)) });
          }
        }}
        onEditInsertImage={(id) => {
          enterInsertImageEditMode(id);
          setShowSettings(true);
          setActiveTab('project');
          focusInsertImageSettings();
        }}
        compactMobile={isMobileWebLayout}
      />

      {isMobileWebLayout && (
        <div className="border-t overflow-hidden" style={{ height: isMobileBottomPanelCollapsed ? '44px' : (isMobileBottomPanelExpanded ? '68vh' : `${mobileBottomPanelHeight}px`), minHeight: isMobileBottomPanelCollapsed ? '44px' : '220px', maxHeight: isMobileBottomPanelExpanded ? '78vh' : '560px', borderColor: uiTheme.border, backgroundColor: uiTheme.panelBg }}>
          {!isMobileBottomPanelCollapsed && (
            <div
              className="h-4 cursor-row-resize border-b flex items-center justify-center touch-none select-none"
              onPointerDown={startMobileBottomResizePointer}
              style={{ borderColor: isMobileBottomResizeActive ? `${secondaryThemeColor}66` : uiTheme.border, backgroundColor: isMobileBottomResizeActive ? `${secondaryThemeColor}18` : uiTheme.panelBgElevated }}
              title={t('app.dragHint')}
            >
              <div className="h-1.5 w-14 rounded-full transition-colors" style={{ backgroundColor: isMobileBottomResizeActive ? secondaryThemeColor : `${secondaryThemeColor}66` }} />
              <button
                type="button"
                className="absolute right-2 h-6 w-14 text-[10px] rounded border"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMobileBottomPanelExpanded((prev) => !prev);
                }}
                style={{ borderColor: uiTheme.border, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}12` }}
              >
                {isMobileBottomPanelExpanded ? t('common.collapse') : t('common.expand')}
              </button>
            </div>
          )}
          <SettingsPanel
            config={config}
            onConfigChange={applyTrackedConfigChange}
            isDarkMode={isDarkMode}
            language={language}
            themeColor={themeColor}
            secondaryThemeColor={secondaryThemeColor}
            autoSaveProject={autoSaveProject}
            proxy={proxyState}
            onThemeColorChange={handleThemeColorChangeTracked}
            onSecondaryThemeColorChange={handleSecondaryThemeColorChangeTracked}
            onAutoSaveProjectChange={(enabled: boolean) => {
              pushHistorySnapshot();
              setAutoSaveProject(enabled);
              markProjectDirty();
            }}
            onProxyChange={handleProxyChangeTracked}
            onLanguageChange={handleLanguageChangeTracked}
            onThemeChange={handleThemeModeChangeTracked}
            settingsPosition={settingsPosition}
            onPositionChange={handlePositionChangeTracked}
            onClose={() => {
              setIsMobileBottomPanelCollapsed((prev) => !prev);
            }}
            onSave={window.electron ? handleSaveProject : handleSaveConfig}
            showToast={showToast}
            presets={presets}
            onPresetsChange={handlePresetsChangeTracked}
            annotationPresets={annotationPresets}
            onAnnotationPresetsChange={handleAnnotationPresetsChangeTracked}
            onRequestRemoveSpeaker={handleRequestRemoveSpeaker}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onSelectImage={handleSelectImage}
            showSubtitleTab
            compactHeader
            hideHeader
            panelCollapsed={isMobileBottomPanelCollapsed}
            onTogglePanelCollapsed={() => setIsMobileBottomPanelCollapsed((prev) => !prev)}
            resolveAssetSrc={resolvePath}
            subtitleContent={(
              <div className="h-full min-h-0 flex flex-col">
                <div className="flex-1 min-h-0">
                  <SubtitlePanel
                    subtitles={subtitles}
                    currentTime={currentTime}
                    isDarkMode={isDarkMode}
                    language={language}
                    themeColor={themeColor}
                    secondaryThemeColor={secondaryThemeColor}
                    speakers={config.speakers}
                    onSeek={handleSeek}
                    onUpdateSubtitle={handleUpdateSubtitle}
                    onDeleteSubtitle={handleDeleteSubtitle}
                    onBulkDeleteSubtitles={handleBulkDeleteSubtitles}
                    onBulkUpdateSpeaker={handleBulkUpdateSubtitleSpeaker}
                    editingSub={editingSub}
                    setEditingSub={setEditingSub}
                  />
                </div>
              </div>
            )}
          />
        </div>
      )}

      <ExportModal
         isOpen={showExportModal}
         isDarkMode={isDarkMode}
         language={language}
         themeColor={themeColor}
         secondaryThemeColor={secondaryThemeColor}
         outputPath={exportOutputPath}
         quickSaveDir={quickSavePath}
         rangeStart={exportRange.start}
         rangeEnd={exportRange.end}
         defaultRangeStart={defaultExportRange.start}
         defaultRangeEnd={defaultExportRange.end}
         isExporting={isExporting}
         exportSucceeded={lastExportSucceeded}
         progress={exportProgress}
         statusMessage={exportStatusMessage}
         renderCacheInfo={renderCacheInfo}
         exportQuality={exportQuality}
         exportHardware={exportHardware}
         exportFormat={exportFormat}
         exportLogEnabled={exportLogEnabled}
         filenameTemplate={filenameTemplate}
         customFilename={customFilename}
          onClose={() => {
           if (!isExporting) {
             setShowExportModal(false);
           }
         }}
         onOutputPathChange={setExportOutputPath}
         onChoosePath={handleChooseExportPath}
         onQuickSave={() => setExportOutputPath(quickSavePath)}
         onRangeChange={updateExportRange}
         onQualityChange={handleExportQualityChange}
         onHardwareChange={setExportHardware}
         onExportFormatChange={handleExportFormatChange}
         onExportLogEnabledChange={handleExportLogEnabledChange}
         onFilenameTemplateChange={handleFilenameTemplateChange}
         onCustomFilenameChange={handleCustomFilenameChange}
         onStartExport={handleStartExport}
         onRevealOutput={handleRevealExport}
         onClearRenderCache={handleClearRenderCache}
        />

      <AboutModal
        isOpen={showAboutModal}
        isDarkMode={isDarkMode}
        language={language}
        themeColor={themeColor}
        secondaryThemeColor={secondaryThemeColor}
        onClose={() => setShowAboutModal(false)}
        onOpenGithub={() => { void openExternalUrl('https://github.com/AlanWanco/PomChat'); }}
        onOpenReleases={() => { void openExternalUrl('https://github.com/AlanWanco/PomChat/releases'); }}
        onCheckUpdates={() => { void handleCheckForUpdates(); }}
        isCheckingUpdates={isCheckingUpdates}
        updateResult={updateResult}
      />

      {speakerReplaceDialog && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border shadow-2xl p-4 space-y-4" style={{ backgroundColor: uiTheme.panelBg, borderColor: uiTheme.border, color: uiTheme.text }}>
            <div className="text-sm font-semibold">{t('speakers.bulkReassignTitle')}</div>
            <p className="text-xs" style={{ color: uiTheme.textMuted }}>
              {t('speakers.bulkReassignConfirm', {
                speaker: config.speakers?.[speakerReplaceDialog.speakerKey]?.name || speakerReplaceDialog.speakerKey,
                count: speakerReplaceDialog.affectedCount
              })}
            </p>
            <select
              value={speakerReplaceDialog.replacementKey}
              onChange={(e) => setSpeakerReplaceDialog((prev) => (prev ? { ...prev, replacementKey: e.target.value } : prev))}
              className="w-full border rounded px-2 py-2 text-sm focus:outline-none"
              style={{ backgroundColor: uiTheme.inputBg, borderColor: uiTheme.border, color: uiTheme.text }}
            >
              {Object.keys(config.speakers || {})
                .filter((key) => key !== speakerReplaceDialog.speakerKey && config.speakers[key]?.type !== 'annotation')
                .map((key) => (
                  <option key={key} value={key}>{config.speakers[key]?.name || key}</option>
                ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSpeakerReplaceDialog(null)}
                className="px-3 py-1.5 rounded text-sm"
                style={{ backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.textMuted }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={confirmRemoveSpeakerWithReplacement}
                className="px-3 py-1.5 rounded text-sm text-white"
                style={{ backgroundColor: secondaryThemeColor }}
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {importAssData && (
        <AssImportModal 
          assPath={importAssData.path}
          assContent={importAssData.content}
          isDarkMode={isDarkMode}
          language={language}
          themeColor={themeColor}
          secondaryThemeColor={secondaryThemeColor}
          onCancel={() => setImportAssData(null)}
          onConfirm={async (path, newSpeakers, importedPresets, importedAnnotationPresets) => {
            const sanitizedContent = sanitizeImportedAssContent(importAssData.content);

            pushHistorySnapshot();
            setConfig((prev: any) => {
              const nextSpeakers = Object.fromEntries(
                Object.entries(newSpeakers || {}).map(([speakerId, speaker]: [string, any]) => [
                  speakerId,
                  {
                    ...speaker,
                    preset: speaker?.preset ?? prev?.speakers?.[speakerId]?.preset
                  }
                ])
              );

              if (!nextSpeakers.ANNOTATION) {
                nextSpeakers.ANNOTATION = prev?.speakers?.ANNOTATION || DEFAULT_PROJECT_CONFIG.speakers.ANNOTATION;
              }

              return {
                ...prev,
                subtitleFormat: 'ass',
                assPath: path,
                speakers: nextSpeakers
              };
            });
            if (importedPresets && Object.keys(importedPresets).length > 0) {
              setPresets((prev: Record<string, any>) => ({
                ...prev,
                ...importedPresets
              }));
            }
            if (importedAnnotationPresets && Object.keys(importedAnnotationPresets).length > 0) {
              setAnnotationPresets((prev: Record<string, any>) => ({
                ...prev,
                ...importedAnnotationPresets
              }));
            }
            if (!window.electron) {
              setWebAssContent(sanitizedContent);
            }
            markProjectDirty();
            setImportAssData(null);
            showToast(t('app.subtitleImported'));
          }}
        />
      )}

      {isDragOver && (
          <div className="absolute inset-0 z-[140] backdrop-blur-sm border-2 border-dashed flex items-center justify-center pointer-events-none" style={{ backgroundColor: uiTheme.accentSoft, borderColor: uiTheme.accentBorder }}>
            <div className="px-6 py-4 rounded-2xl text-sm font-medium shadow-xl" style={{ color: themeColor, border: `1px solid ${uiTheme.accentBorder}`, backgroundColor: isDarkMode ? uiTheme.panelBgElevated : uiTheme.panelBg }}>
              {t('app.dropHint')}
            </div>
          </div>
      )}

    </div>
  );
}

export default App;
