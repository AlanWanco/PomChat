/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import { SettingsPanel } from './components/SettingsPanel';
import { PlayerControls } from './components/PlayerControls';
import { SubtitlePanel } from './components/SubtitlePanel';
import { MenuBar } from './components/MenuBar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { AssImportModal } from './components/AssImportModal';
import { ExportModal } from './components/ExportModal';
import { ChatAnnotationBubble, ChatMessageBubble } from './components/chat/SharedChatBubbles';
import { useAssSubtitle } from './hooks/useAssSubtitle';
import { translate, type Language } from './i18n';
import { createThemeTokens } from './theme';
import { PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react';
import './App.css';

const LIGHT_THEME_DEFAULT = '#9ca4b8';
const DARK_THEME_DEFAULT = '#545454';
const SECONDARY_THEME_DEFAULT = '#ed7e96';
const THEME_COLOR_VALUES = ['#545454', '#ed7e96', '#e7d600', '#01b7ee', '#485ec6', '#ff5800', '#a764a1', '#d71c30', '#83c36e', '#9ca4b8', '#36b583', '#aaa898', '#f8c9c4'];
const MESSAGE_LOOKBACK_SECONDS = 5;
const MESSAGE_LOOKAHEAD_SECONDS = 2;
const MESSAGE_FALLBACK_COUNT = 32;

// Web-only local storage key
const STORAGE_KEY = 'pomchat_config';

type ExportProgressState = {
  progress: number;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  stage: string;
};

const DEFAULT_BUBBLE_STYLE = {
  bgColor: '#2563eb',
  textColor: '#ffffff',
  borderRadius: 28,
  opacity: 0.9,
  borderWidth: 0,
  avatarBorderColor: '#ffffff',
  borderColor: '#ffffff',
  borderOpacity: 1,
  margin: 14,
  paddingX: 20,
  paddingY: 12,
  shadowSize: 7,
  fontFamily: 'system-ui',
  fontSize: 30,
  fontWeight: 'normal'
};

const DEFAULT_CHAT_LAYOUT = {
  paddingTop: 0,
  paddingBottom: 80,
  paddingX: 48,
  paddingLeft: 48,
  paddingRight: 48,
  bubbleScale: 1.5,
  avatarSize: 80,
  speakerNameSize: 22,
  timestampFontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  timestampSize: 16,
  timestampColor: '#FFFFFFA6',
  animationStyle: 'rise',
  animationDuration: 0.2
};

const DEFAULT_UI_CONFIG = {
  isDarkMode: true,
  themeColor: DARK_THEME_DEFAULT,
  secondaryThemeColor: SECONDARY_THEME_DEFAULT,
  proxy: '',
  settingsPosition: 'right' as 'left' | 'right',
  recentProject: null as string | null,
  playbackPositions: {} as Record<string, number>,
  presets: {} as Record<string, any>
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
    brightness: 1
  },
  audioPath: '',
  assPath: '',
  subtitleFormat: 'ass' as SubtitleFormat,
  content: [] as any[],
  speakers: {
    A: {
      name: '主播A',
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
      name: '嘉宾B',
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
      name: '注释',
      avatar: '',
      side: 'center',
      type: 'annotation',
      style: {
        ...DEFAULT_BUBBLE_STYLE,
        bgColor: '#111827',
        textColor: '#ffffff',
        borderRadius: 999,
        paddingX: 18,
        paddingY: 10,
        maxWidth: 720,
        fontSize: 24,
        annotationPosition: 'bottom'
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
  const legacyPaddingX = parsed?.chatLayout?.paddingX;
  const merged = {
    ...DEFAULT_PROJECT_CONFIG,
    ...parsed,
    dimensions: { ...DEFAULT_PROJECT_CONFIG.dimensions, ...(parsed?.dimensions || {}) },
    chatLayout: {
      ...DEFAULT_CHAT_LAYOUT,
      ...DEFAULT_PROJECT_CONFIG.chatLayout,
      ...(parsed?.chatLayout || {}),
      paddingLeft: parsed?.chatLayout?.paddingLeft ?? legacyPaddingX ?? (DEFAULT_PROJECT_CONFIG.chatLayout as any)?.paddingLeft ?? DEFAULT_PROJECT_CONFIG.chatLayout?.paddingX ?? DEFAULT_CHAT_LAYOUT.paddingLeft,
      paddingRight: parsed?.chatLayout?.paddingRight ?? legacyPaddingX ?? (DEFAULT_PROJECT_CONFIG.chatLayout as any)?.paddingRight ?? DEFAULT_PROJECT_CONFIG.chatLayout?.paddingX ?? DEFAULT_CHAT_LAYOUT.paddingRight
    },
    background: { ...DEFAULT_PROJECT_CONFIG.background, ...(parsed?.background || {}) },
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
      proxy: typeof parsed?.ui?.proxy === 'string' ? parsed.ui.proxy : '',
      settingsPosition: parsed?.ui?.settingsPosition === 'left' ? 'left' : 'right',
      recentProject: typeof parsed?.ui?.recentProject === 'string' ? parsed.ui.recentProject : null,
      playbackPositions: parsed?.ui?.playbackPositions && typeof parsed.ui.playbackPositions === 'object' ? parsed.ui.playbackPositions : {},
      presets: parsed?.ui?.presets && typeof parsed.ui.presets === 'object' ? parsed.ui.presets : {}
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
      name: '默认角色',
      avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=A',
      side: 'left',
      style: { ...DEFAULT_BUBBLE_STYLE }
    },
    ANNOTATION: {
      name: '注释',
      avatar: '',
      side: 'center',
      type: 'annotation',
      style: {
        ...DEFAULT_BUBBLE_STYLE,
        bgColor: '#111827',
        textColor: '#ffffff',
        borderRadius: 999,
        paddingX: 18,
        paddingY: 10,
        maxWidth: 720,
        fontSize: 24,
        annotationPosition: 'bottom'
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

function SnapshotBubble({
  canvasRef,
  backgroundSrc,
  backgroundBrightness,
  backgroundBaseBlur,
  blurPx,
  tintColor,
  className,
  outerStyle,
  contentStyle,
  children
}: {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  backgroundSrc?: string;
  backgroundBrightness: number;
  backgroundBaseBlur: number;
  blurPx: number;
  tintColor: string;
  className: string;
  outerStyle: React.CSSProperties;
  contentStyle: React.CSSProperties;
  children: React.ReactNode;
}) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const samplingBleed = Math.max(16, blurPx * 4);

  useLayoutEffect(() => {
    const bubbleEl = bubbleRef.current;
    const canvasEl = canvasRef.current;
    if (!bubbleEl || !canvasEl) return;

    const updateMetrics = () => {
      const bubbleRect = bubbleEl.getBoundingClientRect();
      const canvasRect = canvasEl.getBoundingClientRect();
      const nextMetrics = {
        left: bubbleRect.left - canvasRect.left,
        top: bubbleRect.top - canvasRect.top,
        width: canvasRect.width,
        height: canvasRect.height
      };
      setMetrics((prev) => {
        if (
          prev &&
          prev.left === nextMetrics.left &&
          prev.top === nextMetrics.top &&
          prev.width === nextMetrics.width &&
          prev.height === nextMetrics.height
        ) {
          return prev;
        }
        return nextMetrics;
      });
    };

    updateMetrics();
    const resizeObserver = new ResizeObserver(updateMetrics);
    resizeObserver.observe(bubbleEl);
    resizeObserver.observe(canvasEl);
    window.addEventListener('resize', updateMetrics);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateMetrics);
    };
  }, [canvasRef]);

  return (
    <div ref={bubbleRef} className={className} style={outerStyle}>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {backgroundSrc && metrics && blurPx > 0 ? (
          <img
            src={backgroundSrc}
            alt=""
            referrerPolicy="no-referrer"
            style={{
              position: 'absolute',
              left: `${-(metrics.left + samplingBleed)}px`,
              top: `${-(metrics.top + samplingBleed)}px`,
              width: `${metrics.width + samplingBleed * 2}px`,
              height: `${metrics.height + samplingBleed * 2}px`,
              objectFit: 'cover',
              filter: `blur(${Math.max(6, backgroundBaseBlur + blurPx * 1.2)}px) brightness(${backgroundBrightness})`,
              transform: 'scale(1.05)',
              transformOrigin: 'center center'
            }}
          />
        ) : null}
        <div style={{ position: 'absolute', inset: 0, backgroundColor: tintColor }} />
      </div>
      <div style={contentStyle}>{children}</div>
    </div>
  );
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
  const [proxyState, setProxyState] = useState(() => config.ui?.proxy ?? DEFAULT_UI_CONFIG.proxy);
  const [showSettings, setShowSettings] = useState(false);
  const [showSubtitlePanel, setShowSubtitlePanel] = useState(true);
  
  const [settingsPosition, setSettingsPosition] = useState<'left'|'right'>(() => config.ui?.settingsPosition ?? DEFAULT_UI_CONFIG.settingsPosition);

  // Panel Widths
  const [subtitleWidth, setSubtitleWidth] = useState(320);
  const [settingsWidth, setSettingsWidth] = useState(320);
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
  const [exportQuality, setExportQuality] = useState<'fast' | 'balance' | 'high'>('balance');
  const [filenameTemplate, setFilenameTemplate] = useState<'default' | 'timestamp' | 'unix' | 'custom'>('default');
  const [customFilename, setCustomFilename] = useState('');
  const [persistedCustomFilename, setPersistedCustomFilename] = useState('');
  const [cachedRemoteAssets, setCachedRemoteAssets] = useState<Record<string, string>>({});
  const [presets, setPresets] = useState<Record<string, any>>(() => config.ui?.presets ?? DEFAULT_UI_CONFIG.presets);
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
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const webAudioInputRef = useRef<HTMLInputElement>(null);
  const webSubtitleInputRef = useRef<HTMLInputElement>(null);
  const webProjectInputRef = useRef<HTMLInputElement>(null);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const subtitleFormat = (config.subtitleFormat || 'ass') as SubtitleFormat;
  const { subtitles, setSubtitles, loading: subtitlesLoading } = useAssSubtitle(config.assPath, config.speakers, webAssContent, config.content, subtitleFormat);
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
  const [previewFrameSize, setPreviewFrameSize] = useState(() => {
    const base = 520;
    const scale = Math.min(base / canvasWidth, base / canvasHeight);
    return {
      width: Math.round(canvasWidth * scale),
      height: Math.round(canvasHeight * scale)
    };
  });

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
      setPreviewFrameSize({
        width: Math.round(canvasWidth * safeScale),
        height: Math.round(canvasHeight * safeScale)
      });
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
      setPreviewFrameSize({
        width: Math.round(canvasWidth * safeScale),
        height: Math.round(canvasHeight * safeScale)
      });
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

  const formatAssTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  };

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

  const buildDialogueLine = (subtitle: any) => {
    const normalized = normalizeSubtitleSpeakerFields(subtitle);
    const text = (normalized.text || '').replace(/\r?\n/g, '\\N');
    return `Dialogue: 0,${formatAssTime(normalized.start)},${formatAssTime(normalized.end)},${normalized.style || 'Default'},${normalized.actor || ''},0,0,0,,${text}`;
  };

  const getDialogueInsertionIndex = (lines: string[]) => {
    const firstDialogueIndex = lines.findIndex((line) => line.startsWith('Dialogue:'));
    if (firstDialogueIndex !== -1) {
      return firstDialogueIndex;
    }

    let inEvents = false;
    let lastFormatIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === '[Events]') {
        inEvents = true;
        continue;
      }

      if (inEvents && trimmed.startsWith('Format:')) {
        lastFormatIndex = i;
        continue;
      }

      if (inEvents && trimmed.startsWith('[') && trimmed !== '[Events]') {
        break;
      }
    }

    return lastFormatIndex !== -1 ? lastFormatIndex + 1 : lines.length;
  };

  const createEmptyAssContent = () => {
    return [
      '[Script Info]',
      'ScriptType: v4.00+',
      'PlayResX: 1920',
      'PlayResY: 1080',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      'Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1',
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
    ].join('\n');
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

  const ensureAssPathForEditing = async () => {
    if (!window.electron) return null;
    if (config.assPath) return config.assPath;
    if (!projectPath || projectPath === 'web-demo') return null;

    const projectDir = projectPath.includes('/') ? projectPath.slice(0, projectPath.lastIndexOf('/')) : '';
    const projectFileName = projectPath.split('/').pop() || 'project.json';
    const assFileName = projectFileName.replace(/\.[^.]+$/, '') + '.ass';
    const nextAssPath = projectDir ? `${projectDir}/${assFileName}` : assFileName;

    try {
      await window.electron.writeFile(nextAssPath, createEmptyAssContent());
      setConfig((prev: any) => ({ ...prev, assPath: nextAssPath }));
      return nextAssPath;
    } catch (error) {
      console.error('Failed to create ASS file:', error);
      return null;
    }
  };

  const backupAssIfSpeakerNamesChanged = async () => {
    if (!window.electron || !config.assPath) return;

    const previousNames = savedSpeakerNamesRef.current;
    const currentNames = getSpeakerNameSnapshot(config.speakers);
    const changed = Object.keys(currentNames).some((key) => currentNames[key] !== previousNames[key]);
    if (!changed) return;

    try {
      const content = await window.electron.readFile(config.assPath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = config.assPath.replace(/\.ass$/i, `.${timestamp}.backup.ass`);
      await window.electron.writeFile(backupPath, content);
    } catch (error) {
      console.error('Failed to backup ASS before speaker rename sync:', error);
    }
  };

  const persistSubtitlesToAss = async (nextSubtitles: any[], shouldUpdateState = true) => {
    if (subtitleFormat !== 'ass') {
      const defaultSpeakerId = Object.keys(config.speakers || {}).find((key) => config.speakers[key]?.type !== 'annotation') || 'A';
      const normalized = nextSubtitles.map((subtitle: any, index: number) => ({
        ...subtitle,
        id: subtitle.id || `sub-${index}`,
        speakerId: subtitle.speakerId || defaultSpeakerId,
        sourceLineIndex: index
      }));
      if (shouldUpdateState) {
        setSubtitles(normalized);
      }
      return normalized;
    }

    if (!window.electron) {
      if (shouldUpdateState) {
        setSubtitles(nextSubtitles);
      }
      return nextSubtitles;
    }

    const activeAssPath = config.assPath || await ensureAssPathForEditing();
    if (!activeAssPath) {
      if (shouldUpdateState) {
        setSubtitles(nextSubtitles);
      }
      return nextSubtitles;
    }

    try {
      const content = await window.electron.readFile(activeAssPath);
      const lines = content.split('\n');
      const insertionIndex = getDialogueInsertionIndex(lines);
      const nonDialogueLines = lines.filter((line) => !line.startsWith('Dialogue:'));
      const normalizedSubtitles = nextSubtitles.map((subtitle) => normalizeSubtitleSpeakerFields(subtitle));
      const indexedSubtitles = normalizedSubtitles.map((subtitle, index) => ({
        ...subtitle,
        sourceLineIndex: insertionIndex + index,
        id: `sub-${insertionIndex + index}`
      }));

      nonDialogueLines.splice(insertionIndex, 0, ...indexedSubtitles.map((subtitle) => buildDialogueLine(subtitle)));
      await window.electron.writeFile(activeAssPath, nonDialogueLines.join('\n'));

      if (shouldUpdateState) {
        setSubtitles(indexedSubtitles);
      }

      return indexedSubtitles;
    } catch (e) {
      console.error('Failed to persist subtitles to ASS:', e);
      return nextSubtitles;
    }
  };

  const syncSubtitleToFile = async (id: string, updates: { start?: number, end?: number, text?: string; actor?: string; style?: string }) => {
    if (subtitleFormat !== 'ass') return;
    if (!window.electron || !config.assPath) return;
    try {
      const content = await window.electron.readFile(config.assPath);
      const lines = content.split('\n');
      const sourceLineIndex = parseInt(id.replace('sub-', ''), 10);

      if (Number.isNaN(sourceLineIndex) || !lines[sourceLineIndex]?.startsWith('Dialogue:')) {
        return;
      }

      const parts = lines[sourceLineIndex].split(',');
      if (parts.length >= 10) {
        if (updates.start !== undefined) parts[1] = formatAssTime(updates.start);
        if (updates.end !== undefined) parts[2] = formatAssTime(updates.end);
        if (updates.style !== undefined) parts[3] = updates.style;
        if (updates.actor !== undefined) parts[4] = updates.actor;
        if (updates.text !== undefined) parts[9] = updates.text.replace(/\n/g, '\\N');
        lines[sourceLineIndex] = parts.join(',');
      }
      
      await window.electron.writeFile(config.assPath, lines.join('\n'));
    } catch (e) {
      console.error('Failed to sync subtitle to file:', e);
    }
  };

  const handleUpdateSubtitle = async (id: string, updates: Partial<any>) => {
    const nextSubtitles = subtitles.map((subtitle: any) => {
      if (subtitle.id !== id) {
        return subtitle;
      }

      const merged = { ...subtitle, ...updates };
      return updates.speakerId ? normalizeSubtitleSpeakerFields(merged) : merged;
    });

    setSubtitles(nextSubtitles);

    if (updates.speakerId) {
      await persistSubtitlesToAss(nextSubtitles);
      return;
    }

    const updatedSubtitle = nextSubtitles.find((subtitle: any) => subtitle.id === id);
    if (updatedSubtitle) {
      await syncSubtitleToFile(id, {
        start: updates.start,
        end: updates.end,
        text: updates.text,
        actor: updatedSubtitle.actor,
        style: updatedSubtitle.style
      });
    }
  };

  const handleDeleteSubtitle = async (id: string) => {
    try {
      const nextSubtitles = subtitles.filter((sub: any) => sub.id !== id);
      await persistSubtitlesToAss(nextSubtitles);
      if (editingSub?.id === id) {
        setEditingSub(null);
      }
      showToast(t('app.subtitleDeleted'));
    } catch (e) {
      console.error('Failed to delete subtitle:', e);
    }
  };

  const handleAddSubtitle = async () => {
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
    const persistedSubtitles = await persistSubtitlesToAss(nextSubtitles);
    const createdSubtitle = persistedSubtitles.find((subtitle: any) => subtitle.start === newSubtitle.start && subtitle.end === newSubtitle.end && subtitle.text === newSubtitle.text && subtitle.speakerId === newSubtitle.speakerId);

    if (createdSubtitle) {
      setEditingSub({ id: createdSubtitle.id, start: createdSubtitle.start, end: createdSubtitle.end, text: createdSubtitle.text });
    }

    showToast(t('app.subtitleAdded'));
  };

  const handleSortSubtitles = async () => {
    const nextSubtitles = [...subtitles].sort((a, b) => a.start - b.start || a.end - b.end);
    await persistSubtitlesToAss(nextSubtitles);
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
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) return;

      const content = await window.electron.readFile(result.filePaths[0]);
      const parsed = JSON.parse(content);
      const existing = { ...presets };
      const imported: Record<string, any> = {};

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

      if (parsed && typeof parsed === 'object' && !parsed.speakers) {
        Object.entries(parsed).forEach(([presetName, presetValue]) => {
          imported[presetName] = presetValue;
        });
      }

      const speakerCount = parsed?.speakers && typeof parsed.speakers === 'object'
        ? Object.keys(parsed.speakers).length
        : 0;
      const presetCount = Object.keys(imported).length;
      if (presetCount === 0) {
        return;
      }

      const confirmed = window.confirm(`检测到 ${presetCount} 个预设 / ${speakerCount} 个 speaker，确定导入吗？`);
      if (!confirmed) {
        return;
      }

      setPresets({ ...existing, ...imported });
      showToast(t('app.presetsImported'));
    } catch (error) {
      console.error('Failed to import presets:', error);
    }
  };

  const handleExportPresets = async () => {
    if (!window.electron) {
      try {
        const blob = new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'pomchat-presets.json';
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
        defaultPath: 'pomchat-presets.json',
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });

      if (result.canceled || !result.filePath) return;
      await window.electron.writeFile(result.filePath, JSON.stringify(presets, null, 2));
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
        setWebAssContent(normalizedRestoredConfig.assPath);
      } else {
        setWebAssContent(null);
      }
      setProjectPath('web-demo');
      setRecentProject(parsed?.projectTitle || 'web-demo');
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
      setRecentProject(parsed?.projectTitle || 'web-demo');
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
    setThemeColorState((prev: string) => (prev === ui.themeColor ? prev : ui.themeColor));
    setSecondaryThemeColorState((prev: string) => (prev === ui.secondaryThemeColor ? prev : ui.secondaryThemeColor));
    setProxyState((prev: string) => (prev === (ui.proxy || '') ? prev : (ui.proxy || '')));
    setSettingsPosition((prev: 'left' | 'right') => (prev === ui.settingsPosition ? prev : ui.settingsPosition));
    if (window.electron) {
      setRecentProject((prev: string | null) => (prev === ui.recentProject ? prev : ui.recentProject));
    }
    setPresets((prev: Record<string, any>) => JSON.stringify(prev) === JSON.stringify(ui.presets || {}) ? prev : (ui.presets || {}));
  }, [config.ui]);

  useEffect(() => {
    setConfig((prev: any) => {
      const nextUi = {
        ...(prev.ui || DEFAULT_UI_CONFIG),
        isDarkMode,
        themeColor: themeColorState || (isDarkMode ? DARK_THEME_DEFAULT : LIGHT_THEME_DEFAULT),
        secondaryThemeColor: secondaryThemeColorState || DEFAULT_UI_CONFIG.secondaryThemeColor,
        proxy: proxyState.trim(),
        settingsPosition,
        recentProject,
        presets
      };

      if (JSON.stringify(prev.ui || {}) === JSON.stringify(nextUi)) {
        return prev;
      }

      return { ...prev, ui: nextUi };
    });
  }, [isDarkMode, themeColorState, secondaryThemeColorState, proxyState, settingsPosition, recentProject, presets]);

  useEffect(() => {
    if (!window.electron) return;
    window.electron.setProxy(proxyState.trim()).catch((err: any) => {
      console.error('Failed to apply proxy settings:', err);
    });
  }, [proxyState]);

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
          // Mark that we loaded from electron to prevent re-loading
        }
      } catch (error) {
        console.error('Failed to load config from Electron:', error);
      }
    };
    
    loadElectronConfig();
  }, []);

  // Save config changes to Electron file (debounced to prevent too frequent saves)
  useEffect(() => {
    // Only save if we have substantive changes (not just on every render)
    if (!window.electron) return;
    
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }, 250);

    return () => clearTimeout(saveTimer);
  }, [config]);

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
    if (isPlaying) {
      audio.play().catch((err) => {
        console.error("Audio playback failed:", err);
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [isPlaying]);

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
  }, [config.audioPath]);

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
    if (!audioRef.current) {
      return;
    }

    const time = audioRef.current.currentTime;
    if (!isPlaying) {
      setCurrentTime(time);
    }
  };

  useEffect(() => {
    if (!isPlaying || !audioRef.current) {
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
  }, [isPlaying]);

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
      if (!Number.isFinite(audioRef.current.duration) || audioRef.current.duration <= 0) {
        showToast('浏览器安全策略导致未自动加载音频，请重新选择音频文件');
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

  const generateFilename = (template: 'default' | 'timestamp' | 'unix' | 'custom', customName: string): string => {
    if (template === 'custom' && customName.trim()) {
      const name = customName.trim();
      return name.endsWith('.mp4') ? name : `${name}.mp4`;
    }

    const now = new Date();
    const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const timeStr = String(now.getHours()).padStart(2, '0') + '-' + String(now.getMinutes()).padStart(2, '0') + '-' + String(now.getSeconds()).padStart(2, '0');
    const unixTime = Math.floor(now.getTime() / 1000);

    if (template === 'timestamp') {
      return `pomchat_${dateStr}_${timeStr}.mp4`;
    }
    if (template === 'unix') {
      return `pomchat_${unixTime}.mp4`;
    }
    return 'pomchat.mp4';
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
    if (quality === 'fast') return 23;
    if (quality === 'high') return 18;
    return 20;
  };

  const calculateX264Preset = (quality: 'fast' | 'balance' | 'high'): 'ultrafast' | 'veryfast' | 'fast' => {
    if (quality === 'fast') return 'ultrafast';
    if (quality === 'high') return 'fast';
    return 'veryfast';
  };

  const getProjectConfig = () => {
    const restConfig: any = Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'ui'));
    return {
      ...restConfig,
      content: subtitles.map(s => ({
        start: s.start,
        end: s.end,
        speaker: s.speakerId,
        type: 'text',
        text: s.text
      }))
    };
  };

  const getExportConfig = () => {
    const restConfig = getProjectConfig();
    const remappedSpeakers = Object.fromEntries(
      Object.entries(restConfig.speakers || {}).map(([key, speaker]: [string, any]) => [
        key,
        {
          ...speaker,
          avatar: cachedRemoteAssets[speaker?.avatar || ''] || speaker?.avatar || ''
        }
      ])
    );
    return {
      ...restConfig,
      speakers: remappedSpeakers,
      background: restConfig.background
        ? {
            ...restConfig.background,
            image: cachedRemoteAssets[restConfig.background.image || ''] || restConfig.background.image
          }
        : restConfig.background
    };
  };

  const getDefaultExportRange = useCallback(() => {
    const latestSubtitle = subtitles.reduce((max, item) => Math.max(max, item.end), 0);
    const start = 0;
    const end = Number(Math.max(duration || 0, latestSubtitle || 0, start).toFixed(2));
    return { start, end };
  }, [duration, subtitles]);

  const isSameRange = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start === b.start && a.end === b.end;

  const updateExportRange = useCallback((updates: { start?: number; end?: number }, markTouched = true) => {
    const defaults = getDefaultExportRange();
    if (markTouched) {
      exportRangeTouchedRef.current = true;
    }

    setExportRange((prev) => {
      const rawStart = updates.start ?? prev.start;
      const rawEnd = updates.end ?? prev.end;
      const nextStart = Number(Math.max(0, Math.min(rawStart, rawEnd)).toFixed(2));
      const maxEnd = Math.max(defaults.end, rawEnd, nextStart);
      const nextEnd = Number(Math.max(nextStart, Math.min(rawEnd, maxEnd)).toFixed(2));
      return { start: nextStart, end: nextEnd };
    });
  }, [getDefaultExportRange]);

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
  }, [projectPath, config.assPath, config.audioPath]);

  useEffect(() => {
    const defaults = getDefaultExportRange();
    
    // Try to restore from config if available
    if (config.exportRange && config.exportRange.start !== undefined && config.exportRange.end !== undefined) {
      const saved = config.exportRange;
      const nextStart = Number(Math.max(0, Math.min(saved.start, defaults.end)).toFixed(2));
      const nextEnd = Number(Math.max(nextStart, Math.min(saved.end, Math.max(defaults.end, saved.end))).toFixed(2));
      setExportRange((prev) => {
        const nextRange = { start: nextStart, end: nextEnd };
        return isSameRange(prev, nextRange) ? prev : nextRange;
      });
      exportRangeTouchedRef.current = true;
      return;
    }
    
    if (!exportRangeTouchedRef.current) {
      setExportRange((prev) => (isSameRange(prev, defaults) ? prev : defaults));
      return;
    }

    setExportRange((prev) => {
      const nextStart = Number(Math.max(0, Math.min(prev.start, defaults.end)).toFixed(2));
      const nextEnd = Number(Math.max(nextStart, Math.min(prev.end, Math.max(defaults.end, prev.end))).toFixed(2));
      const nextRange = { start: nextStart, end: nextEnd };
      return isSameRange(prev, nextRange) ? prev : nextRange;
    });
  }, [getDefaultExportRange, config.exportRange]);

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
  }, [config.exportQuality, config.filenameTemplate, config.customFilename]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPersistedCustomFilename((prev) => (prev === customFilename ? prev : customFilename));
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [customFilename]);

  useEffect(() => {
    setConfig((prev: any) => {
      const sameExportRange =
        prev.exportRange?.start === exportRange.start &&
        prev.exportRange?.end === exportRange.end;
      const sameQuality = prev.exportQuality === exportQuality;
      const sameTemplate = prev.filenameTemplate === filenameTemplate;
      const sameCustomFilename = prev.customFilename === persistedCustomFilename;

      if (sameExportRange && sameQuality && sameTemplate && sameCustomFilename) {
        return prev;
      }

      return {
        ...prev,
        exportRange,
        exportQuality,
        filenameTemplate,
        customFilename: persistedCustomFilename
      };
    });
  }, [exportRange, exportQuality, filenameTemplate, persistedCustomFilename]);

  useEffect(() => {
    if (!window.electron) {
      return;
    }

    const unsubscribe = window.electron.onExportProgress((payload) => {
      setExportProgress(payload);
    });

    void loadExportPaths();
    return unsubscribe;
  }, [loadExportPaths]);

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
    setExportStatusMessage(t('export.statusIdle'));
    setShowExportModal(true);
  }, [exportOutputPath, getDefaultExportRange, loadExportPaths, t]);

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

    const filename = generateFilename(filenameTemplate, customFilename);
    trimmedPath = applyFilenameTemplateToPath(trimmedPath, filename);

    if (exportRange.end <= exportRange.start) {
      setExportStatusMessage(t('export.invalidRange'));
      return;
    }

    setIsExporting(true);
    setLastExportOutputPath(trimmedPath);
    setLastExportSucceeded(false);
    setExportProgress({ progress: 0, elapsedMs: 0, estimatedRemainingMs: null, stage: t('export.preparing') });
    setExportStatusMessage(t('export.preparing'));

    try {
      const crf = calculateCRF(exportQuality);
      const preset = calculateX264Preset(exportQuality);
      
      const res = await window.electron.exportVideo({
        ...getExportConfig(),
        outputPath: trimmedPath,
        exportRange,
        exportQuality,
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
    }
  }, [exportOutputPath, exportRange, exportQuality, filenameTemplate, customFilename, getExportConfig, showToast, t, generateFilename, calculateCRF, calculateX264Preset]);

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
    downloadAnchorNode.setAttribute("download", "pomchat_project.json");
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

  const toFileUrl = (localPath: string) => {
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

  const resolvePath = (path: string | undefined): string | undefined => {
    if (!path) return undefined;

    const trimmed = path.trim();
    if (!trimmed) return undefined;

    if (cachedRemoteAssets[trimmed]) {
      return toFileUrl(cachedRemoteAssets[trimmed]);
    }

    if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('file://')) {
      return trimmed;
    }

    if (/^www\./i.test(trimmed)) {
      return `https://${trimmed}`;
    }

    if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
      return toFileUrl(trimmed);
    }

    if (trimmed.startsWith('\\\\')) {
      return toFileUrl(trimmed);
    }

    if (trimmed.startsWith('/') && !trimmed.startsWith('/projects/') && !trimmed.startsWith('/assets/')) {
      return toFileUrl(trimmed);
    }

    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  };

  useEffect(() => {
    if (!window.electron) {
      return;
    }

    const urls = [
      config.background?.image,
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
  }, [config.background?.image, config.speakers, cachedRemoteAssets]);

  const resolvedAudioPath = webAudioObjectUrl || resolvePath(config.audioPath) || '';

  const validateProjectConfig = (parsed: any) => {
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('无效的配置文件：不是一个有效的 JSON 对象');
    }
    
    const requiredKeys = ['fps', 'dimensions', 'audioPath', 'assPath', 'speakers'];
    for (const key of requiredKeys) {
      if (parsed[key] === undefined) {
        throw new Error(`无效的配置文件：缺少必要字段 "${key}"`);
      }
    }
    
    if (typeof parsed.dimensions !== 'object' || !parsed.dimensions.width || !parsed.dimensions.height) {
      throw new Error('无效的配置文件：dimensions 尺寸格式错误');
    }

    if (typeof parsed.speakers !== 'object') {
      throw new Error('无效的配置文件：speakers 格式错误');
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
        defaultPath: 'pomchat_project.json',
        filters: [{ name: 'JSON Config', extensions: ['json'] }]
      });
      
      if (!result.canceled && result.filePath) {
        const newConfig = { ...createBlankProjectConfig(t('app.newProject')), ...safeOverrides };
        await window.electron.writeFile(result.filePath, JSON.stringify(newConfig, null, 2));
        setProjectPath(result.filePath);
        setRecentProject(result.filePath);
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
      alert('创建失败: ' + e.message);
    }
  };

  const handleCloseProject = () => {
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
        filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'aac', 'm4a', 'flac'] }],
        properties: ['openFile']
      });
      if (!res.canceled && res.filePaths.length > 0) {
        setConfig((prev: any) => ({ ...prev, audioPath: res.filePaths[0] }));
        showToast(t('app.audioUpdated'));
      }
    } catch (e: any) {
      alert('选择音频失败: ' + e.message);
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
        filters: [{ name: 'Subtitle Files', extensions: ['ass', 'srt', 'lrc'] }],
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
          setConfig((prev: any) => ({
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
      alert('选择字幕失败: ' + e.message);
    }
  };

  const importFileByPath = useCallback(async (filePath: string, currentProjectPath: string | null) => {
    if (!window.electron || !filePath) return;

    const normalizedPath = filePath.toLowerCase();
    const isJson = normalizedPath.endsWith('.json');
    const isAss = normalizedPath.endsWith('.ass');
    const isSrt = normalizedPath.endsWith('.srt');
    const isLrc = normalizedPath.endsWith('.lrc');
    const isAudio = /(\.mp3|\.wav|\.aac|\.m4a|\.flac|\.mp4)$/i.test(normalizedPath);

    if (isJson) {
      await loadProjectFromPath(filePath);
      showToast(t('app.projectImported'));
      return;
    }

    if (!isAss && !isSrt && !isLrc && !isAudio) {
      showToast(t('app.dropUnsupported'));
      return;
    }

    if (!currentProjectPath) {
      // 位于欢迎页时，先询问新建项目，然后注入对应的路径
      const overrides: any = {};
      if (isAudio) overrides.audioPath = filePath;
      
      const result = await window.electron.showSaveDialog({
        title: t('dialog.newProjectTitle'),
        defaultPath: 'pomchat_project.json',
        filters: [{ name: 'JSON Config', extensions: ['json'] }]
      });
      
      if (result.canceled || !result.filePath) return;
      
      const newConfig = { ...createBlankProjectConfig(t('app.newProject')), ...overrides };
      await window.electron.writeFile(result.filePath, JSON.stringify(newConfig, null, 2));
      
      setProjectPath(result.filePath);
      setRecentProject(result.filePath);
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
      setConfig((prev: any) => ({ ...prev, audioPath: filePath }));
      showToast(t('app.audioImported'));
      return;
    }
  }, [config.speakers, presets, showToast, t]);


  const handleSelectImage = async (): Promise<string | null> => {
    if (!window.electron) {
      alert('网页版不支持此功能，请手动输入网络图片链接');
      return null;
    }
    try {
      const res = await window.electron.showOpenDialog({
        title: t('dialog.selectImageTitle'),
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        properties: ['openFile']
      });
      if (!res.canceled && res.filePaths.length > 0) {
        return res.filePaths[0];
      }
    } catch (e: any) {
      alert('选择图片失败: ' + e.message);
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
      setRecentProject(filePath);
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
      alert('加载失败: ' + e.message);
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
        filters: [{ name: 'JSON Config', extensions: ['json'] }],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        await loadProjectFromPath(result.filePaths[0]);
      }
    } catch (e: any) {
      alert('选择文件失败: ' + e.message);
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
    setConfig((prev: any) => ({ ...prev, audioPath: nextObjectUrl }));
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
      setConfig((prev: any) => ({
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
      const imported: Record<string, any> = {};

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

      if (parsed && typeof parsed === 'object' && !parsed.speakers) {
        Object.entries(parsed).forEach(([presetName, presetValue]) => {
          imported[presetName] = presetValue;
        });
      }

      const speakerCount = parsed?.speakers && typeof parsed.speakers === 'object'
        ? Object.keys(parsed.speakers).length
        : 0;
      const presetCount = Object.keys(imported).length;
      if (presetCount === 0) {
        showToast(t('app.dropUnsupported'));
        return;
      }

      const confirmed = window.confirm(`检测到 ${presetCount} 个预设 / ${speakerCount} 个 speaker，确定导入吗？`);
      if (!confirmed) {
        return;
      }

      setPresets({ ...existing, ...imported });
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
    const isJson = normalizedName.endsWith('.json');
    const isAss = normalizedName.endsWith('.ass');
    const isSrt = normalizedName.endsWith('.srt');
    const isLrc = normalizedName.endsWith('.lrc');
    const isAudio = /\.(mp3|wav|aac|m4a|flac|mp4|ogg|opus)$/i.test(normalizedName);

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
        setRecentProject(file.name);
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
        alert('加载失败: ' + e.message);
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
      setConfig((prev: any) => ({ ...prev, audioPath: nextObjectUrl }));
      showToast(t('app.audioImported'));
      return;
    }

    showToast(t('app.dropUnsupported'));
  }, [config.speakers, showToast, t, validateProjectConfig, webAudioObjectUrl]);

  const handleSaveProject = async () => {
    if (!window.electron || !projectPath || projectPath === 'web-demo') {
      const finalConfig = getProjectConfig();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(finalConfig));
      setRecentProject(finalConfig.projectTitle || 'web-demo');
      showToast(t('app.projectSaved'));
      return;
    }

    try {
      await backupAssIfSpeakerNamesChanged();
      await persistSubtitlesToAss(subtitles, false);
      const finalConfig = getProjectConfig();
      await window.electron.writeFile(projectPath, JSON.stringify(finalConfig, null, 2));
      savedSpeakerNamesRef.current = getSpeakerNameSnapshot(config.speakers);
      showToast(t('app.projectSaved'));
    } catch (e: any) {
      alert('保存失败: ' + e.message);
    }
  };

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
      setRecentProject(file.name);
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
      alert('加载失败: ' + e.message);
    } finally {
      event.target.value = '';
    }
  };

  const textClass = isDarkMode ? "text-white" : "text-gray-900";
  const canvasBg = isDarkMode ? "bg-[#111]" : "bg-gray-200/50";
  const dividerClass = isDarkMode ? "hover:opacity-100" : "hover:opacity-100";
  const defaultExportRange = getDefaultExportRange();
  const visibleAnnotations = subtitles.filter((item) => {
    const speaker = config.speakers[item.speakerId];
    if (!speaker || speaker.type !== 'annotation') return false;
    const animationStyle = config.chatLayout?.animationStyle || 'rise';
    const animationDuration = config.chatLayout?.animationDuration ?? 0.2;
    const appearanceTime = Math.max(0, item.start - (animationStyle === 'none' ? 0 : animationDuration));
    return currentTime >= appearanceTime && currentTime <= item.end;
  });
  const visibleMessages = useMemo(() => {
    const appeared = subtitles.filter((item) => {
      const speaker = config.speakers[item.speakerId];
      if (!speaker || speaker.type === 'annotation') return false;
      const animationStyle = config.chatLayout?.animationStyle || 'rise';
      const animationDuration = config.chatLayout?.animationDuration ?? 0.2;
      const animationLeadTime = animationStyle === 'none' ? 0 : animationDuration;
      const appearanceTime = Math.max(0, item.start - animationLeadTime);
      return currentTime >= appearanceTime;
    });

    const inWindow = appeared.filter((item) => (
      item.start >= currentTime - MESSAGE_LOOKBACK_SECONDS &&
      item.start <= currentTime + MESSAGE_LOOKAHEAD_SECONDS
    ));

    return inWindow.length >= MESSAGE_FALLBACK_COUNT
      ? inWindow
      : appeared.slice(-MESSAGE_FALLBACK_COUNT);
  }, [subtitles, config.speakers, config.chatLayout?.animationStyle, config.chatLayout?.animationDuration, currentTime]);
  const latestVisibleMessageId = visibleMessages.length > 0 ? visibleMessages[visibleMessages.length - 1].id : '';

  useEffect(() => {
    if (!isPlaying || !scrollRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, [latestVisibleMessageId, isPlaying, seekTick]);

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

  const handleAppDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };
  const handleAppDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };
  const handleAppDrop = (e: React.DragEvent<HTMLDivElement>) => {
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
      <div className="relative w-full h-[100dvh]" style={{ background: appBackground, color: uiTheme.text, ['--pomchat-scrollbar-thumb' as any]: `${secondaryThemeColor}77`, ['--pomchat-scrollbar-thumb-hover' as any]: `${secondaryThemeColor}AA` }} onDragOver={handleAppDragOver} onDragLeave={handleAppDragLeave} onDrop={handleAppDrop}>
        {!window.electron && (
          <>
            <input
              ref={webProjectInputRef}
              type="file"
              accept=".json,application/json"
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
          onOpenRecent={() => {
            if (window.electron) {
              if (recentProject) {
                void loadProjectFromPath(recentProject);
              }
              return;
            }
            loadWebSavedProject();
          }}
          onOpenSettings={() => setShowSettings(true)}
          recentProject={recentProject}
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
                onConfigChange={setConfig}
                isDarkMode={isDarkMode}
                language={language}
                themeColor={themeColor}
                secondaryThemeColor={secondaryThemeColor}
                proxy={proxyState}
                onThemeColorChange={setThemeColorState}
                onSecondaryThemeColorChange={setSecondaryThemeColorState}
                onProxyChange={setProxyState}
                onLanguageChange={(nextLanguage: Language) => setConfig((prev: any) => ({ ...prev, language: nextLanguage }))}
                onThemeChange={setIsDarkMode}
                settingsPosition={settingsPosition}
                onPositionChange={setSettingsPosition}
                onClose={() => setShowSettings(false)}
                onSave={handleSaveConfig}
                showToast={showToast}
                presets={presets}
                onPresetsChange={setPresets}
                globalOnly
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                onSelectImage={handleSelectImage}
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
      style={{ background: appBackground, ['--pomchat-scrollbar-thumb' as any]: `${secondaryThemeColor}77`, ['--pomchat-scrollbar-thumb-hover' as any]: `${secondaryThemeColor}AA` }}
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
        onAddSubtitle={handleAddSubtitle}
        onImportPresets={handleImportPresets}
        onExportPresets={handleExportPresets}
        onSortSubtitles={handleSortSubtitles}
        onCloseProject={handleCloseProject}
        onExportVideo={() => {
          if (!window.electron) {
            showToast(t('welcome.webMode'));
            return;
          }
          void handleOpenExportModal();
        }}
        onExportConfig={exportConfig}
      />

      {!window.electron && (
        <>
          <input
            ref={webProjectInputRef}
            type="file"
            accept=".json,application/json"
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
        key={resolvedAudioPath}
        ref={audioRef}
        className="hidden"
        src={resolvedAudioPath}
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
                onConfigChange={setConfig} 
                isDarkMode={isDarkMode}
                language={language}
                themeColor={themeColor}
                secondaryThemeColor={secondaryThemeColor}
                proxy={proxyState}
                onThemeColorChange={setThemeColorState}
                onSecondaryThemeColorChange={setSecondaryThemeColorState}
                onProxyChange={setProxyState}
                onLanguageChange={(nextLanguage: Language) => setConfig((prev: any) => ({ ...prev, language: nextLanguage }))}
                onThemeChange={setIsDarkMode}
                settingsPosition={settingsPosition}
                onPositionChange={setSettingsPosition}
                onClose={() => setShowSettings(false)}
                onSave={handleSaveProject}
                showToast={showToast}
                presets={presets}
                onPresetsChange={setPresets}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                onSelectImage={handleSelectImage}
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
                  title="切换字幕列表"
                >
                  {showSubtitlePanel ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
                </button>
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
                  onConfigChange={setConfig}
                  isDarkMode={isDarkMode}
                   language={language}
                   themeColor={themeColor}
                   secondaryThemeColor={secondaryThemeColor}
                   proxy={proxyState}
                   onThemeColorChange={setThemeColorState}
                   onSecondaryThemeColorChange={setSecondaryThemeColorState}
                   onProxyChange={setProxyState}
                   onLanguageChange={(nextLanguage: Language) => setConfig((prev: any) => ({ ...prev, language: nextLanguage }))}
                   onThemeChange={setIsDarkMode}
                  settingsPosition={settingsPosition}
                  onPositionChange={setSettingsPosition}
                  onClose={() => setShowSettings(false)}
                  onSave={handleSaveProject}
                  showToast={showToast}
                  presets={presets}
                  onPresetsChange={setPresets}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  onSelectImage={handleSelectImage}
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
                  width: `${previewFrameSize.width}px`,
                  height: `${previewFrameSize.height}px`,
                  aspectRatio,
                  borderColor: isDarkMode ? '#1f2937' : '#d1d5db',
                  isolation: 'isolate',
                  boxShadow: '0 12px 28px rgba(0,0,0,0.16)'
                }}
              >
              
              {/* Fallback color layer if no background image */}
              <div className="absolute inset-0 z-0" style={{ backgroundColor: isDarkMode ? '#111111' : '#ffffff', borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.12)' }} />

              {/* Background Image Wrapper */}
              {config.background?.image && (
                <div className="absolute inset-0 z-10 overflow-hidden">
                  <img 
                    src={resolvePath(config.background.image)}
                    alt="Background"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    style={{ 
                      filter: `blur(${config.background.blur || 0}px) brightness(${config.background.brightness ?? 1.0})`,
                      transform: 'scale(1.05)', // prevent white edges when blurred
                      transformOrigin: 'center center'
                    }}
                  />
                </div>
              )}

              {/* Chat Stream */}
              <div
                className="absolute inset-0 z-20 flex flex-col overflow-hidden"
                style={{
                  paddingTop: `${(previewChatLayout?.paddingTop ?? 48) * Math.max(0.35, previewScale)}px`,
                  paddingLeft: `${(previewChatLayout?.paddingLeft ?? previewChatLayout?.paddingX ?? 48) * Math.max(0.35, previewScale)}px`,
                  paddingRight: `${(previewChatLayout?.paddingRight ?? previewChatLayout?.paddingX ?? 48) * Math.max(0.35, previewScale)}px`
                }}
              >
                <div
                  ref={scrollRef}
                  className="preview-scroll-hidden flex-1 min-h-0 overflow-y-auto"
                >
                  <div
                    className="flex min-h-full flex-col justify-end"
                    style={{
                      paddingBottom: `${(previewChatLayout?.paddingBottom ?? 80) * Math.max(0.35, previewScale)}px`
                    }}
                  >
                    {subtitlesLoading ? (
                      <div className="text-center opacity-50 my-auto">{t('app.loadSubtitle')}</div>
                    ) : (
                      visibleMessages.map((item) => {
                        const speaker = config.speakers[item.speakerId];
                        if (!speaker || speaker.type === 'annotation') return null;

                        return (
                          <ChatMessageBubble
                            key={item.id}
                            item={{ key: item.id, start: item.start, end: item.end, text: item.text, speakerId: item.speakerId }}
                            speaker={speaker}
                            currentTime={currentTime}
                            canvasWidth={canvasWidth}
                            layoutScale={previewScale}
                            chatLayout={previewChatLayout}
                            fallbackAvatarBorderColor={isDarkMode ? '#1f2937' : '#ffffff'}
                            renderAvatar={({ src, alt, style }) => (
                              <img
                                src={resolvePath(src)}
                                alt={alt}
                                referrerPolicy="no-referrer"
                                className={`rounded-full shrink-0 shadow-lg object-cover ${isDarkMode ? 'border-gray-800 bg-gray-900' : 'border-white bg-gray-200'}`}
                                style={{ ...style, backgroundColor: style.borderColor as string }}
                              />
                            )}
                            renderBubble={({ outerStyle, contentStyle, children }) => {
                              const tintColor = typeof outerStyle.backgroundColor === 'string' ? outerStyle.backgroundColor : '#ffffff';
                              const bubbleStyle = { ...outerStyle };
                              delete bubbleStyle.backgroundColor;
                              return (
                                <SnapshotBubble
                                  canvasRef={previewFrameRef}
                                  backgroundSrc={resolvePath(config.background?.image)}
                                  backgroundBrightness={config.background?.brightness ?? 1}
                                  backgroundBaseBlur={config.background?.blur || 0}
                                  blurPx={0}
                                  tintColor={tintColor}
                                  className="break-words"
                                  outerStyle={bubbleStyle}
                                  contentStyle={contentStyle}
                                >
                                  <p className="leading-relaxed whitespace-pre-wrap">{children}</p>
                                </SnapshotBubble>
                              );
                            }}
                          />
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {visibleAnnotations.length > 0 && (
                <div className="absolute inset-x-0 top-0 bottom-0 z-30 pointer-events-none flex flex-col justify-between" style={{ padding: `${24 * Math.max(0.35, previewScale)}px ${32 * Math.max(0.35, previewScale)}px` }}>
                  <div className="flex flex-col items-center gap-3">
                    {visibleAnnotations.filter((item) => config.speakers[item.speakerId]?.style?.annotationPosition === 'top').map((item) => {
                      const speaker = config.speakers[item.speakerId];
                      return (
                        <div key={item.id}>
                          <ChatAnnotationBubble
                            item={{ key: item.id, start: item.start, end: item.end, text: item.text, speakerId: item.speakerId }}
                            speaker={speaker}
                            layoutScale={previewScale}
                            chatLayout={{ ...previewChatLayout, bubbleScale: previewChatLayout?.bubbleScale }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    {visibleAnnotations.filter((item) => (config.speakers[item.speakerId]?.style?.annotationPosition || 'bottom') === 'bottom').map((item) => {
                      const speaker = config.speakers[item.speakerId];
                      return (
                        <div key={item.id}>
                          <ChatAnnotationBubble
                            item={{ key: item.id, start: item.start, end: item.end, text: item.text, speakerId: item.speakerId }}
                            speaker={speaker}
                            layoutScale={previewScale}
                            chatLayout={{ ...previewChatLayout, bubbleScale: previewChatLayout?.bubbleScale }}
                          />
                        </div>
                      );
                    })}
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
                onConfigChange={setConfig} 
                isDarkMode={isDarkMode}
                language={language}
                themeColor={themeColor}
                secondaryThemeColor={secondaryThemeColor}
                proxy={proxyState}
                onThemeColorChange={setThemeColorState}
                onSecondaryThemeColorChange={setSecondaryThemeColorState}
                onProxyChange={setProxyState}
                onLanguageChange={(nextLanguage: Language) => setConfig((prev: any) => ({ ...prev, language: nextLanguage }))}
                onThemeChange={setIsDarkMode}
                settingsPosition={settingsPosition}
                onPositionChange={setSettingsPosition}
                onClose={() => setShowSettings(false)}
                onSave={handleSaveProject}
                showToast={showToast}
                presets={presets}
                onPresetsChange={setPresets}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                onSelectImage={handleSelectImage}
              />
            </div>
          </div>
        )}
      </div>

      <PlayerControls 
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
        onEditingSubChange={(start, end) => {
          if (editingSub) {
            setEditingSub({ ...editingSub, start, end });
            handleUpdateSubtitle(editingSub.id, { start, end, duration: Number((end - start).toFixed(2)) });
          }
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
                {isMobileBottomPanelExpanded ? '收起' : '展开'}
              </button>
            </div>
          )}
          <SettingsPanel
            config={config}
            onConfigChange={setConfig}
            isDarkMode={isDarkMode}
            language={language}
            themeColor={themeColor}
            secondaryThemeColor={secondaryThemeColor}
            proxy={proxyState}
            onThemeColorChange={setThemeColorState}
            onSecondaryThemeColorChange={setSecondaryThemeColorState}
            onProxyChange={setProxyState}
            onLanguageChange={(nextLanguage: Language) => setConfig((prev: any) => ({ ...prev, language: nextLanguage }))}
            onThemeChange={setIsDarkMode}
            settingsPosition={settingsPosition}
            onPositionChange={setSettingsPosition}
            onClose={() => {
              setIsMobileBottomPanelCollapsed((prev) => !prev);
            }}
            onSave={window.electron ? handleSaveProject : handleSaveConfig}
            showToast={showToast}
            presets={presets}
            onPresetsChange={setPresets}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onSelectImage={handleSelectImage}
            showSubtitleTab
            compactHeader
            hideHeader
            panelCollapsed={isMobileBottomPanelCollapsed}
            onTogglePanelCollapsed={() => setIsMobileBottomPanelCollapsed((prev) => !prev)}
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
          exportQuality={exportQuality}
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
         onQualityChange={setExportQuality}
         onFilenameTemplateChange={setFilenameTemplate}
         onCustomFilenameChange={setCustomFilename}
         onStartExport={handleStartExport}
         onRevealOutput={handleRevealExport}
       />

      {importAssData && (
        <AssImportModal 
          assPath={importAssData.path}
          assContent={importAssData.content}
          isDarkMode={isDarkMode}
          language={language}
          themeColor={themeColor}
          secondaryThemeColor={secondaryThemeColor}
          onCancel={() => setImportAssData(null)}
          onConfirm={async (path, newSpeakers, importedPresets) => {
            const sanitizedContent = sanitizeImportedAssContent(importAssData.content);

            if (window.electron && sanitizedContent !== importAssData.content) {
              try {
                await window.electron.writeFile(path, sanitizedContent);
              } catch (error) {
                console.error('Failed to sanitize imported ASS file:', error);
              }
            }

            setConfig((prev: any) => ({
              ...prev,
              subtitleFormat: 'ass',
              assPath: path,
              speakers: newSpeakers
            }));
            if (importedPresets && Object.keys(importedPresets).length > 0) {
              setPresets((prev: Record<string, any>) => ({
                ...prev,
                ...importedPresets
              }));
            }
            if (!window.electron) {
              setWebAssContent(sanitizedContent);
            }
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
