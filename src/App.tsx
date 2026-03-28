import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { demoConfig as initialConfig } from './projects/demo/config';
import { SettingsPanel } from './components/SettingsPanel';
import { PlayerControls } from './components/PlayerControls';
import { SubtitlePanel } from './components/SubtitlePanel';
import { MenuBar } from './components/MenuBar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { AssImportModal } from './components/AssImportModal';
import { ExportModal } from './components/ExportModal';
import { useAssSubtitle } from './hooks/useAssSubtitle';
import { translate, type Language } from './i18n';
import { createThemeTokens } from './theme';
import { PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react';
import './App.css';

const LIGHT_THEME_DEFAULT = '#9ca4b8';
const DARK_THEME_DEFAULT = '#545454';

// Local Storage Keys
const STORAGE_KEY = 'podchat_demo_config';
const SETTINGS_POS_KEY = 'podchat_settings_pos';
const THEME_KEY = 'podchat_theme';
const THEME_COLOR_KEY = 'podchat_theme_color';
const SECONDARY_THEME_COLOR_KEY = 'podchat_secondary_theme_color';
const RECENT_PROJECT_KEY = 'podchat_recent_project';
const PLAYBACK_POSITION_KEY = 'podchat_playback_positions';

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
  paddingTop: 48,
  paddingBottom: 30,
  paddingX: 48,
  paddingLeft: 48,
  paddingRight: 48,
  bubbleScale: 1.5,
  avatarSize: 80,
  speakerNameSize: 22,
  animationStyle: 'rise',
  animationDuration: 0.25
};

const LEGACY_DEMO_PATH_PREFIXES = ['src/projects/demo/', 'projects/demo/'];

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

const normalizeDemoAssetPath = (path: unknown, fallback: string) => {
  if (typeof path !== 'string') {
    return fallback;
  }

  if (!path.trim()) {
    return '';
  }

  const normalizedPath = path.replace(/\\/g, '/').trim();

  if (normalizedPath === fallback) {
    return fallback;
  }

  if (LEGACY_DEMO_PATH_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) {
    return fallback;
  }

  if (normalizedPath.startsWith('projects/demo/assets/')) {
    return `/${normalizedPath}`;
  }

  return normalizedPath;
};

const sanitizeProjectConfig = (parsed: any) => {
  const legacyPaddingX = parsed?.chatLayout?.paddingX;
  const merged = {
    ...initialConfig,
    ...parsed,
    dimensions: { ...initialConfig.dimensions, ...(parsed?.dimensions || {}) },
    chatLayout: {
      ...DEFAULT_CHAT_LAYOUT,
      ...initialConfig.chatLayout,
      ...(parsed?.chatLayout || {}),
      paddingLeft: parsed?.chatLayout?.paddingLeft ?? legacyPaddingX ?? (initialConfig.chatLayout as any)?.paddingLeft ?? initialConfig.chatLayout?.paddingX ?? DEFAULT_CHAT_LAYOUT.paddingLeft,
      paddingRight: parsed?.chatLayout?.paddingRight ?? legacyPaddingX ?? (initialConfig.chatLayout as any)?.paddingRight ?? initialConfig.chatLayout?.paddingX ?? DEFAULT_CHAT_LAYOUT.paddingRight
    },
    background: { ...initialConfig.background, ...(parsed?.background || {}) },
    speakers: Object.fromEntries(
      Object.entries({ ...initialConfig.speakers, ...(parsed?.speakers || {}) }).map(([speakerId, speaker]: [string, any]) => [
        speakerId,
        {
          ...speaker,
          style: {
            ...DEFAULT_BUBBLE_STYLE,
            ...(speaker?.style || {})
          }
        }
      ])
    )
  };

  const isDemoProject = merged.projectId === initialConfig.projectId;
  if (!isDemoProject) {
    return merged;
  }

  return {
    ...merged,
    audioPath: normalizeDemoAssetPath(merged.audioPath, initialConfig.audioPath),
    assPath: normalizeDemoAssetPath(merged.assPath, initialConfig.assPath)
  };
};

const createBlankProjectConfig = (projectTitle: string) => ({
  ...initialConfig,
  projectId: `project-${Date.now()}`,
  projectTitle,
  audioPath: '',
  assPath: '',
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
  }
});

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
      setMetrics({
        left: bubbleRect.left - canvasRect.left,
        top: bubbleRect.top - canvasRect.top,
        width: canvasRect.width,
        height: canvasRect.height
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
  }, [canvasRef, children]);

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

  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [recentProject, setRecentProject] = useState<string | null>(() => localStorage.getItem(RECENT_PROJECT_KEY));

  // Load initial from localStorage if available
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return sanitizeProjectConfig(parsed);
      } catch (e) {
        return initialConfig;
      }
    }
    return initialConfig;
  });

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem(THEME_KEY) !== 'light');
  const [themeColorState, setThemeColorState] = useState(() => localStorage.getItem(THEME_COLOR_KEY) || '');
  const [secondaryThemeColorState, setSecondaryThemeColorState] = useState(() => localStorage.getItem(SECONDARY_THEME_COLOR_KEY) || '#01b7ee');
  const [showSettings, setShowSettings] = useState(false);
  const [showSubtitlePanel, setShowSubtitlePanel] = useState(true);
  
  const [settingsPosition, setSettingsPosition] = useState<'left'|'right'>(() => {
    return (localStorage.getItem(SETTINGS_POS_KEY) as 'left'|'right') || 'right';
  });

  // Panel Widths
  const [subtitleWidth, setSubtitleWidth] = useState(320);
  const [settingsWidth, setSettingsWidth] = useState(320);
  const [activeTab, setActiveTab] = useState<'global' | 'project' | 'speakers' | 'annotation'>('speakers');
  const [editingSub, setEditingSub] = useState<{ id: string, start: number, end: number, text: string } | null>(null);
  const [importAssData, setImportAssData] = useState<{ path: string, content: string } | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [runtimeDirectory, setRuntimeDirectory] = useState('');
  const [quickSavePath, setQuickSavePath] = useState('');
  const [exportOutputPath, setExportOutputPath] = useState('');
  const [exportRange, setExportRange] = useState({ start: 0, end: 0 });
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgressState | null>(null);
  const [exportStatusMessage, setExportStatusMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const portraitAutoCollapseRef = useRef<{ subtitle: boolean; settings: boolean } | null>(null);
  const savedSpeakerNamesRef = useRef<Record<string, string>>(getSpeakerNameSnapshot(config.speakers));
  const exportRangeTouchedRef = useRef(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const { subtitles, setSubtitles, loading: subtitlesLoading } = useAssSubtitle(config.assPath, config.speakers);
  const canvasWidth = config.dimensions?.width || 1920;
  const canvasHeight = config.dimensions?.height || 1080;
  const isPortraitCanvas = canvasHeight > canvasWidth;
  const shouldHideSidePanels = isPortraitCanvas;
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
      const nextScale = Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight);
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
    const observer = new ResizeObserver(updateScale);
    observer.observe(areaEl);
    window.addEventListener('resize', updateScale);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [canvasWidth, canvasHeight, showSubtitlePanel, showSettings, subtitleWidth, settingsWidth, shouldHideSidePanels]);

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
    if (!window.electron) return;

    try {
      const result = await window.electron.showOpenDialog({
        title: t('menu.importPresets'),
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) return;

      const content = await window.electron.readFile(result.filePaths[0]);
      const parsed = JSON.parse(content);
      const existing = JSON.parse(localStorage.getItem('podchat_presets') || '{}');
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

      localStorage.setItem('podchat_presets', JSON.stringify({ ...existing, ...imported }));
      window.dispatchEvent(new Event('podchat_presets_updated'));
      showToast(t('app.presetsImported'));
    } catch (error) {
      console.error('Failed to import presets:', error);
    }
  };

  const handleExportPresets = async () => {
    if (!window.electron) return;

    try {
      const presets = JSON.parse(localStorage.getItem('podchat_presets') || '{}');
      const result = await window.electron.showSaveDialog({
        title: t('menu.exportPresets'),
        defaultPath: 'podchat-presets.json',
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
  const secondaryThemeColor = secondaryThemeColorState || '#01b7ee';
  const uiTheme = createThemeTokens(themeColor, isDarkMode);
  const appBackground = isDarkMode
    ? `linear-gradient(180deg, ${uiTheme.appBg} 0%, ${uiTheme.appBg} 74%, ${secondaryThemeColor}14 100%)`
    : `linear-gradient(180deg, ${uiTheme.appBg} 0%, ${uiTheme.appBg} 78%, ${secondaryThemeColor}12 100%)`;
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // Save config explicitly
  const handleSaveConfig = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    showToast(t('app.configSaved'));
  };

  useEffect(() => {
    localStorage.setItem(THEME_KEY, isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem(THEME_COLOR_KEY, themeColorState || (isDarkMode ? DARK_THEME_DEFAULT : LIGHT_THEME_DEFAULT));
  }, [themeColorState, isDarkMode]);

  useEffect(() => {
    localStorage.setItem(SECONDARY_THEME_COLOR_KEY, secondaryThemeColorState || '#01b7ee');
  }, [secondaryThemeColorState]);

  useEffect(() => {
    if (!themeColorState) {
      setThemeColorState(isDarkMode ? DARK_THEME_DEFAULT : LIGHT_THEME_DEFAULT);
    }
  }, [isDarkMode, themeColorState]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_POS_KEY, settingsPosition);
  }, [settingsPosition]);

  useEffect(() => {
    if (isPortraitCanvas) {
      if (!portraitAutoCollapseRef.current) {
        portraitAutoCollapseRef.current = {
          subtitle: showSubtitlePanel,
          settings: showSettings
        };
      }

      if (showSubtitlePanel) {
        setShowSubtitlePanel(false);
      }

      if (showSettings) {
        setShowSettings(false);
      }

      return;
    }

    if (portraitAutoCollapseRef.current) {
      const previousState = portraitAutoCollapseRef.current;
      portraitAutoCollapseRef.current = null;
      setShowSubtitlePanel(previousState.subtitle);
      setShowSettings(previousState.settings);
    }
  }, [isPortraitCanvas, showSettings, showSubtitlePanel]);

  // Update window title with project path
  useEffect(() => {
    if (projectPath) {
      document.title = projectPath === 'web-demo' 
        ? t('app.webDemo')
        : `PodChat Studio - ${projectPath}`;
    } else {
      document.title = 'PodChat Studio';
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

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);
      const playbackKey = projectPath || config.assPath || config.audioPath;
      if (playbackKey) {
        const saved = JSON.parse(localStorage.getItem(PLAYBACK_POSITION_KEY) || '{}');
        saved[playbackKey] = time;
        localStorage.setItem(PLAYBACK_POSITION_KEY, JSON.stringify(saved));
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      const playbackKey = projectPath || config.assPath || config.audioPath;
      if (playbackKey) {
        const saved = JSON.parse(localStorage.getItem(PLAYBACK_POSITION_KEY) || '{}');
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
  }, []);

  // Auto-scroll log (Only scroll to active subtitle in the chat view)
  useEffect(() => {
    if (scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [currentTime]);

  const getExportConfig = () => {
    const { ui, ...restConfig } = config;
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

  const getDefaultExportRange = useCallback(() => {
    const earliestSubtitle = subtitles.reduce((min, item) => Math.min(min, item.start), Number.POSITIVE_INFINITY);
    const latestSubtitle = subtitles.reduce((max, item) => Math.max(max, item.end), 0);
    const start = Number((Number.isFinite(earliestSubtitle) ? earliestSubtitle : 0).toFixed(2));
    const end = Number(Math.max(duration || 0, latestSubtitle || 0, start).toFixed(2));
    return { start, end };
  }, [duration, subtitles]);

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

    setRuntimeDirectory(paths.runtimeDir);
    setQuickSavePath(paths.quickSavePath);
    setExportOutputPath((prev) => prev || paths.suggestedPath || paths.quickSavePath);
    return paths;
  }, [config.projectTitle, projectPath, t]);

  useEffect(() => {
    exportRangeTouchedRef.current = false;
    setExportOutputPath('');
    setExportStatusMessage(null);
  }, [projectPath, config.assPath, config.audioPath]);

  useEffect(() => {
    const defaults = getDefaultExportRange();
    if (!exportRangeTouchedRef.current) {
      setExportRange(defaults);
      return;
    }

    setExportRange((prev) => {
      const nextStart = Number(Math.max(0, Math.min(prev.start, defaults.end)).toFixed(2));
      const nextEnd = Number(Math.max(nextStart, Math.min(prev.end, Math.max(defaults.end, prev.end))).toFixed(2));
      return { start: nextStart, end: nextEnd };
    });
  }, [getDefaultExportRange]);

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
      setExportRange(defaults);
    }
    if (paths?.suggestedPath && !exportOutputPath) {
      setExportOutputPath(paths.suggestedPath);
    }
    setExportStatusMessage(t('export.statusIdle'));
    setShowExportModal(true);
  }, [exportOutputPath, getDefaultExportRange, loadExportPaths, t]);

  const handleChooseExportPath = useCallback(async () => {
    if (!window.electron) return;
    const result = await window.electron.showSaveDialog({
      title: t('export.title'),
      defaultPath: exportOutputPath || quickSavePath,
      filters: [{ name: 'Video', extensions: ['mp4'] }]
    });

    if (!result.canceled && result.filePath) {
      setExportOutputPath(result.filePath);
    }
  }, [exportOutputPath, quickSavePath, t]);

  const handleStartExport = useCallback(async () => {
    if (!window.electron) {
      alert(t('export.clientOnly'));
      return;
    }

    const trimmedPath = exportOutputPath.trim();
    if (!trimmedPath) {
      setExportStatusMessage(t('export.pathRequired'));
      return;
    }

    if (exportRange.end <= exportRange.start) {
      setExportStatusMessage(t('export.invalidRange'));
      return;
    }

    setIsExporting(true);
    setExportProgress({ progress: 0, elapsedMs: 0, estimatedRemainingMs: null, stage: t('export.preparing') });
    setExportStatusMessage(t('export.preparing'));

    try {
      const res = await window.electron.exportVideo({
        ...getExportConfig(),
        outputPath: trimmedPath,
        exportRange
      });

      if (res.success) {
        setExportStatusMessage(res.message || t('app.exportSuccess'));
        showToast(t(res.placeholder ? 'app.exportPlaceholder' : 'app.exportSuccess'));
      } else {
        setExportStatusMessage(res.error || t('export.failed'));
      }
    } catch (error: any) {
      setExportStatusMessage(`${t('export.failed')}: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  }, [exportOutputPath, exportRange, getExportConfig, showToast, t]);

  const exportConfig = () => {
    const finalConfig = getExportConfig();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(finalConfig, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "podchat_project.json");
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
      let delta = moveEvent.clientX - startX;
      
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

  const resolvePath = (path: string | undefined): string | undefined => {
    if (!path) return undefined;
    // Catch http, https, // protocol-relative, data URI, blob URI
    if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
    
    // Convert local absolute paths to Vite's /@fs/ endpoint for local dev loading
    if (path.startsWith('file://')) return `/@fs${path.replace(/^file:\/\/?/, '/')}`;
    if (/^[a-zA-Z]:[\\/]/.test(path)) return `/@fs/${path.replace(/\\/g, '/')}`;
    
    // For Unix-like absolute paths that are clearly not project relative paths
    if (path.startsWith('/') && !path.startsWith('/projects/') && !path.startsWith('/assets/')) {
       return `/@fs${path}`;
    }

    return path.startsWith('/') ? path : `/${path}`;
  };

  const resolvedAudioPath = resolvePath(config.audioPath) || '';

  const formatTimestamp = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

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

  const handleNewProject = async () => {
    if (!window.electron) {
      // Web mode fallback
      setProjectPath('web-demo');
      const cleanConfig = createBlankProjectConfig(t('app.newProject'));
      setConfig(cleanConfig);
      setShowSettings(true);
      return;
    }
    
    try {
      const result = await window.electron.showSaveDialog({
        title: t('dialog.newProjectTitle'),
        defaultPath: 'podchat_project.json',
        filters: [{ name: 'JSON Config', extensions: ['json'] }]
      });
      
      if (!result.canceled && result.filePath) {
        const newConfig = createBlankProjectConfig(t('app.newProject'));
        await window.electron.writeFile(result.filePath, JSON.stringify(newConfig, null, 2));
        setProjectPath(result.filePath);
        setRecentProject(result.filePath);
        localStorage.setItem(RECENT_PROJECT_KEY, result.filePath);
        setConfig(newConfig);
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
    document.title = 'PodChat Studio';
  };

  const handleSetAudio = async () => {
    if (!window.electron) return;
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
    if (!window.electron) return;
    try {
      const res = await window.electron.showOpenDialog({
        title: t('dialog.selectSubtitleTitle'),
        filters: [{ name: 'Subtitle Files', extensions: ['ass'] }],
        properties: ['openFile']
      });
      if (!res.canceled && res.filePaths.length > 0) {
        const path = res.filePaths[0];
        const content = await window.electron.readFile(path);
        setImportAssData({ path, content });
      }
    } catch (e: any) {
      alert('选择字幕失败: ' + e.message);
    }
  };

  const importFileByPath = useCallback(async (filePath: string) => {
    if (!window.electron || !filePath) return;

    const normalizedPath = filePath.toLowerCase();

    if (normalizedPath.endsWith('.json')) {
      await loadProjectFromPath(filePath);
      showToast(t('app.projectImported'));
      return;
    }

    if (normalizedPath.endsWith('.ass')) {
      const content = await window.electron.readFile(filePath);
      setImportAssData({ path: filePath, content });
      showToast(t('app.assImported'));
      return;
    }

    if (/(\.mp3|\.wav|\.aac|\.m4a|\.flac)$/i.test(normalizedPath)) {
      setConfig((prev: any) => ({ ...prev, audioPath: filePath }));
      showToast(t('app.audioImported'));
      return;
    }

    showToast(t('app.dropUnsupported'));
  }, [showToast, t]);

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
      
      setProjectPath(filePath);
      setRecentProject(filePath);
      localStorage.setItem(RECENT_PROJECT_KEY, filePath);
      setConfig(validatedConfig);
      savedSpeakerNamesRef.current = getSpeakerNameSnapshot(validatedConfig.speakers);
      setShowSettings(true);
      showToast(t('app.projectLoaded'));
    } catch (e: any) {
      alert('加载失败: ' + e.message);
      if (filePath === recentProject) {
        setRecentProject(null);
        localStorage.removeItem(RECENT_PROJECT_KEY);
      }
    }
  };

  const handleOpenProject = async () => {
    if (!window.electron) {
      // Web mode fallback
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          const validatedConfig = validateProjectConfig(parsed);
          setConfig(validatedConfig);
          savedSpeakerNamesRef.current = getSpeakerNameSnapshot(validatedConfig.speakers);
        } else {
          setConfig(initialConfig);
          savedSpeakerNamesRef.current = getSpeakerNameSnapshot(initialConfig.speakers);
        }
        setProjectPath('web-demo');
        setShowSettings(true);
      } catch (e: any) {
        alert('读取网页缓存失败: ' + e.message);
        setConfig(initialConfig);
        savedSpeakerNamesRef.current = getSpeakerNameSnapshot(initialConfig.speakers);
        setProjectPath('web-demo');
      }
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

  const handleSaveProject = async () => {
    if (!window.electron || !projectPath || projectPath === 'web-demo') {
      handleSaveConfig(); // Web mode fallback to localStorage
      return;
    }

    try {
      await backupAssIfSpeakerNamesChanged();
      await persistSubtitlesToAss(subtitles, false);
      const finalConfig = getExportConfig();
      await window.electron.writeFile(projectPath, JSON.stringify(finalConfig, null, 2));
      savedSpeakerNamesRef.current = getSpeakerNameSnapshot(config.speakers);
      showToast(t('app.projectSaved'));
    } catch (e: any) {
      alert('保存失败: ' + e.message);
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
    const animationDuration = config.chatLayout?.animationDuration ?? 0.25;
    const appearanceTime = Math.max(0, item.start - (animationStyle === 'none' ? 0 : animationDuration));
    return currentTime >= appearanceTime && currentTime <= item.end;
  });
  const handleAppDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!window.electron) return;
    setIsDragOver(true);
  };
  const handleAppDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };
  const handleAppDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files || []);
    const firstPath = (droppedFiles[0] as any)?.path;
    if (firstPath) {
      await importFileByPath(firstPath);
    }
  };

  if (!projectPath) {
    return (
      <div className="relative w-full h-screen" style={{ background: appBackground, color: uiTheme.text, ['--podchat-scrollbar-thumb' as any]: `${secondaryThemeColor}77`, ['--podchat-scrollbar-thumb-hover' as any]: `${secondaryThemeColor}AA` }} onDragOver={handleAppDragOver} onDragLeave={handleAppDragLeave} onDrop={handleAppDrop}>
        <WelcomeScreen 
          onNewProject={handleNewProject} 
          onOpenProject={handleOpenProject} 
          onOpenRecent={() => recentProject && loadProjectFromPath(recentProject)}
          onOpenSettings={() => setShowSettings(true)}
          recentProject={recentProject}
          isDarkMode={isDarkMode} 
          language={language}
          themeColor={themeColor}
          secondaryThemeColor={secondaryThemeColor}
        />

        {showSettings && !shouldHideSidePanels && (
          <div className="absolute inset-y-0 right-0 z-[120] flex">
            <div
              className="absolute inset-0 bg-black/20"
              onClick={() => setShowSettings(false)}
            />
            <div style={{ width: settingsWidth }} className="relative h-full shrink-0 flex flex-col min-h-0 overflow-hidden shadow-2xl">
              <SettingsPanel
                config={config}
                onConfigChange={setConfig}
                isDarkMode={isDarkMode}
                language={language}
                themeColor={themeColor}
                secondaryThemeColor={secondaryThemeColor}
                onThemeColorChange={setThemeColorState}
                onSecondaryThemeColorChange={setSecondaryThemeColorState}
                onLanguageChange={(nextLanguage: Language) => setConfig((prev: any) => ({ ...prev, language: nextLanguage }))}
                onThemeChange={setIsDarkMode}
                settingsPosition={settingsPosition}
                onPositionChange={setSettingsPosition}
                onClose={() => setShowSettings(false)}
                onSave={handleSaveConfig}
                showToast={showToast}
                activeTab={activeTab as 'global' | 'project' | 'speakers' | 'annotation'}
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
      className={`w-full h-screen flex flex-col font-sans ${textClass} overflow-hidden transition-colors duration-300 relative`}
      style={{ background: appBackground, ['--podchat-scrollbar-thumb' as any]: `${secondaryThemeColor}77`, ['--podchat-scrollbar-thumb-hover' as any]: `${secondaryThemeColor}AA` }}
      onDragOver={handleAppDragOver}
      onDragLeave={handleAppDragLeave}
      onDrop={handleAppDrop}
    >
      
      <MenuBar 
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
        onExportVideo={() => void handleOpenExportModal()}
        onExportConfig={exportConfig}
      />

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
                onThemeColorChange={setThemeColorState}
                onSecondaryThemeColorChange={setSecondaryThemeColorState}
                onLanguageChange={(nextLanguage: Language) => setConfig((prev: any) => ({ ...prev, language: nextLanguage }))}
                onThemeChange={setIsDarkMode}
                settingsPosition={settingsPosition}
                onPositionChange={setSettingsPosition}
                onClose={() => setShowSettings(false)}
                onSave={handleSaveProject}
                showToast={showToast}
                activeTab={activeTab as 'global' | 'project' | 'speakers' | 'annotation'}
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
              <button 
                onClick={() => setShowSubtitlePanel(!showSubtitlePanel)}
                className={`p-1.5 rounded transition-colors mr-2 ${isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}
                title={isPortraitCanvas ? 'Portrait mode auto-hides sidebars' : '切换字幕列表'}
                disabled={isPortraitCanvas}
              >
                {showSubtitlePanel ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
              </button>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-xs px-2 py-1 rounded border" style={{ color: uiTheme.textMuted, backgroundColor: uiTheme.panelBgSubtle, borderColor: `${secondaryThemeColor}44`, boxShadow: `0 2px 10px ${secondaryThemeColor}14` }}>
                {canvasWidth}x{canvasHeight} ({aspectLabel}) @ {config.fps}FPS
              </div>
              {!shouldHideSidePanels && (
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors ${showSettings ? '' : (isDarkMode ? 'hover:bg-gray-800 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900')}`}
                  style={showSettings ? { backgroundColor: `${secondaryThemeColor}18`, color: secondaryThemeColor, border: `1px solid ${secondaryThemeColor}55`, boxShadow: `0 4px 12px ${secondaryThemeColor}22` } : { border: `1px solid ${secondaryThemeColor}22` }}
                  title={t('menu.settings')}
                >
                  <Settings size={14} />
                  {t('menu.settings')}
                </button>
              )}
            </div>
          </div>

          {/* Canvas Area (Preview) */}
          {toastMessage && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded z-50 animate-fade-in text-sm flex items-center gap-2 border" style={{ backgroundColor: uiTheme.panelBgElevated, color: uiTheme.text, borderColor: uiTheme.border, boxShadow: '0 8px 18px rgba(0,0,0,0.14)' }}>
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              {toastMessage}
            </div>
          )}
          <div ref={previewAreaRef} className={`flex-1 min-w-0 min-h-0 relative z-10 p-8 overflow-hidden ${canvasBg}`}>
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
              <div 
                ref={previewFrameRef}
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
                ref={scrollRef}
                className="relative z-20 flex-1 overflow-y-auto flex flex-col scroll-smooth custom-scrollbar"
                style={{
                  paddingTop: `${(config.chatLayout?.paddingTop ?? 48) * Math.max(0.35, previewScale)}px`,
                  paddingBottom: `${(config.chatLayout?.paddingBottom ?? 30) * Math.max(0.35, previewScale)}px`,
                  paddingLeft: `${(config.chatLayout?.paddingLeft ?? config.chatLayout?.paddingX ?? 48) * Math.max(0.35, previewScale)}px`,
                  paddingRight: `${(config.chatLayout?.paddingRight ?? config.chatLayout?.paddingX ?? 48) * Math.max(0.35, previewScale)}px`
                }}
              >
                {subtitlesLoading ? (
                  <div className="text-center opacity-50 my-auto">{t('app.loadSubtitle')}</div>
                ) : (
                  subtitles.map((item) => {
                    const speaker = config.speakers[item.speakerId];
                    if (!speaker || speaker.type === 'annotation') return null;

                    const animationStyle = config.chatLayout?.animationStyle || 'rise';
                    const animationDuration = config.chatLayout?.animationDuration ?? 0.25;
                    const animationLeadTime = animationStyle === 'none' ? 0 : animationDuration;
                    const appearanceTime = Math.max(0, item.start - animationLeadTime);
                    const isVisible = currentTime >= appearanceTime;
                    const isAnnotation = speaker.type === 'annotation';
                    const isLeft = speaker.side === "left";

                    if (!isVisible) return null;

                    const fallbackBg = speaker.theme === 'dark' ? '#2563eb' : '#ffffff';
                    const fallbackText = speaker.theme === 'dark' ? '#ffffff' : '#111827';
                    
                    const bgColor = speaker.style?.bgColor || fallbackBg;
                    const textColor = speaker.style?.textColor || fallbackText;
                    const radius = speaker.style?.borderRadius ?? 28;
                    const opacity = speaker.style?.opacity ?? 0.9;
                    const blur = 0;
                    const borderWidth = speaker.style?.borderWidth ?? 0;
                    const borderColor = speaker.style?.borderColor || "#ffffff";
                    const borderOpacity = speaker.style?.borderOpacity ?? 1.0;
                    const avatarBorderColor = speaker.style?.avatarBorderColor || (isDarkMode ? '#1f2937' : '#ffffff');
                    const margin = speaker.style?.margin ?? 14;
                    const paddingX = speaker.style?.paddingX ?? 20;
                    const paddingY = speaker.style?.paddingY ?? 12;
                    const shadowSize = speaker.style?.shadowSize ?? 7;
                    
                    const fontFamily = speaker.style?.fontFamily || "system-ui";
                    const fontSize = speaker.style?.fontSize ?? 30;
                    const fontWeight = speaker.style?.fontWeight || "normal";
                    const nameColor = speaker.style?.nameColor || '#ffffff';
                    const bubbleScale = config.chatLayout?.bubbleScale ?? 1.5;
                    const effectiveScale = Math.max(0.35, previewScale) * bubbleScale;
                    const scaledRadius = radius * effectiveScale;
                    const scaledMargin = margin * effectiveScale;
                    const scaledPaddingX = paddingX * effectiveScale;
                    const scaledPaddingY = paddingY * effectiveScale;
                    const scaledShadowSize = shadowSize * effectiveScale;
                    const scaledFontSize = fontSize * effectiveScale;
                    const scaledBlur = blur * effectiveScale;
                    const avatarSize = (config.chatLayout?.avatarSize ?? 80) * effectiveScale;
                    const avatarBorderWidth = Math.max(2, 4 * effectiveScale);
                    const bubbleGap = 16 * effectiveScale;
                    const metaGap = 8 * effectiveScale;
                    const speakerNameSize = (config.chatLayout?.speakerNameSize ?? 22) * effectiveScale;
                    const timestampSize = 10 * effectiveScale;
                    
                    // Convert hex color to rgba using opacity
                    const hexBg = bgColor.startsWith('#') ? bgColor : '#ffffff';
                    const opacityHex = Math.floor(opacity * 255).toString(16).padStart(2, '0');
                    const finalBgColor = `${hexBg}${opacityHex}`;

                    // Convert border hex color to rgba
                    const hexBorder = borderColor.startsWith('#') ? borderColor : '#ffffff';
                    const borderOpacityHex = Math.floor(borderOpacity * 255).toString(16).padStart(2, '0');
                    const finalBorderColor = `${hexBorder}${borderOpacityHex}`;
                    const bubbleShadow = scaledShadowSize > 0
                      ? `0 ${Math.round(scaledShadowSize * 0.35)}px ${scaledShadowSize}px rgba(15, 23, 42, 0.24)`
                      : 'none';
                    const speakerBlockShadow = scaledShadowSize > 0
                      ? `drop-shadow(0 ${Math.round(scaledShadowSize * 0.2)}px ${Math.max(6, scaledShadowSize * 0.55)}px rgba(15, 23, 42, 0.22))`
                      : 'none';
                    const bubbleAnimationClass = animationStyle === 'none' ? '' : `podchat-bubble-enter-${animationStyle}`;
                    const bubbleStyle = {
                      position: 'relative',
                      overflow: 'hidden',
                      isolation: 'isolate',
                      fontFamily,
                      fontSize: `${scaledFontSize}px`,
                      fontWeight,
                      backgroundClip: 'padding-box',
                      borderRadius: `${scaledRadius}px`,
                      borderTopLeftRadius: isLeft ? `${Math.max(3, 4 * effectiveScale)}px` : `${scaledRadius}px`,
                      borderTopRightRadius: !isLeft ? `${Math.max(3, 4 * effectiveScale)}px` : `${scaledRadius}px`,
                      border: borderWidth > 0 ? `${borderWidth}px solid ${finalBorderColor}` : 'none',
                      boxShadow: bubbleShadow,
                      animationDuration: `${animationDuration}s`,
                      animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                      animationFillMode: 'both',
                      '--podchat-enter-x': isLeft ? '-18px' : '18px',
                      '--podchat-enter-y': '18px',
                      '--podchat-enter-scale': '0.92'
                    } as React.CSSProperties;
                    const bubbleContentStyle = {
                      position: 'relative',
                      zIndex: 1,
                      padding: `${scaledPaddingY}px ${scaledPaddingX}px`,
                      color: textColor
                    } as React.CSSProperties;

                    return (
                      <div
                        key={item.id}
                        className={`flex w-full ${isAnnotation ? 'justify-center' : isLeft ? "justify-start" : "justify-end"}`}
                        style={{ 
                          marginBottom: `${scaledMargin}px`
                        } as React.CSSProperties}
                      >
                        <div 
                          className={`flex ${isAnnotation ? 'max-w-[72%] justify-center' : `max-w-[62%] ${isLeft ? "flex-row" : "flex-row-reverse"}`}`}
                          style={{ gap: `${bubbleGap}px` }}
                        >
                          {!isAnnotation && (
                            <img
                              src={resolvePath(speaker.avatar)}
                              alt={speaker.name}
                              referrerPolicy="no-referrer"
                              className={`rounded-full shrink-0 shadow-lg object-cover ${isDarkMode ? 'border-gray-800 bg-gray-900' : 'border-white bg-gray-200'}`}
                              style={{ width: `${avatarSize}px`, height: `${avatarSize}px`, borderWidth: `${avatarBorderWidth}px`, borderColor: avatarBorderColor, boxShadow: bubbleShadow }}
                            />
                          )}
                          <div className={`flex flex-col ${isAnnotation ? 'items-center' : isLeft ? "items-start" : "items-end"}`} style={{ filter: speakerBlockShadow }}>
                            {!isAnnotation && (
                              <div className={`flex items-baseline mb-1 mix-blend-difference ${isLeft ? "flex-row" : "flex-row-reverse"}`} style={{ gap: `${metaGap}px` }}>
                                <span className="font-bold" style={{ fontSize: `${speakerNameSize}px`, color: nameColor }}>
                                  {speaker.name}
                                </span>
                                <span className="font-mono text-white/60" style={{ fontSize: `${timestampSize}px` }}>
                                  {formatTimestamp(item.start)}
                                </span>
                              </div>
                            )}
                            <SnapshotBubble
                              canvasRef={previewFrameRef}
                              backgroundSrc={resolvePath(config.background?.image)}
                              backgroundBrightness={config.background?.brightness ?? 1}
                              backgroundBaseBlur={config.background?.blur || 0}
                              blurPx={scaledBlur}
                              tintColor={finalBgColor}
                              className={`break-words ${bubbleAnimationClass}`}
                              outerStyle={bubbleStyle}
                              contentStyle={bubbleContentStyle}
                            >
                                <p className="leading-relaxed whitespace-pre-wrap">{item.text}</p>
                            </SnapshotBubble>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {visibleAnnotations.length > 0 && (
                <div className="absolute inset-x-0 top-0 bottom-0 z-30 pointer-events-none flex flex-col justify-between" style={{ padding: `${24 * Math.max(0.35, previewScale)}px ${32 * Math.max(0.35, previewScale)}px` }}>
                  <div className="flex flex-col items-center gap-3">
                    {visibleAnnotations.filter((item) => config.speakers[item.speakerId]?.style?.annotationPosition === 'top').map((item) => {
                      const speaker = config.speakers[item.speakerId];
                      const opacity = speaker.style?.opacity ?? 0.9;
                      const bgColor = speaker.style?.bgColor || '#111827';
                      const textColor = speaker.style?.textColor || '#ffffff';
                      const hexBg = bgColor.startsWith('#') ? bgColor : '#111827';
                      const finalBgColor = `${hexBg}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`;
                      const bubbleScale = config.chatLayout?.bubbleScale ?? 1.5;
                      const effectiveScale = Math.max(0.35, previewScale) * bubbleScale;
                      const shadowSize = (speaker.style?.shadowSize ?? 7) * effectiveScale;
                      const maxWidth = (speaker.style?.maxWidth ?? 720) * effectiveScale;
                      return (
                        <div key={item.id} className={`pointer-events-none ${config.chatLayout?.animationStyle === 'none' ? '' : `podchat-bubble-enter-${config.chatLayout?.animationStyle || 'rise'}`}`} style={{ animationDuration: `${config.chatLayout?.animationDuration ?? 0.25}s` }}>
                          <div style={{
                            backgroundColor: finalBgColor,
                            color: textColor,
                            maxWidth: `${maxWidth}px`,
                            borderRadius: `${(speaker.style?.borderRadius ?? 999) * effectiveScale}px`,
                            padding: `${(speaker.style?.paddingY ?? 10) * effectiveScale}px ${(speaker.style?.paddingX ?? 18) * effectiveScale}px`,
                            fontFamily: speaker.style?.fontFamily || 'system-ui',
                            fontSize: `${(speaker.style?.fontSize ?? 24) * effectiveScale}px`,
                            boxShadow: shadowSize > 0 ? `0 ${Math.round(shadowSize * 0.35)}px ${shadowSize}px rgba(15, 23, 42, 0.24)` : 'none',
                            marginTop: `${(speaker.style?.margin ?? 12) * effectiveScale}px`
                          }}>
                            {item.text}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    {visibleAnnotations.filter((item) => (config.speakers[item.speakerId]?.style?.annotationPosition || 'bottom') === 'bottom').map((item) => {
                      const speaker = config.speakers[item.speakerId];
                      const opacity = speaker.style?.opacity ?? 0.9;
                      const bgColor = speaker.style?.bgColor || '#111827';
                      const textColor = speaker.style?.textColor || '#ffffff';
                      const hexBg = bgColor.startsWith('#') ? bgColor : '#111827';
                      const finalBgColor = `${hexBg}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`;
                      const bubbleScale = config.chatLayout?.bubbleScale ?? 1.5;
                      const effectiveScale = Math.max(0.35, previewScale) * bubbleScale;
                      const shadowSize = (speaker.style?.shadowSize ?? 7) * effectiveScale;
                      const maxWidth = (speaker.style?.maxWidth ?? 720) * effectiveScale;
                      return (
                        <div key={item.id} className={`pointer-events-none ${config.chatLayout?.animationStyle === 'none' ? '' : `podchat-bubble-enter-${config.chatLayout?.animationStyle || 'rise'}`}`} style={{ animationDuration: `${config.chatLayout?.animationDuration ?? 0.25}s` }}>
                          <div style={{
                            backgroundColor: finalBgColor,
                            color: textColor,
                            maxWidth: `${maxWidth}px`,
                            borderRadius: `${(speaker.style?.borderRadius ?? 999) * effectiveScale}px`,
                            padding: `${(speaker.style?.paddingY ?? 10) * effectiveScale}px ${(speaker.style?.paddingX ?? 18) * effectiveScale}px`,
                            fontFamily: speaker.style?.fontFamily || 'system-ui',
                            fontSize: `${(speaker.style?.fontSize ?? 24) * effectiveScale}px`,
                            boxShadow: shadowSize > 0 ? `0 ${Math.round(shadowSize * 0.35)}px ${shadowSize}px rgba(15, 23, 42, 0.24)` : 'none',
                            marginBottom: `${(speaker.style?.margin ?? 12) * effectiveScale}px`
                          }}>
                            {item.text}
                          </div>
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
                onThemeColorChange={setThemeColorState}
                onSecondaryThemeColorChange={setSecondaryThemeColorState}
                onLanguageChange={(nextLanguage: Language) => setConfig((prev: any) => ({ ...prev, language: nextLanguage }))}
                onThemeChange={setIsDarkMode}
                settingsPosition={settingsPosition}
                onPositionChange={setSettingsPosition}
                onClose={() => setShowSettings(false)}
                onSave={handleSaveProject}
                showToast={showToast}
                activeTab={activeTab as 'global' | 'project' | 'speakers' | 'annotation'}
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
        currentTime={currentTime} 
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
        onEditingSubChange={(start, end) => {
          if (editingSub) {
            setEditingSub({ ...editingSub, start, end });
            handleUpdateSubtitle(editingSub.id, { start, end, duration: Number((end - start).toFixed(2)) });
          }
        }}
      />

      <ExportModal
        isOpen={showExportModal}
        isDarkMode={isDarkMode}
        language={language}
        themeColor={themeColor}
        secondaryThemeColor={secondaryThemeColor}
        outputPath={exportOutputPath}
        runtimeDir={runtimeDirectory}
        rangeStart={exportRange.start}
        rangeEnd={exportRange.end}
        defaultRangeStart={defaultExportRange.start}
        defaultRangeEnd={defaultExportRange.end}
        isExporting={isExporting}
        progress={exportProgress}
        statusMessage={exportStatusMessage}
        onClose={() => {
          if (!isExporting) {
            setShowExportModal(false);
          }
        }}
        onOutputPathChange={setExportOutputPath}
        onChoosePath={handleChooseExportPath}
        onQuickSave={() => setExportOutputPath(quickSavePath)}
        onRangeChange={updateExportRange}
        onStartExport={handleStartExport}
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
          onConfirm={async (path, newSpeakers) => {
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
              assPath: path,
              speakers: newSpeakers
            }));
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
