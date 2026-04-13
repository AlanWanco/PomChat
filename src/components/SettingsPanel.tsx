/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Settings, Image as ImageIcon, Users, Save, Moon, Sun, Trash2, Plus, X, Check, ArrowLeftRight, LayoutTemplate, Type, Box, Layout, FolderOpen, Clock3, Pencil } from 'lucide-react';
import { translate, type Language } from '../i18n';
import { createThemeTokens } from '../theme';
import { Tooltip } from './ui/Tooltip';

const FONT_OPTIONS = [
  { label: 'System UI', value: 'system-ui' },
  { label: 'Segoe UI', value: '"Segoe UI", sans-serif' },
  { label: 'PingFang SC', value: '"PingFang SC", "Microsoft YaHei", sans-serif' },
  { label: 'Microsoft YaHei', value: '"Microsoft YaHei", sans-serif' },
  { label: 'Noto Sans SC', value: '"Noto Sans SC", "PingFang SC", sans-serif' },
  { label: 'Helvetica Neue', value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", "SFMono-Regular", Menlo, monospace' },
  { label: 'Monospace UI', value: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }
];

interface SettingsPanelProps {
  config: any;
  onConfigChange: (newConfig: any) => void;
  isDarkMode: boolean;
  language: Language;
  themeColor: string;
  secondaryThemeColor: string;
  autoSaveProject: boolean;
  proxy: string;
  onThemeColorChange: (color: string) => void;
  onSecondaryThemeColorChange: (color: string) => void;
  onAutoSaveProjectChange: (enabled: boolean) => void;
  onProxyChange: (proxy: string) => void;
  onLanguageChange: (language: Language) => void;
  onThemeChange: (isDark: boolean) => void;
  settingsPosition: 'left' | 'right';
  onPositionChange: (pos: 'left' | 'right') => void;
  onClose: () => void;
  onSave: () => void;
  showToast: (msg: string) => void;
  presets: Record<string, any>;
  onPresetsChange: (presets: Record<string, any>) => void;
  annotationPresets: Record<string, any>;
  onAnnotationPresetsChange: (presets: Record<string, any>) => void;
  activeTab: 'subtitle' | 'global' | 'project' | 'speakers' | 'annotation';
  setActiveTab: (tab: 'subtitle' | 'global' | 'project' | 'speakers' | 'annotation') => void;
  onSelectImage?: () => Promise<string | null>;
  onRequestRemoveSpeaker?: (speakerKey: string) => void;
  globalOnly?: boolean;
  showSubtitleTab?: boolean;
  subtitleContent?: ReactNode;
  compactHeader?: boolean;
  hideHeaderTitle?: boolean;
  hideHeaderSave?: boolean;
  hideHeader?: boolean;
  panelCollapsed?: boolean;
  onTogglePanelCollapsed?: () => void;
  onSeek?: (time: number) => void;
  currentTime?: number;
  activeInsertImageId?: string | null;
  focusInsertImageSettingsKey?: number;
  onActiveInsertImageChange?: (id: string | null) => void;
  onEditInsertImage?: (id: string) => void;
  resolveAssetSrc?: (src?: string) => string | undefined;
}

export function SettingsPanel({ 
  config, onConfigChange, 
  isDarkMode, language, themeColor, secondaryThemeColor, autoSaveProject, proxy, onThemeColorChange, onSecondaryThemeColorChange, onAutoSaveProjectChange, onProxyChange, onLanguageChange, onThemeChange, 
  settingsPosition, onPositionChange,
  onClose, onSave, showToast, presets, onPresetsChange, activeTab, setActiveTab,
  annotationPresets, onAnnotationPresetsChange,
  onSelectImage, onRequestRemoveSpeaker, globalOnly = false, showSubtitleTab = false, subtitleContent = null,
  compactHeader = false, hideHeaderTitle = false, hideHeaderSave = false,
  hideHeader = false,
  panelCollapsed = false, onTogglePanelCollapsed,
  onSeek,
  currentTime = 0,
  activeInsertImageId,
  focusInsertImageSettingsKey = 0,
  onActiveInsertImageChange,
  onEditInsertImage,
  resolveAssetSrc
}: SettingsPanelProps) {
  const t = (key: string, vars?: Record<string, string | number>) => translate(language, key, vars);
  const uiTheme = createThemeTokens(themeColor, isDarkMode);
  const toFsPreviewPath = (localPath: string) => {
    const normalized = localPath.replace(/\\/g, '/');

    if (/^[a-zA-Z]:\//.test(normalized)) {
      const [drive, ...segments] = normalized.split('/');
      return `/@fs/${drive}/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
    }

    if (normalized.startsWith('//')) {
      const [host, ...segments] = normalized.replace(/^\/\//, '').split('/');
      return `/@fs//${host}/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
    }

    const segments = normalized.split('/');
    return `/@fs${segments.map((segment, index) => (index === 0 ? segment : `/${encodeURIComponent(segment)}`)).join('')}`;
  };

  const resolveLocalPreviewPath = (path: string | undefined) => {
    if (!path) return path;
    if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
    if (path.startsWith('file://')) {
      try {
        const url = new URL(path);
        const host = url.host ? `//${url.host}` : '';
        return `/@fs${host}${url.pathname}`;
      } catch {
        return toFsPreviewPath(path.replace(/^file:\/\/?/, '/'));
      }
    }
    if (/^[a-zA-Z]:[\\/]/.test(path)) return toFsPreviewPath(path);
    if (path.startsWith('/') && !path.startsWith('/projects/') && !path.startsWith('/assets/')) return toFsPreviewPath(path);
    return path.startsWith('/') ? path : `/${path}`;
  };
  const loadAssetNaturalSize = (path: string) => new Promise<{ width: number; height: number } | null>((resolve) => {
    const previewSrc = resolveAssetSrc ? (resolveAssetSrc(path) || path) : (resolveLocalPreviewPath(path) || path);
    if (/\.(mp4|webm|mov|mkv)(\?|$)/i.test(path)) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        resolve({ width: video.videoWidth, height: video.videoHeight });
      };
      video.onerror = () => resolve(null);
      video.src = previewSrc;
      return;
    }

    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = previewSrc;
  });
  const [presetPromptKey, setPresetPromptKey] = useState<string | null>(null);
  const [presetPromptMode, setPresetPromptMode] = useState<'save' | 'rename'>('save');
  const [presetNameInput, setPresetNameInput] = useState("");
  const [activeSpeakerTab, setActiveSpeakerTab] = useState<string | null>(null);
  const [activeBackgroundSlideTab, setActiveBackgroundSlideTab] = useState<string | null>(null);
  const [draggingBackgroundSlideId, setDraggingBackgroundSlideId] = useState<string | null>(null);
  const backgroundSlideTabsRef = useRef<HTMLDivElement | null>(null);
  const backgroundSlideSettingsRef = useRef<HTMLDivElement | null>(null);
  const [pendingScrollSlideId, setPendingScrollSlideId] = useState<string | null>(null);
  // Independent tab display order — decoupled from layer/backgroundOrder/overlayOrder
  const [tabOrderIds, setTabOrderIds] = useState<string[]>([]);
  const speakerKeys = Object.keys(config.speakers).filter((key) => config.speakers[key]?.type !== 'annotation');
  const currentSpeakerTab = activeSpeakerTab && speakerKeys.includes(activeSpeakerTab) ? activeSpeakerTab : (speakerKeys[0] || null);
  const backgroundSlides = Array.isArray(config.background?.slides) ? config.background.slides : [];

  // Keep tabOrderIds in sync when slides are added/removed (not during drags)
  useEffect(() => {
    if (draggingBackgroundSlideId) return; // don't resync during drag
    // New slides are inserted in visual layer order: overlay (above) first, then background (below)
    const aboveIds: string[] = backgroundSlides
      .filter((s: any) => s.layer === 'overlay')
      .sort((a: any, b: any) => (a.overlayOrder ?? 0) - (b.overlayOrder ?? 0))
      .map((s: any) => s.id as string);
    const belowIds: string[] = backgroundSlides
      .filter((s: any) => (s.layer || 'background') === 'background')
      .sort((a: any, b: any) => (a.backgroundOrder ?? 0) - (b.backgroundOrder ?? 0))
      .map((s: any) => s.id as string);
    const allIds = [...aboveIds, ...belowIds];
    setTabOrderIds((prev) => {
      // Keep existing order, add new ones at end (in layer order), remove deleted ones
      const kept = prev.filter((id) => allIds.includes(id));
      const added = allIds.filter((id) => !kept.includes(id));
      const next = [...kept, ...added];
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) {
        return prev;
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundSlides.map((s: any) => s.id).join(',')]);

  // Tabs rendered in tabOrderIds order (falls back to backgroundSlides order when tabOrderIds empty)
  const tabOrderedSlides: any[] = tabOrderIds.length > 0
    ? tabOrderIds.map((id) => backgroundSlides.find((s: any) => s.id === id)).filter(Boolean)
    : backgroundSlides;

  useEffect(() => {
    if (!activeInsertImageId) {
      return;
    }

    setActiveBackgroundSlideTab((prev) => (prev === activeInsertImageId ? prev : activeInsertImageId));
  }, [activeInsertImageId]);

  const currentBackgroundSlide = activeBackgroundSlideTab
    ? backgroundSlides.find((slide: any) => slide.id === activeBackgroundSlideTab) || null
    : (tabOrderedSlides[0] || null);

  useEffect(() => {
    if (!pendingScrollSlideId || !backgroundSlideTabsRef.current) {
      return;
    }

    const target = backgroundSlideTabsRef.current.querySelector<HTMLElement>(`[data-slide-tab-id="${pendingScrollSlideId}"]`);
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    setPendingScrollSlideId(null);
  }, [pendingScrollSlideId]);

  useEffect(() => {
    if (!focusInsertImageSettingsKey || activeTab !== 'project' || !activeInsertImageId || !backgroundSlideSettingsRef.current) {
      return;
    }

    backgroundSlideSettingsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
  }, [activeInsertImageId, activeTab, focusInsertImageSettingsKey]);

  useEffect(() => {
    if (globalOnly && activeTab !== 'global') {
      setActiveTab('global');
    }
  }, [globalOnly, activeTab, setActiveTab]);

  useEffect(() => {
    if (!showSubtitleTab && activeTab === 'subtitle') {
      setActiveTab('global');
    }
  }, [showSubtitleTab, activeTab, setActiveTab]);

  const updateConfig = (key: string, value: any) => {
    onConfigChange({ ...config, [key]: value });
  };

  const updateBackground = (key: string, value: any) => {
    onConfigChange({
      ...config,
      background: { ...config.background, [key]: value }
    });
  };

  const updateBackgroundSlides = (slides: any[]) => {
    onConfigChange({
      ...config,
      background: { ...config.background, slides }
    });
  };

  const updateBackgroundSlide = (slideId: string, updater: (slide: any, index: number) => any) => {
    const nextSlides = backgroundSlides.map((slide: any, index: number) => slide.id === slideId ? updater(slide, index) : slide);
    updateBackgroundSlides(nextSlides);
  };

  const addBackgroundSlide = (type: 'image' | 'text' = 'image') => {
    const nextIndex = backgroundSlides.length + 1;
    const defaultStart = Math.max(0, Number(currentTime.toFixed(2)));
    const defaultEnd = Number((defaultStart + 30).toFixed(2));
    const slide = {
      id: `slide-${Date.now()}`,
      type,
      name: type === 'text' ? `${t('project.assetTypeText')}${nextIndex}` : `${t('project.assetTypeImage')}${nextIndex}`,
      image: '',
      text: t('project.textContent'),
      start: defaultStart,
      end: defaultEnd,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      backgroundOrder: backgroundSlides.filter((item: any) => item.layer === 'background').length,
      overlayOrder: backgroundSlides.filter((item: any) => item.layer !== 'background').length,
      layer: 'overlay',
      inheritBackgroundFilters: true,
      animationStyle: 'blur',
      animationDuration: 0.01,
      opacity: 1,
      imageBorderColor: '#FFFFFF',
      imageBorderWidth: 0,
      imageShadowColor: '#00000066',
      imageShadowSize: 0,
      textColor: '#FFFFFF',
      textStrokeColor: '#000000',
      textStrokeWidth: 0,
      textShadowColor: '#00000088',
      textShadowSize: 0,
      fontFamily: 'system-ui',
      fontSize: 96,
      fontWeight: '700',
    };
    updateBackgroundSlides([...backgroundSlides, slide]);
    setActiveBackgroundSlideTab(slide.id);
    setPendingScrollSlideId(slide.id);
    onActiveInsertImageChange?.(slide.id);
  };

  const removeBackgroundSlide = (slideId: string) => {
    const nextSlides = backgroundSlides.filter((slide: any) => slide.id !== slideId);
    updateBackgroundSlides(nextSlides);
    setActiveBackgroundSlideTab(nextSlides[0]?.id || null);
    onActiveInsertImageChange?.(nextSlides[0]?.id || null);
  };

  const setBackgroundSlideExplicitOrder = (slideId: string, nextOrder: number) => {
    const sourceSlide = backgroundSlides.find((slide: any) => slide.id === slideId);
    if (!sourceSlide) return;
    const layerKey = (sourceSlide.layer || 'background') === 'overlay' ? 'overlayOrder' : 'backgroundOrder';
    const sameLayerSlides = backgroundSlides
      .filter((slide: any) => (slide.layer || 'background') === (sourceSlide.layer || 'background'))
      .sort((a: any, b: any) => ((a[layerKey] ?? 0) - (b[layerKey] ?? 0)));
    const clampedIndex = Math.max(0, Math.min(sameLayerSlides.length - 1, nextOrder - 1));
    const reorderedLayerSlides = sameLayerSlides.filter((slide: any) => slide.id !== slideId);
    const movingSlide = sameLayerSlides.find((slide: any) => slide.id === slideId);
    if (!movingSlide) return;
    reorderedLayerSlides.splice(clampedIndex, 0, movingSlide);
    const nextSlides = backgroundSlides.map((item: any) => {
      const replacementIndex = reorderedLayerSlides.findIndex((candidate: any) => candidate.id === item.id);
      if (replacementIndex === -1) return item;
      return {
        ...item,
        backgroundOrder: item.layer === 'background' ? replacementIndex : item.backgroundOrder,
        overlayOrder: item.layer !== 'background' ? replacementIndex : item.overlayOrder,
      };
    });
    updateBackgroundSlides(nextSlides);
    setActiveBackgroundSlideTab(slideId);
    onActiveInsertImageChange?.(slideId);
  };

  const reorderBackgroundSlideTabs = (fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) return;
    // Only reorder the tab display order — completely independent of layer/backgroundOrder/overlayOrder
    setTabOrderIds((prev) => {
      const fromIndex = prev.indexOf(fromId);
      const toIndex = prev.indexOf(toId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const updateChatLayout = (key: string, value: any) => {
    onConfigChange({
      ...config,
      chatLayout: { ...config.chatLayout, [key]: value }
    });
  };

  const updateSpeakerStyle = (speakerKey: string, styleKey: string, value: any) => {
    const newSpeakers = { ...config.speakers };
    newSpeakers[speakerKey] = { ...newSpeakers[speakerKey] };
    newSpeakers[speakerKey].style = { ...(newSpeakers[speakerKey].style || {}) };
    newSpeakers[speakerKey].style[styleKey] = value;
    updateConfig('speakers', newSpeakers);
  };

  const updateSpeaker = (speakerKey: string, updater: (speaker: any) => any) => {
    const newSpeakers = { ...config.speakers };
    const currentSpeaker = newSpeakers[speakerKey];
    if (!currentSpeaker) return;

    newSpeakers[speakerKey] = updater({
      ...currentSpeaker,
      style: { ...(currentSpeaker.style || {}) }
    });

    updateConfig('speakers', newSpeakers);
  };

  const applyAvatarBorderColorToAll = (value: string) => {
    const newSpeakers = { ...config.speakers };
    Object.keys(newSpeakers).forEach((speakerKey) => {
      newSpeakers[speakerKey] = { ...newSpeakers[speakerKey] };
      newSpeakers[speakerKey].style = { ...(newSpeakers[speakerKey].style || {}) };
      newSpeakers[speakerKey].style.avatarBorderColor = value;
    });
    updateConfig('speakers', newSpeakers);
  };

  const handleAddSpeaker = () => {
    const keys = Object.keys(config.speakers);
    const nextId = String.fromCharCode(65 + keys.length);
    let newId = nextId;
    let counter = 1;
    while(config.speakers[newId]) {
      newId = `${nextId}${counter}`;
      counter++;
    }
    const newSpeakers = { 
      ...config.speakers, 
      [newId]: { 
        name: `${t('speakers.add')} ${newId}`, 
        avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${newId}`, 
        side: "left", 
        style: { bgColor: "#6b7280", textColor: "#ffffff", nameColor: "#ffffff", nameStrokeWidth: 0, nameStrokeColor: "#000000", borderRadius: 28, opacity: 0.9, borderWidth: 0, avatarBorderColor: "#ffffff", borderColor: "#ffffff", borderOpacity: 1.0, margin: 14, paddingX: 20, paddingY: 12, shadowSize: 1, fontFamily: 'system-ui', fontSize: 30, fontWeight: 'normal' }
      } 
    };
    updateConfig('speakers', newSpeakers);
  };

  const handleRemoveSpeaker = (key: string) => {
    if (speakerKeys.length <= 1) return;
    if (onRequestRemoveSpeaker) {
      onRequestRemoveSpeaker(key);
      return;
    }
    const newSpeakers = { ...config.speakers };
    delete newSpeakers[key];
    updateConfig('speakers', newSpeakers);
  };

  const normalizePresetPayload = (preset: any) => {
    if (preset && typeof preset === 'object' && 'style' in preset) {
      return preset;
    }

    return {
      style: preset || {},
      avatar: '',
      side: 'left'
    };
  };

  const buildPresetPayload = (speaker: any) => ({
    style: JSON.parse(JSON.stringify(speaker.style || {})),
    avatar: speaker.avatar || '',
    side: speaker.side || 'left'
  });

  const handleRemovePreset = (presetName: string, scope: 'speaker' | 'annotation' = 'speaker') => {
    if (!presetName) return;
    const existing = scope === 'annotation' ? { ...annotationPresets } : { ...presets };
    delete existing[presetName];
    if (scope === 'annotation') {
      onAnnotationPresetsChange(existing);
    } else {
      onPresetsChange(existing);
    }
    
    const newSpeakers = { ...config.speakers };
    let changed = false;
    Object.keys(newSpeakers).forEach(k => {
      const isAnnotation = newSpeakers[k]?.type === 'annotation' || k === 'ANNOTATION';
      if ((scope === 'annotation') === isAnnotation && newSpeakers[k].preset === presetName) {
        newSpeakers[k].preset = "";
        changed = true;
      }
    });
    if (changed) updateConfig('speakers', newSpeakers);
    
    showToast(`Preset "${presetName}" removed`);
  };

  const bgClass = 'text-gray-700';
  const headerClass = '';
  const inputClass = 'text-sm focus:outline-none';
  const themedRangeStyle = { accentColor: themeColor } as React.CSSProperties;
  const inputSurfaceStyle = { backgroundColor: uiTheme.inputBg, borderColor: uiTheme.border, color: uiTheme.text } as React.CSSProperties;
  const matchesAcceptedExtension = (path: string, extensions: string[]) => {
    const normalizedPath = path.trim().replace(/^['"]|['"]$/g, '');
    return extensions.some((extension) => normalizedPath.toLowerCase().endsWith(`.${extension.toLowerCase()}`));
  };
  const extractClipboardFilePath = (event: React.ClipboardEvent<HTMLInputElement>, extensions: string[]) => {
    const clipboardItems = Array.from(event.clipboardData?.items || []);
    const fileItem = clipboardItems.find((item) => item.kind === 'file');
    if (fileItem) {
      const file = fileItem.getAsFile();
      const filePath = file && window.electron ? window.electron.getDroppedFilePath(file) : '';
      if (filePath && matchesAcceptedExtension(filePath, extensions)) {
        return filePath;
      }
    }

    const text = event.clipboardData?.getData('text/plain')?.trim() || '';
    if (text && matchesAcceptedExtension(text, extensions)) {
      return text.replace(/^['"]|['"]$/g, '');
    }

    return '';
  };
  const saveClipboardImageToCache = async (event: React.ClipboardEvent<HTMLInputElement>) => {
    if (!window.electron) {
      return '';
    }

    const clipboardItems = Array.from(event.clipboardData?.items || []);
    const imageItem = clipboardItems.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
    if (!imageItem) {
      return '';
    }

    const file = imageItem.getAsFile();
    if (!file) {
      return '';
    }

    const directPath = window.electron.getDroppedFilePath(file) || '';
    if (directPath) {
      return directPath;
    }

    const arrayBuffer = await file.arrayBuffer();
    return await window.electron.saveClipboardImageToCache({
      bytes: Array.from(new Uint8Array(arrayBuffer)),
      contentType: file.type,
      preferredName: file.name,
    }) || '';
  };
  const createImageAwarePathPasteHandler = (extensions: string[], onPath: (path: string) => void | Promise<void>) => {
    return (event: React.ClipboardEvent<HTMLInputElement>) => {
      const textOrFilePath = extractClipboardFilePath(event, extensions);
      if (textOrFilePath) {
        event.preventDefault();
        void onPath(textOrFilePath);
        return;
      }

      void (async () => {
        const cachedImagePath = await saveClipboardImageToCache(event);
        if (!cachedImagePath) {
          return;
        }

        event.preventDefault();
        await onPath(cachedImagePath);
      })();
    };
  };
  const THEME_COLOR_OPTIONS = [
    ['#545454', t('themeColor.pianoBlack')],
    ['#ed7e96', t('themeColor.lightPink')],
    ['#e7d600', t('themeColor.pastelYellow')],
    ['#01b7ee', t('themeColor.lightBlue')],
    ['#485ec6', t('themeColor.royalBlue')],
    ['#ff5800', t('themeColor.superOrange')],
    ['#a764a1', t('themeColor.sumirePurple')],
    ['#d71c30', t('themeColor.scarletRed')],
    ['#83c36e', t('themeColor.lightGreen')],
    ['#9ca4b8', t('themeColor.paperWhite')],
    ['#36b583', t('themeColor.jadeGreen')],
    ['#aaa898', t('themeColor.platinumSilver')],
    ['#f8c9c4', t('themeColor.pinkGold')]
  ] as const;

  const toColorPickerValue = (value: string) => {
    const trimmed = value.trim();
    if (/^#([0-9A-Fa-f]{8})$/.test(trimmed)) {
      return trimmed.slice(0, 7).toUpperCase();
    }
    if (/^#([0-9A-Fa-f]{6})$/.test(trimmed)) {
      return trimmed.toUpperCase();
    }
    if (/^#([0-9A-Fa-f]{3})$/.test(trimmed)) {
      const hex = trimmed.slice(1).toUpperCase();
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    }
    return '#FFFFFF';
  };

  const renderColorInput = (value: string, onChange: (value: string) => void) => (
    <div className="flex items-center gap-2 rounded px-2 py-1.5" style={{ backgroundColor: uiTheme.panelBgSubtle }}>
      <input
        type="color"
        value={toColorPickerValue(value)}
        onChange={(e) => {
          const nextHex = e.target.value.toUpperCase();
          if (/^#([0-9A-Fa-f]{8})$/.test(value)) {
            onChange(`${nextHex}${value.slice(7).toUpperCase()}`);
            return;
          }
          onChange(nextHex);
        }}
        className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent shrink-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-md shadow-sm"
      />
      <input
        type="text"
        value={value.toUpperCase()}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(next)) {
            onChange(next.toUpperCase());
          }
        }}
        placeholder="#RRGGBB / #RRGGBBAA"
        className={`w-full rounded border px-2 py-1 text-[11px] font-mono focus:outline-none ${inputClass}`}
      />
    </div>
  );

  const renderFontFamilyFields = (value: string | undefined, onChange: (value: string) => void) => (
    <div className="space-y-1.5">
      <select
        value={FONT_OPTIONS.some((font) => font.value === (value || '')) ? value : ''}
        onChange={(e) => {
          if (e.target.value) {
            onChange(e.target.value);
          }
        }}
        className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
        style={inputSurfaceStyle}
      >
        <option value="">{t('speakers.fontPreset')}</option>
        {FONT_OPTIONS.map((font) => (
          <option key={font.value} value={font.value}>{font.label}</option>
        ))}
      </select>
      <input
        type="text"
        placeholder={t('speakers.fontPlaceholder')}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        title={t('speakers.fontTitle')}
        className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
        style={inputSurfaceStyle}
      />
      <div
        className="text-[10px] opacity-55 leading-relaxed"
        title={t('speakers.fontHelpTitle')}
      >
        {t('speakers.fontHelp')}
      </div>
    </div>
  );

  const renderNumberInput = (
    value: number,
    onValueChange: (value: number) => void,
    options?: { min?: number; max?: number; step?: number; className?: string; style?: React.CSSProperties }
  ) => {
    const step = options?.step ?? 1;
    const min = options?.min;
    const max = options?.max;
    const className = options?.className || `w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`;
    const style = options?.style || inputSurfaceStyle;
    const safeValue = Number.isFinite(value) ? value : 0;

    const applyDelta = (delta: number) => {
      let next = Number((safeValue + delta).toFixed(4));
      if (typeof min === 'number') next = Math.max(min, next);
      if (typeof max === 'number') next = Math.min(max, next);
      onValueChange(next);
    };

    return (
      <div className="relative">
        <input
          type="number"
          value={safeValue}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) {
              onValueChange(next);
            }
          }}
          className={`${className} pr-8`}
          style={style}
        />
        <div className="absolute inset-y-0 right-1 flex flex-col justify-center gap-0.5">
          <button
            type="button"
            className="h-3.5 w-4 rounded text-[9px] leading-none border"
            style={{ borderColor: `${secondaryThemeColor}55`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}16` }}
            onClick={() => applyDelta(step)}
          >
            ▲
          </button>
          <button
            type="button"
            className="h-3.5 w-4 rounded text-[9px] leading-none border"
            style={{ borderColor: `${secondaryThemeColor}55`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}16` }}
            onClick={() => applyDelta(-step)}
          >
            ▼
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={`h-full flex flex-col overflow-hidden ${bgClass} [&_.text-xs]:text-sm`} style={{ backgroundColor: uiTheme.panelBg, color: uiTheme.textMuted, borderColor: uiTheme.border }}>
      {!hideHeader && (
      <div className={`${compactHeader ? 'p-2.5' : 'p-4'} border-b flex items-center justify-between shrink-0 ${headerClass}`} style={{ backgroundColor: uiTheme.panelBgElevated, borderColor: uiTheme.border, color: uiTheme.text }}>
        <h2 className={`${hideHeaderTitle ? 'opacity-0 pointer-events-none select-none' : ''} font-bold flex items-center gap-2 text-sm`}>
          <Settings size={16} /> {t('settings.title')}
        </h2>
        <div className="flex items-center gap-2">
          {!hideHeaderSave && (
            <button onClick={onSave} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors text-sm font-medium" style={{ color: '#fff', backgroundColor: secondaryThemeColor, boxShadow: '0 4px 10px rgba(0,0,0,0.12)' }} title={t('settings.save')}>
            <Save size={15} />
            {t('settings.save')}
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded-md transition-colors" style={{ color: uiTheme.textMuted }} title={t('settings.close')}>
            <X size={16} />
          </button>
        </div>
      </div>
      )}

       <div className="flex border-b shrink-0" style={{ backgroundColor: uiTheme.panelBgSubtle, borderColor: uiTheme.border }}>
         <button
           className={`flex-1 py-2 font-medium transition-colors text-sm ${activeTab === 'global' ? 'border-b-2' : ''}`}
           style={activeTab === 'global' ? { borderColor: secondaryThemeColor, color: uiTheme.text } : { color: uiTheme.textSoft }}
           onClick={() => setActiveTab('global')}
         >
           {t('tab.global')}
         </button>
         {!globalOnly && (
           <>
         {showSubtitleTab && (
           <button
             className={`flex-1 py-2 font-medium transition-colors text-sm ${activeTab === 'subtitle' ? 'border-b-2' : ''}`}
             style={activeTab === 'subtitle' ? { borderColor: secondaryThemeColor, color: uiTheme.text } : { color: uiTheme.textSoft }}
             onClick={() => setActiveTab('subtitle')}
           >
             {t('tab.subtitle')}
           </button>
         )}
          <button
            className={`flex-1 py-2 font-medium transition-colors text-sm ${activeTab === 'project' ? 'border-b-2' : ''}`}
            style={activeTab === 'project' ? { borderColor: secondaryThemeColor, color: uiTheme.text } : { color: uiTheme.textSoft }}
            onClick={() => setActiveTab('project')}
         >
           {t('tab.project')}
         </button>
         <button 
           className={`flex-1 py-2 font-medium transition-colors text-sm ${activeTab === 'speakers' ? 'border-b-2' : ''}`}
           style={activeTab === 'speakers' ? { borderColor: secondaryThemeColor, color: uiTheme.text } : { color: uiTheme.textSoft }}
           onClick={() => setActiveTab('speakers')}
         >
           {t('tab.speakers')}
         </button>
          <button 
            className={`flex-1 py-2 font-medium transition-colors text-sm ${activeTab === 'annotation' ? 'border-b-2' : ''}`}
            style={activeTab === 'annotation' ? { borderColor: secondaryThemeColor, color: uiTheme.text } : { color: uiTheme.textSoft }}
            onClick={() => setActiveTab('annotation')}
           >
             {t('tab.annotation')}
           </button>
            </>
          )}
          {onTogglePanelCollapsed && (
            <Tooltip
              content={panelCollapsed ? t('subtitle.expand') : t('subtitle.collapseTip')}
              placement="bottom"
              width={180}
              backgroundColor={isDarkMode ? 'rgba(17, 24, 39, 0.78)' : 'rgba(255, 255, 255, 0.78)'}
              borderColor={`${secondaryThemeColor}33`}
              textColor={uiTheme.text}
            >
              <button
                className="px-3 py-2 text-xs font-medium border-l"
                style={{ borderColor: uiTheme.border, color: panelCollapsed ? secondaryThemeColor : uiTheme.textSoft, backgroundColor: panelCollapsed ? `${secondaryThemeColor}12` : 'transparent' }}
                onClick={onTogglePanelCollapsed}
                title={panelCollapsed ? t('subtitle.expand') : t('subtitle.collapse')}
              >
                {panelCollapsed ? t('subtitle.expand') : t('subtitle.collapse')}
              </button>
            </Tooltip>
          )}
         </div>

      {!panelCollapsed && (
      <div className={`flex-1 overflow-y-auto custom-scrollbar ${activeTab === 'speakers' ? 'px-4 pb-4 pt-0' : activeTab === 'subtitle' ? 'p-0' : 'p-4'}`}>
        {showSubtitleTab && activeTab === 'subtitle' && (
          <div className="h-full min-h-0">{subtitleContent}</div>
        )}

        {activeTab === 'global' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-wider opacity-70">{t('global.language')}</label>
              <select
                value={language}
                onChange={(e) => onLanguageChange(e.target.value as Language)}
                className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`}
                style={inputSurfaceStyle}
              >
                <option value="zh-CN">{t('language.zh-CN')}</option>
                <option value="en">{t('language.en')}</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-wider opacity-70">{t('global.theme')}</label>
              <div className="flex rounded-lg p-1" style={{ backgroundColor: uiTheme.panelBgSubtle }}>
                <button 
                  onClick={() => onThemeChange(false)}
                  className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm transition-colors"
                  style={!isDarkMode ? { color: themeColor, backgroundColor: uiTheme.panelBg, boxShadow: `0 4px 10px ${uiTheme.shadow}` } : { color: uiTheme.textSoft }}
                >
                  <Sun size={14} /> {t('theme.light')}
                </button>
                <button 
                  onClick={() => onThemeChange(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm transition-colors"
                  style={isDarkMode ? { backgroundColor: uiTheme.panelBg, color: uiTheme.text, boxShadow: `0 4px 10px ${uiTheme.shadow}` } : { color: uiTheme.textSoft }}
                >
                  <Moon size={14} /> {t('theme.dark')}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-wider opacity-70">{t('global.themeColor')}</label>
              <select
                value={themeColor}
                onChange={(e) => onThemeColorChange(e.target.value)}
                className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`}
                style={inputSurfaceStyle}
              >
                {THEME_COLOR_OPTIONS.map(([color, label]) => (
                  <option key={color} value={color}>{label}</option>
                ))}
              </select>
              <div className="flex items-center gap-2 text-xs opacity-70">
                <span className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: themeColor }} />
                <span className="font-mono">{themeColor.toUpperCase()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-wider opacity-70">{t('global.secondaryThemeColor')}</label>
              <select
                value={secondaryThemeColor}
                onChange={(e) => onSecondaryThemeColorChange(e.target.value)}
                className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`}
                style={inputSurfaceStyle}
              >
                {THEME_COLOR_OPTIONS.map(([color, label]) => (
                  <option key={color} value={color}>{label}</option>
                ))}
              </select>
              <div className="flex items-center gap-2 text-xs opacity-70">
                <span className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: secondaryThemeColor }} />
                <span className="font-mono">{secondaryThemeColor.toUpperCase()}</span>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const nextPrimary = secondaryThemeColor;
                    const nextSecondary = themeColor;
                    onThemeColorChange(nextPrimary);
                    onSecondaryThemeColorChange(nextSecondary);
                  }}
                  className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                  style={{ backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.text, border: `1px solid ${uiTheme.border}` }}
                >
                  {t('global.swapThemeColors')}
                </button>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-wider opacity-70">{t('global.position')}</label>
              <div className="flex rounded-lg p-1" style={{ backgroundColor: uiTheme.panelBgSubtle }}>
                <button 
                  onClick={() => onPositionChange('left')}
                  className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm transition-colors"
                  style={settingsPosition === 'left' ? { backgroundColor: uiTheme.panelBg, color: isDarkMode ? uiTheme.text : themeColor, boxShadow: `0 4px 10px ${uiTheme.shadow}` } : { color: uiTheme.textSoft }}
                >
                  <ArrowLeftRight size={14} /> {t('global.position.left')}
                </button>
                <button 
                  onClick={() => onPositionChange('right')}
                  className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm transition-colors"
                  style={settingsPosition === 'right' ? { backgroundColor: uiTheme.panelBg, color: isDarkMode ? uiTheme.text : themeColor, boxShadow: `0 4px 10px ${uiTheme.shadow}` } : { color: uiTheme.textSoft }}
                >
                  <ArrowLeftRight size={14} /> {t('global.position.right')}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-wider opacity-70">{t('global.autoSaveProject')}</label>
              <button
                type="button"
                onClick={() => onAutoSaveProjectChange(!autoSaveProject)}
                className="w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors"
                style={{
                  backgroundColor: autoSaveProject ? `${secondaryThemeColor}14` : uiTheme.panelBgSubtle,
                  borderColor: autoSaveProject ? `${secondaryThemeColor}55` : uiTheme.border,
                  color: uiTheme.text,
                }}
              >
                <span>{autoSaveProject ? t('common.enabled') : t('common.disabled')}</span>
                <span className="text-xs opacity-70">{t('global.autoSaveProjectHint')}</span>
              </button>
            </div>

            {window.electron && (
              <div className="space-y-2">
                <label className="block text-xs font-medium uppercase tracking-wider opacity-70">{t('global.proxy')}</label>
                <input
                  type="text"
                  value={proxy}
                  onChange={(e) => onProxyChange(e.target.value)}
                  placeholder={t('global.proxyPlaceholder')}
                  className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`}
                  style={inputSurfaceStyle}
                />
                <div className="text-xs opacity-60">{t('global.proxyHelp')}</div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'project' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border space-y-4 shadow-sm" style={{ backgroundColor: uiTheme.cardBg, borderColor: uiTheme.border, boxShadow: `0 6px 18px ${uiTheme.shadow}` }}>
              <label className="flex items-center gap-2 text-sm font-medium border-b pb-1" style={{ borderColor: uiTheme.border, color: uiTheme.text }}>
                <LayoutTemplate size={14} /> {t('project.layout')}
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <span className="text-xs opacity-70 inline-flex items-center gap-1">
                    {t('project.fps')}
                    <Tooltip content={t('project.fpsTip')} placement="bottom" width={224} backgroundColor={isDarkMode ? 'rgba(17, 24, 39, 0.78)' : 'rgba(255, 255, 255, 0.78)'} borderColor={`${secondaryThemeColor}33`} textColor={uiTheme.text}>
                      <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border text-[10px] font-semibold" style={{ borderColor: `${secondaryThemeColor}66`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}14` }}>?</span>
                    </Tooltip>
                  </span>
                  {renderNumberInput(config.fps || 60, (value) => updateConfig('fps', value), { className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs opacity-70">{t('project.width')}</span>
                  {renderNumberInput(config.dimensions?.width || 1920, (value) => updateConfig('dimensions', { ...config.dimensions, width: value }), { className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs opacity-70">{t('project.height')}</span>
                  {renderNumberInput(config.dimensions?.height || 1080, (value) => updateConfig('dimensions', { ...config.dimensions, height: value }), { className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                </div>
              </div>

              <hr style={{ borderColor: uiTheme.border }} />

              <div className="space-y-2">
                <span className="text-xs font-semibold flex items-center gap-1 opacity-80"><Layout size={12} /> {t('speakers.layout')}</span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 col-span-2">
                    <span className="text-xs opacity-70">{t('project.topLimit')}</span>
                    {renderNumberInput(config.chatLayout?.paddingTop ?? 48, (value) => updateChatLayout('paddingTop', value), { className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                    <p className="text-[11px] opacity-60 leading-relaxed">
                      {t('project.topLimit.help')}
                    </p>
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <span className="text-xs opacity-70">{t('project.topFade')}</span>
                        <button
                          type="button"
                          onClick={() => updateChatLayout('topFadeEnabled', !(config.chatLayout?.topFadeEnabled ?? false))}
                          className="w-full text-xs px-2 py-2 rounded transition-colors"
                          style={{
                            backgroundColor: (config.chatLayout?.topFadeEnabled ?? false) ? `${themeColor}22` : uiTheme.panelBgSubtle,
                            color: uiTheme.text,
                            border: `1px solid ${(config.chatLayout?.topFadeEnabled ?? false) ? `${themeColor}55` : uiTheme.border}`
                          }}
                        >
                          {(config.chatLayout?.topFadeEnabled ?? false) ? 'ON' : 'OFF'}
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-xs opacity-70">{t('project.topFadeHeight')}</span>
                        {renderNumberInput(config.chatLayout?.topFadeHeight ?? 120, (value) => updateChatLayout('topFadeHeight', Math.max(20, value)), { className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                      </div>
                    </div>
                    <div className="pt-1">
                      <p className="text-[11px] opacity-60 leading-relaxed">
                        {t('project.topFade.help')}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs opacity-70">{t('project.bottomPosition')}</span>
                    {renderNumberInput(config.chatLayout?.paddingBottom ?? 40, (value) => updateChatLayout('paddingBottom', value), { className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs opacity-70">{t('project.paddingLeft')}</span>
                    {renderNumberInput(config.chatLayout?.paddingLeft ?? config.chatLayout?.paddingX ?? 48, (value) => updateChatLayout('paddingLeft', value), { className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs opacity-70">{t('project.paddingRight')}</span>
                    {renderNumberInput(config.chatLayout?.paddingRight ?? config.chatLayout?.paddingX ?? 48, (value) => updateChatLayout('paddingRight', value), { className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const left = config.chatLayout?.paddingLeft ?? config.chatLayout?.paddingX ?? 48;
                      const right = config.chatLayout?.paddingRight ?? config.chatLayout?.paddingX ?? 48;
                      const centered = Math.round((left + right) / 2);
                      onConfigChange({
                        ...config,
                        chatLayout: {
                          ...config.chatLayout,
                          paddingLeft: centered,
                          paddingRight: centered
                        }
                      });
                    }}
                    className="px-3 py-1.5 text-xs rounded-md border transition-colors"
                    style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.textMuted }}
                  >
                    {t('project.centerPadding')}
                  </button>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs opacity-70">{t('project.bubbleScale')}</span>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: themeColor, backgroundColor: `${themeColor}18` }}>{(config.chatLayout?.bubbleScale ?? 1.5).toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="5"
                    step="0.05"
                    value={config.chatLayout?.bubbleScale ?? 1.5}
                    onChange={(e) => updateChatLayout('bubbleScale', parseFloat(e.target.value))}
                    className="w-full"
                    style={themedRangeStyle}
                    title={t('project.bubbleScale.title')}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs opacity-70">{t('project.bubbleMaxWidth')}</span>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: themeColor, backgroundColor: `${themeColor}18` }}>{Math.round(config.chatLayout?.bubbleMaxWidthPercent ?? 70)}%</span>
                  </div>
                  <input
                    type="range"
                    min="15"
                    max="95"
                    step="1"
                    value={config.chatLayout?.bubbleMaxWidthPercent ?? 70}
                    onChange={(e) => updateChatLayout('bubbleMaxWidthPercent', parseInt(e.target.value, 10))}
                    className="w-full"
                    style={themedRangeStyle}
                    title={t('project.bubbleMaxWidth.title')}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs opacity-70">{t('project.maxVisibleBubbles')}</span>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: themeColor, backgroundColor: `${themeColor}18` }}>{config.chatLayout?.maxVisibleBubbles ?? 3}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="32"
                    step="1"
                    value={config.chatLayout?.maxVisibleBubbles ?? 15}
                    onChange={(e) => updateChatLayout('maxVisibleBubbles', parseInt(e.target.value, 10))}
                    className="w-full"
                    style={themedRangeStyle}
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs opacity-70">{t('project.compactSpacing')}</span>
                  {renderNumberInput(config.chatLayout?.compactSpacing ?? 14, (value) => updateChatLayout('compactSpacing', value), { className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                </div>
              </div>

              <hr style={{ borderColor: uiTheme.border }} />

              <div className="space-y-2">
                <span className="text-xs font-semibold flex items-center gap-1 opacity-80"><Users size={12} /> {t('project.avatarSettings')}</span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <span className="text-xs opacity-70">{t('project.avatarSize')}</span>
                    {renderNumberInput(config.chatLayout?.avatarSize ?? 80, (value) => updateChatLayout('avatarSize', value), { className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs opacity-70">{t('project.applyAvatarBorderColor')}</span>
                    {renderColorInput((Object.values(config.speakers || {})[0] as any)?.style?.avatarBorderColor || '#FFFFFF', applyAvatarBorderColorToAll)}
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs opacity-70">{t('project.speakerNameSize')}</span>
                    {renderNumberInput(config.chatLayout?.speakerNameSize ?? 22, (value) => updateChatLayout('speakerNameSize', value), { className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs opacity-70">{t('project.showAvatar')}</label>
                    <button
                      type="button"
                      onClick={() => updateChatLayout('showAvatar', !(config.chatLayout?.showAvatar ?? true))}
                      className="w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors"
                      style={{
                        backgroundColor: (config.chatLayout?.showAvatar ?? true) ? `${secondaryThemeColor}14` : uiTheme.panelBgSubtle,
                        borderColor: (config.chatLayout?.showAvatar ?? true) ? `${secondaryThemeColor}55` : uiTheme.border,
                        color: uiTheme.text,
                      }}
                    >
                      <span>{(config.chatLayout?.showAvatar ?? true) ? t('common.enabled') : t('common.disabled')}</span>
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs opacity-70">{t('project.showMeta')}</label>
                    <button
                      type="button"
                      onClick={() => updateChatLayout('showMeta', !(config.chatLayout?.showMeta ?? true))}
                      className="w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors"
                      style={{
                        backgroundColor: (config.chatLayout?.showMeta ?? true) ? `${secondaryThemeColor}14` : uiTheme.panelBgSubtle,
                        borderColor: (config.chatLayout?.showMeta ?? true) ? `${secondaryThemeColor}55` : uiTheme.border,
                        color: uiTheme.text,
                      }}
                    >
                      <span>{(config.chatLayout?.showMeta ?? true) ? t('common.enabled') : t('common.disabled')}</span>
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs opacity-70">{t('project.compactMode')}</label>
                    <button
                      type="button"
                      onClick={() => updateChatLayout('compactMode', !(config.chatLayout?.compactMode ?? false))}
                      className="w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors"
                      style={{
                        backgroundColor: (config.chatLayout?.compactMode ?? false) ? `${secondaryThemeColor}14` : uiTheme.panelBgSubtle,
                        borderColor: (config.chatLayout?.compactMode ?? false) ? `${secondaryThemeColor}55` : uiTheme.border,
                        color: uiTheme.text,
                      }}
                    >
                      <span>{(config.chatLayout?.compactMode ?? false) ? t('common.enabled') : t('common.disabled')}</span>
                    </button>
                  </div>
                </div>
              </div>

              <hr style={{ borderColor: uiTheme.border }} />

              <div className="space-y-2">
                <span className="text-xs font-semibold flex items-center gap-1 opacity-80"><Type size={12} /> {t('project.timestampStyle')}</span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <span className="text-xs opacity-70">{t('project.timestampSize')}</span>
                    {renderNumberInput(config.chatLayout?.timestampSize ?? 16, (value) => updateChatLayout('timestampSize', value), { className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs opacity-70">{t('project.timestampColor')}</span>
                    {renderColorInput(config.chatLayout?.timestampColor || '#FFFFFFA6', (value) => updateChatLayout('timestampColor', value))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs opacity-70">{t('project.timestampFont')}</span>
                  {renderFontFamilyFields(config.chatLayout?.timestampFontFamily, (value) => updateChatLayout('timestampFontFamily', value))}
                </div>
              </div>

              <hr style={{ borderColor: uiTheme.border }} />

              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold opacity-80 inline-flex items-center gap-1">
                      {t('project.animationStyle')}
                      <Tooltip content={t('project.animationStyleTip')} placement="bottom" width={224} backgroundColor={isDarkMode ? 'rgba(17, 24, 39, 0.78)' : 'rgba(255, 255, 255, 0.78)'} borderColor={`${secondaryThemeColor}33`} textColor={uiTheme.text}>
                        <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border text-[10px] font-semibold" style={{ borderColor: `${secondaryThemeColor}66`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}14` }}>?</span>
                      </Tooltip>
                    </span>
                    <select
                      value={config.chatLayout?.animationStyle || 'rise'}
                      onChange={(e) => updateChatLayout('animationStyle', e.target.value)}
                      className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`}
                      style={inputSurfaceStyle}
                    >
                      <option value="none">{t('anim.none')}</option>
                      <option value="fade">{t('anim.fade')}</option>
                      <option value="rise">{t('anim.rise')}</option>
                      <option value="pop">{t('anim.pop')}</option>
                      <option value="slide">{t('anim.slide')}</option>
                      <option value="blur">{t('anim.blur')}</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold opacity-80">{t('project.animationSpeed')}</span>
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: themeColor, backgroundColor: `${themeColor}18` }}>{(config.chatLayout?.animationDuration ?? 0.2).toFixed(2)}s</span>
                    </div>
                    <input
                      type="range"
                      min="0.01"
                      max="0.5"
                      step="0.01"
                      value={config.chatLayout?.animationDuration ?? 0.2}
                      onChange={(e) => updateChatLayout('animationDuration', parseFloat(e.target.value))}
                      className="w-full"
                      style={themedRangeStyle}
                    />
                  </div>
                   </div>
                </div>
             </div>

            <div className="p-4 rounded-xl border space-y-4 shadow-sm" style={{ backgroundColor: uiTheme.cardBg, borderColor: uiTheme.border, boxShadow: `0 6px 18px ${uiTheme.shadow}` }}>
              <label className="flex items-center gap-2 text-sm font-medium border-b pb-1" style={{ borderColor: uiTheme.border, color: uiTheme.text }}>
                <ImageIcon size={14} /> {t('project.background')}
              </label>
              <div className="space-y-1.5">
                <span className="text-xs opacity-70">{t('project.backgroundPath')}</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={config.background?.image || ''}
                    onChange={(e) => updateBackground('image', e.target.value)}
                    onPaste={createImageAwarePathPasteHandler(['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov', 'mkv'], (path) => updateBackground('image', path))}
                    title={t('project.quickPasteFilePathTip')}
                    className={`flex-1 w-full border rounded-md px-3 py-2 text-xs focus:outline-none ${inputClass}`}
                    style={inputSurfaceStyle}
                  />
                  {onSelectImage && (
                    <button
                      onClick={async () => {
                        const path = await onSelectImage();
                        if (path) updateBackground('image', path);
                      }}
                      className="px-3 border rounded-md flex items-center justify-center transition-colors"
                      style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgSubtle }}
                      title={t('project.selectLocalImage')}
                    >
                      <FolderOpen size={16} style={{ color: uiTheme.textMuted }} />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="text-xs opacity-70">{t('project.assPath')}</span>
                <input
                  type="text"
                  value={config.assPath || ''}
                  readOnly
                  className={`w-full border rounded-md px-3 py-2 text-xs focus:outline-none ${inputClass}`}
                  style={inputSurfaceStyle}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="text-xs opacity-70">{t('project.backgroundFit')}</span>
                  <select
                    value={config.background?.fit || 'cover'}
                    onChange={(e) => updateBackground('fit', e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 text-xs focus:outline-none ${inputClass}`}
                    style={inputSurfaceStyle}
                  >
                    <option value="cover">{t('project.fitCover')}</option>
                    <option value="contain">{t('project.fitContain')}</option>
                    <option value="fill">{t('project.fitFill')}</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs opacity-70">{t('project.backgroundPosition')}</span>
                  <select
                    value={config.background?.position || 'center'}
                    onChange={(e) => updateBackground('position', e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 text-xs focus:outline-none ${inputClass}`}
                    style={inputSurfaceStyle}
                  >
                    <option value="center">{t('project.posCenter')}</option>
                    <option value="top">{t('project.posTop')}</option>
                    <option value="bottom">{t('project.posBottom')}</option>
                    <option value="left">{t('project.posLeft')}</option>
                    <option value="right">{t('project.posRight')}</option>
                    <option value="top-left">{t('project.posTopLeft')}</option>
                    <option value="top-right">{t('project.posTopRight')}</option>
                    <option value="bottom-left">{t('project.posBottomLeft')}</option>
                    <option value="bottom-right">{t('project.posBottomRight')}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs opacity-70 inline-flex items-center gap-1">
                      {t('project.blur')}
                      <Tooltip content={t('project.blurTip')} placement="right-top" width={240} backgroundColor={isDarkMode ? 'rgba(17, 24, 39, 0.78)' : 'rgba(255, 255, 255, 0.78)'} borderColor={`${secondaryThemeColor}33`} textColor={uiTheme.text}>
                        <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border text-[10px] font-semibold" style={{ borderColor: `${secondaryThemeColor}66`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}14` }}>?</span>
                      </Tooltip>
                    </span>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: themeColor, backgroundColor: `${themeColor}18` }}>{config.background?.blur || 0}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={config.background?.blur || 0}
                    onChange={(e) => updateBackground('blur', parseInt(e.target.value))}
                    className="w-full"
                    style={themedRangeStyle}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs opacity-70">{t('project.brightness')}</span>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: themeColor, backgroundColor: `${themeColor}18` }}>{Math.round((config.background?.brightness ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="2.0"
                    step="0.05"
                    value={config.background?.brightness ?? 1.0}
                    onChange={(e) => updateBackground('brightness', parseFloat(e.target.value))}
                    className="w-full"
                    style={themedRangeStyle}
                  />
                </div>
              </div>
              <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgSubtle }}>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm font-medium" style={{ color: uiTheme.text }}>
                    <LayoutTemplate size={14} /> {t('project.insertImages')}
                  </label>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => addBackgroundSlide('image')} className="text-xs flex items-center gap-1" style={{ color: secondaryThemeColor }}>
                      <Plus size={12} /> {t('project.addImageAsset')}
                    </button>
                    <button type="button" onClick={() => addBackgroundSlide('text')} className="text-xs flex items-center gap-1" style={{ color: themeColor }}>
                      <Plus size={12} /> {t('project.addTextAsset')}
                    </button>
                  </div>
                </div>

                {backgroundSlides.length > 0 ? (
                  <>
                    <div ref={backgroundSlideTabsRef} className="flex overflow-x-auto custom-scrollbar pb-2 gap-2 border-b" style={{ borderColor: uiTheme.border }}>
                      {tabOrderedSlides.map((slide: any, index: number) => {
                        const fallbackLabel = slide.type === 'text' ? `${t('project.assetTypeText')}${index + 1}` : `${t('project.assetTypeImage')}${index + 1}`;
                        const label = (slide.name || '').trim() || fallbackLabel;
                        const isActive = (currentBackgroundSlide?.id || activeBackgroundSlideTab) === slide.id;
                        return (
                          <button
                            key={slide.id}
                            data-slide-tab-id={slide.id}
                            type="button"
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData('application/x-pomchat-insert-image-tab', slide.id);
                              setDraggingBackgroundSlideId(slide.id);
                            }}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => {
                              if (draggingBackgroundSlideId) {
                                reorderBackgroundSlideTabs(draggingBackgroundSlideId, slide.id);
                                setDraggingBackgroundSlideId(null);
                              }
                            }}
                            onDragEnd={() => setDraggingBackgroundSlideId(null)}
                            onClick={() => {
                              setActiveBackgroundSlideTab(slide.id);
                              onActiveInsertImageChange?.(slide.id);
                            }}
                            onDoubleClick={() => {
                              setActiveBackgroundSlideTab(slide.id);
                              onActiveInsertImageChange?.(slide.id);
                              if (typeof slide.start === 'number' && onSeek) {
                                onSeek(slide.start);
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border inline-flex items-center gap-1.5"
                            style={isActive ? { backgroundColor: themeColor, borderColor: themeColor, color: '#ffffff' } : { backgroundColor: uiTheme.panelBg, borderColor: uiTheme.border, color: uiTheme.textMuted }}
                          >
                            <span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.18)' : (slide.type === 'text' ? `${secondaryThemeColor}18` : `${themeColor}18`), color: isActive ? '#ffffff' : (slide.type === 'text' ? secondaryThemeColor : themeColor) }}>
                              {slide.type === 'text' ? t('project.assetTypeText') : t('project.assetTypeImage')}
                            </span>
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {currentBackgroundSlide ? (
                      <div ref={backgroundSlideSettingsRef} className="space-y-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="shrink-0 w-10 h-10 rounded-md border flex items-center justify-center overflow-hidden" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBg }}>
                            {currentBackgroundSlide.type === 'text' ? (
                              <div className="px-1 text-[10px] leading-tight font-semibold text-center" style={{ color: currentBackgroundSlide.textColor || uiTheme.text }}>
                                {(currentBackgroundSlide.text || 'T').slice(0, 2)}
                              </div>
                            ) : currentBackgroundSlide.image ? (
                              <img src={resolveAssetSrc ? resolveAssetSrc(currentBackgroundSlide.image) : currentBackgroundSlide.image} alt="preview" className="w-full h-full object-cover" />
                            ) : (
                              <div className="text-[10px] opacity-50">IMG</div>
                            )}
                          </div>
                          <input
                            type="text"
                            value={currentBackgroundSlide.name || ''}
                            onChange={(e) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, name: e.target.value }))}
                            placeholder={t('project.insertImageNamePlaceholder')}
                            className={`min-w-0 flex-1 border rounded-md px-3 py-2 text-xs focus:outline-none ${inputClass}`}
                            style={inputSurfaceStyle}
                          />
                          <button type="button" onClick={() => removeBackgroundSlide(currentBackgroundSlide.id)} className="shrink-0 p-2 rounded border" style={{ borderColor: uiTheme.border, color: '#ef4444' }}>
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {currentBackgroundSlide.type !== 'text' ? (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={currentBackgroundSlide.image || ''}
                              onChange={(e) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, image: e.target.value }))}
                              onPaste={createImageAwarePathPasteHandler(['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov', 'mkv'], async (path) => {
                                const naturalSize = await loadAssetNaturalSize(path);
                                updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({
                                  ...slide,
                                  image: path,
                                  intrinsicWidth: naturalSize?.width,
                                  intrinsicHeight: naturalSize?.height,
                                }));
                              })}
                              title={t('project.quickPasteFilePathTip')}
                              className={`flex-1 w-full border rounded-md px-3 py-2 text-xs focus:outline-none ${inputClass}`}
                              style={inputSurfaceStyle}
                              placeholder={t('project.insertImagePath')}
                            />
                            {onSelectImage && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const path = await onSelectImage();
                                  if (path) {
                                    const naturalSize = await loadAssetNaturalSize(path);
                                    updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({
                                      ...slide,
                                      image: path,
                                      intrinsicWidth: naturalSize?.width,
                                      intrinsicHeight: naturalSize?.height,
                                    }));
                                  }
                                }}
                                className="px-3 border rounded-md flex items-center justify-center transition-colors"
                                style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBg }}
                                title={t('project.selectLocalImage')}
                              >
                                <FolderOpen size={16} style={{ color: uiTheme.textMuted }} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <span className="text-xs opacity-70">{t('project.textContent')}</span>
                            <textarea
                              value={currentBackgroundSlide.text || ''}
                              onChange={(e) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, text: e.target.value }))}
                              className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`}
                              style={{ ...inputSurfaceStyle, minHeight: '88px', resize: 'vertical' }}
                            />
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <button type="button" onClick={() => onEditInsertImage?.(currentBackgroundSlide.id)} className="w-full h-8 rounded-md border px-2.5 text-[11px] transition-colors inline-flex items-center justify-center gap-1.5 font-medium leading-none" style={{ borderColor: `${secondaryThemeColor}66`, backgroundColor: `${secondaryThemeColor}16`, color: uiTheme.text, boxShadow: `0 6px 16px ${secondaryThemeColor}18` }}>
                            <Pencil size={14} style={{ color: secondaryThemeColor }} />
                            {currentBackgroundSlide.type === 'text' ? t('project.editTextAsset') : t('project.editImageAsset')}
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <span className="text-xs opacity-70">{t('project.slideStartSeconds')}</span>
                            <div className="flex gap-2">
                              <div className="flex-1">
                                {renderNumberInput(currentBackgroundSlide.start ?? 0, (value) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, start: Math.max(0, Number(value.toFixed(2))) })), { min: 0, step: 0.01, className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                              </div>
                              <button type="button" onClick={() => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, start: Number(currentTime.toFixed(2)) }))} className="px-2 border rounded-md text-xs shrink-0" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBg }} title={t('project.useCurrentTime')}>
                                <Clock3 size={12} />
                              </button>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <span className="text-xs opacity-70">{t('project.slideEndSeconds')}</span>
                            <div className="flex gap-2">
                              <div className="flex-1">
                                {renderNumberInput(currentBackgroundSlide.end ?? 3, (value) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, end: Math.max(slide.start ?? 0, Number(value.toFixed(2))) })), { min: 0, step: 0.01, className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                              </div>
                              <button type="button" onClick={() => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, end: Math.max(slide.start ?? 0, Number(currentTime.toFixed(2))) }))} className="px-2 border rounded-md text-xs shrink-0" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBg }} title={t('project.useCurrentTime')}>
                                <Clock3 size={12} />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <span className="text-xs opacity-70">{t('project.slideScale')}</span>
                            {renderNumberInput(currentBackgroundSlide.scale ?? 1, (value) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, scale: Math.max(0.1, value) })), { min: 0.1, step: 0.05, className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                          </div>
                          <div className="space-y-1.5">
                            <span className="text-xs opacity-70">{t('project.slideRotation')}</span>
                            {renderNumberInput(currentBackgroundSlide.rotation ?? 0, (value) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, rotation: Number(value.toFixed(2)) })), { step: 1, className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <span className="text-xs opacity-70">{t('project.slideOffsetX')}</span>
                            {renderNumberInput(currentBackgroundSlide.offsetX ?? 0, (value) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, offsetX: value })), { step: 2, className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                          </div>
                          <div className="space-y-1.5">
                            <span className="text-xs opacity-70">{t('project.slideOffsetY')}</span>
                            {renderNumberInput(currentBackgroundSlide.offsetY ?? 0, (value) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, offsetY: value })), { step: 2, className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <span className="text-xs opacity-70">{t('project.insertImageLayer')}</span>
                            <select value={currentBackgroundSlide.layer || 'background'} onChange={(e) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => {
                              const nextLayer = e.target.value as 'background' | 'overlay';
                              if (nextLayer === slide.layer) {
                                return { ...slide, layer: nextLayer };
                              }
                              const maxBackgroundOrder = Math.max(-1, ...backgroundSlides.filter((item: any) => item.id !== slide.id && item.layer === 'background').map((item: any) => item.backgroundOrder ?? 0));
                              const maxOverlayOrder = Math.max(-1, ...backgroundSlides.filter((item: any) => item.id !== slide.id && item.layer !== 'background').map((item: any) => item.overlayOrder ?? 0));
                              return {
                                ...slide,
                                layer: nextLayer,
                                backgroundOrder: nextLayer === 'background' ? maxBackgroundOrder + 1 : (slide.backgroundOrder ?? maxBackgroundOrder + 1),
                                overlayOrder: nextLayer === 'overlay' ? maxOverlayOrder + 1 : (slide.overlayOrder ?? maxOverlayOrder + 1),
                              };
                            })} className={`w-full border rounded-md px-3 py-2 text-xs focus:outline-none ${inputClass}`} style={inputSurfaceStyle}>
                              <option value="background">{t('project.insertImageLayerBackground')}</option>
                              <option value="overlay">{t('project.insertImageLayerOverlay')}</option>
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <span className="text-xs opacity-70">{t('project.insertImageOrder')}</span>
                            {renderNumberInput(
                              (currentBackgroundSlide.layer || 'background') === 'overlay'
                                ? ((currentBackgroundSlide.overlayOrder ?? 0) + 1)
                                : ((currentBackgroundSlide.backgroundOrder ?? 0) + 1),
                              (value) => setBackgroundSlideExplicitOrder(currentBackgroundSlide.id, Math.round(value)),
                              { min: 1, step: 1, className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle }
                            )}
                          </div>
                        </div>

                        {currentBackgroundSlide.type !== 'text' ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <span className="text-xs opacity-70">{t('project.imageBorderColor')}</span>
                                {renderColorInput(currentBackgroundSlide.imageBorderColor || '#FFFFFF', (value) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, imageBorderColor: value })))}
                              </div>
                              <div className="space-y-1.5">
                                <span className="text-xs opacity-70">{t('project.imageBorderWidth')}</span>
                                {renderNumberInput(currentBackgroundSlide.imageBorderWidth ?? 0, (value) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, imageBorderWidth: Math.max(0, value) })), { min: 0, step: 0.5, className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <span className="text-xs opacity-70">{t('project.imageShadowColor')}</span>
                                {renderColorInput(currentBackgroundSlide.imageShadowColor || '#00000066', (value) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, imageShadowColor: value })))}
                              </div>
                              <div className="space-y-1.5">
                                <span className="text-xs opacity-70">{t('project.imageShadowSize')}</span>
                                {renderNumberInput(currentBackgroundSlide.imageShadowSize ?? 0, (value) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, imageShadowSize: Math.max(0, value) })), { min: 0, step: 1, className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {currentBackgroundSlide.type === 'text' ? (
                          <>
                            <div className="space-y-1.5">
                              <span className="text-xs opacity-70">{t('project.fontFamily')}</span>
                              {renderFontFamilyFields(currentBackgroundSlide.fontFamily || 'system-ui', (value) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, fontFamily: value })))}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <span className="text-xs opacity-70">{t('project.fontWeight')}</span>
                                <select value={currentBackgroundSlide.fontWeight || '700'} onChange={(e) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, fontWeight: e.target.value }))} className={`w-full border rounded-md px-3 py-2 text-xs focus:outline-none ${inputClass}`} style={inputSurfaceStyle}>
                                  <option value="normal">normal</option>
                                  <option value="bold">bold</option>
                                  <option value="100">100</option>
                                  <option value="300">300</option>
                                  <option value="500">500</option>
                                  <option value="700">700</option>
                                  <option value="900">900</option>
                                </select>
                              </div>
                              <div className="space-y-1.5">
                                <span className="text-xs opacity-70">{t('project.fontSize')}</span>
                                {renderNumberInput(currentBackgroundSlide.fontSize ?? 96, (value) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, fontSize: Math.max(8, value) })), { min: 8, step: 1, className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <span className="text-xs opacity-70">{t('project.textColor')}</span>
                                {renderColorInput(currentBackgroundSlide.textColor || '#FFFFFF', (value) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, textColor: value })))}
                              </div>
                              <div className="space-y-1.5">
                                <span className="text-xs opacity-70">{t('project.textStrokeColor')}</span>
                                {renderColorInput(currentBackgroundSlide.textStrokeColor || '#000000', (value) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, textStrokeColor: value })))}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <span className="text-xs opacity-70">{t('project.textStrokeWidth')}</span>
                                {renderNumberInput(currentBackgroundSlide.textStrokeWidth ?? 0, (value) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, textStrokeWidth: Math.max(0, value) })), { min: 0, step: 0.5, className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                              </div>
                              <div className="space-y-1.5">
                                <span className="text-xs opacity-70">{t('project.textShadowColor')}</span>
                                {renderColorInput(currentBackgroundSlide.textShadowColor || '#00000088', (value) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, textShadowColor: value })))}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <span className="text-xs opacity-70">{t('project.textShadowSize')}</span>
                                {renderNumberInput(currentBackgroundSlide.textShadowSize ?? 0, (value) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, textShadowSize: Math.max(0, value) })), { min: 0, step: 1, className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                              </div>
                              <div />
                            </div>
                          </>
                        ) : null}

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <span className="text-xs opacity-70">{t('project.animationStyle')}</span>
                            <select value={currentBackgroundSlide.animationStyle || 'blur'} onChange={(e) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, animationStyle: e.target.value }))} className={`w-full border rounded-md px-3 py-2 text-xs focus:outline-none ${inputClass}`} style={inputSurfaceStyle}>
                              <option value="none">{t('anim.none')}</option>
                              <option value="fade">{t('anim.fade')}</option>
                              <option value="rise">{t('anim.rise')}</option>
                              <option value="pop">{t('anim.pop')}</option>
                              <option value="slide">{t('anim.slide')}</option>
                              <option value="blur">{t('anim.blur')}</option>
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <span className="text-xs opacity-70">{t('project.animationSpeed')}</span>
                            {renderNumberInput(currentBackgroundSlide.animationDuration ?? 0.01, (value) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, animationDuration: Math.max(0, Number(value.toFixed(2))) })), { min: 0, step: 0.01, className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <span className="text-xs opacity-70">{t('project.assetOpacity')}</span>
                            {renderNumberInput(currentBackgroundSlide.opacity ?? 1, (value) => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, opacity: Math.max(0, Math.min(1, Number(value.toFixed(2)))) })), { min: 0, max: 1, step: 0.05, className: `w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                          </div>
                          <div className="space-y-1.5">
                            <label className="block text-xs opacity-70">{t('project.insertImageInheritFilters')}</label>
                            <button
                              type="button"
                              onClick={() => updateBackgroundSlide(currentBackgroundSlide.id, (slide) => ({ ...slide, inheritBackgroundFilters: !(slide.inheritBackgroundFilters ?? true) }))}
                              disabled={(currentBackgroundSlide.layer || 'background') === 'overlay'}
                              className="w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-50"
                              style={{
                                backgroundColor: (currentBackgroundSlide.inheritBackgroundFilters ?? true) ? `${secondaryThemeColor}14` : uiTheme.panelBg,
                                borderColor: (currentBackgroundSlide.inheritBackgroundFilters ?? true) ? `${secondaryThemeColor}55` : uiTheme.border,
                                color: uiTheme.text,
                              }}
                            >
                              <span>{(currentBackgroundSlide.inheritBackgroundFilters ?? true) ? t('common.enabled') : t('common.disabled')}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="text-xs opacity-60">{t('project.insertImagesEmpty')}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'speakers' && (
          <div className="space-y-4">
            {/* Speakers */}
            <div className="space-y-2">
              <div className="sticky top-0 z-20 pb-2 pt-2 px-0.5 space-y-2 border-b" style={{ backgroundColor: uiTheme.panelBg, borderColor: uiTheme.border, boxShadow: `0 8px 20px ${uiTheme.shadow}` }}>
              <div className="flex items-center justify-between border-b pb-1" style={{ borderColor: uiTheme.border }}>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Users size={14} /> {t('speakers.title')}
                </label>
                <button 
                  onClick={handleAddSpeaker}
                  className="text-xs flex items-center gap-1"
                  style={{ color: themeColor }}
                >
                  <Plus size={12} /> {t('speakers.add')}
                </button>
              </div>
              
              <div className="space-y-3">
                {/* Tabs */}
                <div className="flex overflow-x-auto custom-scrollbar pb-2 gap-2 border-b" style={{ borderColor: uiTheme.border }}>
                  {Object.keys(config.speakers).filter((key) => config.speakers[key]?.type !== 'annotation').map((key) => (
                    <button
                      key={key}
                      onClick={() => setActiveSpeakerTab(key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border ${
                        currentSpeakerTab === key 
                          ? 'text-white'
                          : ''
                      }`}
                      style={currentSpeakerTab === key ? { backgroundColor: themeColor, borderColor: themeColor } : { backgroundColor: uiTheme.panelBg, borderColor: uiTheme.border, color: uiTheme.textMuted }}
                    >
                      {config.speakers[key].name || key}
                    </button>
                  ))}
                </div>
              </div>
              </div>

              <div className="space-y-3">

                {currentSpeakerTab && config.speakers[currentSpeakerTab] && (() => {
                  const key = currentSpeakerTab;
                  const speaker = config.speakers[key];
                  return (
                    <div key={key} className="p-4 rounded-xl border space-y-4 shadow-sm" style={{ backgroundColor: uiTheme.cardBg, borderColor: uiTheme.border, boxShadow: `0 6px 18px ${uiTheme.shadow}` }}>
                      
                      {/* Header & Base Settings */}
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-center">
                        <span className="font-bold px-2 py-0.5 rounded text-xs" style={{ backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.text }}>{key} ({t('speakers.role')})</span>
                        <div className="flex items-center gap-2">
                          <input 
                            type="text" 
                            value={speaker.name}
                            className={`bg-transparent border-b focus:outline-none w-20 text-right text-sm ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}
                            style={{ borderColor: `${themeColor}66` }}
                            onChange={(e) => {
                              updateSpeaker(key, (currentSpeaker) => ({
                                ...currentSpeaker,
                                name: e.target.value
                              }));
                            }}
                          />
                          <button 
                            onClick={() => handleRemoveSpeaker(key)}
                            disabled={speakerKeys.length <= 1}
                            className={`p-1 rounded ${speakerKeys.length <= 1 ? 'opacity-30 cursor-not-allowed' : 'text-red-500 hover:bg-red-500/10'}`}
                            title={t('speakers.delete')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 items-center">
                        <img 
                          src={resolveLocalPreviewPath(speaker.avatar)} 
                          alt="avatar" 
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded-full border shadow-sm object-cover shrink-0"
                          style={{ backgroundColor: uiTheme.panelBgSubtle, borderColor: speaker.style?.avatarBorderColor || uiTheme.border }}
                          onError={(e) => {
                            e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${speaker.name}`;
                          }}
                        />
                        <div className="flex-1 space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70 block">{t('speakers.avatar')}</span>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              value={speaker.avatar}
                              onChange={(e) => {
                                updateSpeaker(key, (currentSpeaker) => ({
                                  ...currentSpeaker,
                                  avatar: e.target.value
                                }));
                              }}
                              onPaste={createImageAwarePathPasteHandler(['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov', 'mkv'], (path) => {
                                updateSpeaker(key, (currentSpeaker) => ({
                                  ...currentSpeaker,
                                  avatar: path
                                }));
                              })}
                              title={t('project.quickPasteFilePathTip')}
                              className={`flex-1 w-full border rounded px-2 py-1 text-xs focus:outline-none ${inputClass}`}
                              style={inputSurfaceStyle}
                            />
                            {onSelectImage && (
                              <button 
                                onClick={async () => {
                                  const path = await onSelectImage();
                                  if (path) {
                                    updateSpeaker(key, (currentSpeaker) => ({
                                      ...currentSpeaker,
                                      avatar: path
                                    }));
                                  }
                                }}
                                className="px-2 border rounded flex items-center justify-center transition-colors"
                                style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgSubtle }}
                                title={t('project.selectLocalImage')}
                              >
                                <FolderOpen size={14} style={{ color: uiTheme.textMuted }} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-1 gap-2">
                        <div className="flex-1 flex items-center gap-1">
                          <select 
                            value={speaker.preset || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateSpeaker(key, (currentSpeaker) => {
                                const nextSpeaker = { ...currentSpeaker, style: { ...(currentSpeaker.style || {}) } };
                                if (val) {
                                  const presetData = normalizePresetPayload(presets[val]);
                                  if (presetData?.style) {
                                    nextSpeaker.style = { ...nextSpeaker.style, ...presetData.style };
                                  }
                                  if (presetData?.avatar) {
                                    nextSpeaker.avatar = presetData.avatar;
                                  }
                                  if (presetData?.side) {
                                    nextSpeaker.side = presetData.side;
                                  }
                                }
                                nextSpeaker.preset = val;
                                return nextSpeaker;
                              });
                            }}
                            className={`flex-1 border rounded px-1 py-1 text-xs focus:outline-none w-full ${inputClass}`}
                            style={inputSurfaceStyle}
                          >
                              <option value="">{speaker.preset ? t('speakers.custom') : t('speakers.applyPreset')}</option>
                            {Object.keys(presets).map(p => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                          {speaker.preset && presets[speaker.preset] && (
                            <button
                              onClick={() => {
                                if (window.confirm(t('speakers.deletePresetConfirm', { name: speaker.preset }))) {
                                  handleRemovePreset(speaker.preset);
                                }
                              }}
                              className={`p-1 rounded text-red-500 hover:bg-red-500/10 transition-colors shrink-0`}
                              title={t('speakers.deletePreset')}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 flex gap-1.5 justify-end">
                        <button
                          onClick={() => {
                            if (speaker.preset) {
                              const existing = { ...presets };
                              existing[speaker.preset] = buildPresetPayload(speaker);
                              onPresetsChange(existing);
                              showToast(t('speakers.presetUpdated', { name: speaker.preset }));
                              return;
                            }

                            setPresetPromptKey(key);
                            setPresetPromptMode('save');
                            setPresetNameInput(`${key} preset`);
                          }}
                          className="text-xs px-2 py-1 rounded transition-colors"
                          style={{ backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.text }}
                        >
                          {speaker.preset ? t('speakers.updatePreset') : t('speakers.savePreset')}
                        </button>
                        {speaker.preset && (
                          <button
                            onClick={() => {
                              setPresetPromptKey(key);
                              setPresetPromptMode('save');
                              setPresetNameInput(`${speaker.preset} copy`);
                            }}
                            className="text-xs px-2 py-1 rounded transition-colors"
                            style={{ backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.text }}
                          >
                            {t('speakers.saveAsPreset')}
                          </button>
                        )}
                        {speaker.preset && (
                          <button
                            onClick={() => {
                              setPresetPromptKey(key);
                              setPresetPromptMode('rename');
                              setPresetNameInput(speaker.preset || '');
                            }}
                            className="text-xs px-2 py-1 rounded transition-colors"
                            style={{ backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.text }}
                          >
                            {t('speakers.renamePreset')}
                          </button>
                        )}
                      </div>
                      {presetPromptKey === key && (
                        <div className="mt-2 p-2 rounded border flex gap-2 items-center" style={{ backgroundColor: uiTheme.panelBgSubtle, borderColor: uiTheme.border }}>
                          <input 
                            type="text" 
                            value={presetNameInput}
                            onChange={(e) => setPresetNameInput(e.target.value)}
                            placeholder={t('speakers.presetName')}
                            className="flex-1 text-xs px-2 py-1 rounded focus:outline-none"
                            style={{ backgroundColor: uiTheme.inputBg, color: uiTheme.text }}
                            autoFocus
                          />
                          <button 
                            onClick={() => {
                              if (!presetNameInput.trim()) return;
                              if (presetPromptMode === 'rename' && speaker.preset) {
                                const oldName = speaker.preset;
                                const newName = presetNameInput.trim();
                                const existing = { ...presets };
                                const payload = existing[oldName] || buildPresetPayload(speaker);
                                if (oldName !== newName) {
                                  delete existing[oldName];
                                }
                                existing[newName] = payload;
                                onPresetsChange(existing);

                                const nextSpeakers = Object.fromEntries(
                                  Object.entries(config.speakers || {}).map(([sid, sp]: [string, any]) => [
                                    sid,
                                    sp?.preset === oldName ? { ...sp, preset: newName } : sp,
                                  ])
                                );
                                updateConfig('speakers', nextSpeakers);
                                showToast(t('speakers.presetRenamed', { oldName, newName }));
                              } else {
                                const existing = { ...presets };
                                existing[presetNameInput.trim()] = buildPresetPayload(speaker);
                                onPresetsChange(existing);
                                showToast(t('speakers.presetSaved', { name: presetNameInput.trim() }));
                              }
                              setPresetPromptKey(null);
                              setPresetPromptMode('save');
                            }}
                            className="h-7 w-7 rounded text-white inline-flex items-center justify-center"
                            style={{ backgroundColor: secondaryThemeColor }}
                            title={t('common.confirm')}
                          >
                            <Check size={14} />
                          </button>
                          <button 
                            onClick={() => {
                              setPresetPromptKey(null);
                              setPresetPromptMode('save');
                            }}
                            className="h-7 w-7 rounded inline-flex items-center justify-center"
                            style={{ backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.text }}
                            title={t('common.cancel')}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    <hr style={{ borderColor: uiTheme.border }} />

                    {/* Font Settings */}
                    <div className="space-y-2">
                      <span className="text-xs font-semibold flex items-center gap-1 opacity-80"><Type size={12} /> {t('speakers.typography')}</span>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1 col-span-2">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.font')}</span>
                          {renderFontFamilyFields(speaker.style?.fontFamily, (value) => updateSpeakerStyle(key, 'fontFamily', value))}
                        </div>
                        <div className="space-y-1 col-span-2">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.nameFont')}</span>
                          {renderFontFamilyFields(speaker.style?.nameFontFamily, (value) => updateSpeakerStyle(key, 'nameFontFamily', value))}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.fontSize')}</span>
                          {renderNumberInput(speaker.style?.fontSize ?? 30, (value) => updateSpeakerStyle(key, 'fontSize', value), { className: `w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.fontWeight')}</span>
                          <select 
                            value={speaker.style?.fontWeight || 'normal'}
                            onChange={(e) => updateSpeakerStyle(key, 'fontWeight', e.target.value)}
                            className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                            style={inputSurfaceStyle}
                          >
                            <option value="normal">常规 (Normal)</option>
                            <option value="bold">加粗 (Bold)</option>
                            <option value="bolder">更粗 (Bolder)</option>
                            <option value="lighter">较细 (Lighter)</option>
                            <option value="100">100</option>
                            <option value="300">300</option>
                            <option value="500">500</option>
                            <option value="700">700</option>
                            <option value="900">900</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.side')}</span>
                          <select 
                            value={speaker.side}
                            onChange={(e) => {
                              updateSpeaker(key, (currentSpeaker) => ({
                                ...currentSpeaker,
                                side: e.target.value
                              }));
                            }}
                            className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                            style={inputSurfaceStyle}
                          >
                            <option value="left">{t('speakers.side.left')}</option>
                            <option value="right">{t('speakers.side.right')}</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Colors & Background */}
                    <div className="space-y-2">
                      <span className="text-xs font-semibold flex items-center gap-1 opacity-80"><div className="w-3 h-3 rounded-full flex items-center justify-center border shadow-sm" style={{ backgroundColor: themeColor }}></div> {t('speakers.colors')}</span>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider font-mono">{t('speakers.bg')}</span>
                          {renderColorInput(speaker.style?.bgColor || '#3B82F6', (value) => updateSpeakerStyle(key, 'bgColor', value))}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider font-mono">{t('speakers.text')}</span>
                          {renderColorInput(speaker.style?.textColor || '#FFFFFF', (value) => updateSpeakerStyle(key, 'textColor', value))}
                        </div>
                      </div>

                      <div className="space-y-1 pt-1">
                        <button
                          type="button"
                          className="text-xs px-2 py-1 rounded transition-colors shrink-0"
                          style={{ backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.text }}
                          onClick={() => {
                            const currentBg = speaker.style?.bgColor || '#3B82F6';
                            const currentText = speaker.style?.textColor || '#FFFFFF';
                            updateSpeaker(key, (currentSpeaker) => ({
                              ...currentSpeaker,
                              style: {
                                ...(currentSpeaker.style || {}),
                                bgColor: currentText,
                                textColor: currentBg
                              }
                            }));
                          }}
                        >
                          {t('speakers.swapBgText')}
                        </button>
                      </div>

                      <div className="space-y-1 pt-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.opacity')}</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="range" min="0" max="1" step="0.05"
                            value={speaker.style?.opacity ?? 0.9}
                            onChange={(e) => updateSpeakerStyle(key, 'opacity', parseFloat(e.target.value))}
                            className="w-full" style={themedRangeStyle}
                          />
                          <span className="text-[10px] w-6 text-right font-mono">{speaker.style?.opacity ?? 0.9}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider font-mono">{t('speakers.nameColor')}</span>
                          {renderColorInput(speaker.style?.nameColor || '#FFFFFF', (value) => updateSpeakerStyle(key, 'nameColor', value))}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.nameFontWeight')}</span>
                          <select
                            value={speaker.style?.nameFontWeight || '700'}
                            onChange={(e) => updateSpeakerStyle(key, 'nameFontWeight', e.target.value)}
                            className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                            style={inputSurfaceStyle}
                          >
                            <option value="normal">常规 (Normal)</option>
                            <option value="bold">加粗 (Bold)</option>
                            <option value="bolder">更粗 (Bolder)</option>
                            <option value="lighter">较细 (Lighter)</option>
                            <option value="100">100</option>
                            <option value="300">300</option>
                            <option value="500">500</option>
                            <option value="700">700</option>
                            <option value="900">900</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider font-mono">{t('speakers.nameStrokeColor')}</span>
                          {renderColorInput(speaker.style?.nameStrokeColor || '#000000', (value) => updateSpeakerStyle(key, 'nameStrokeColor', value))}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.nameStrokeWidth')}</span>
                          {renderNumberInput(speaker.style?.nameStrokeWidth ?? 0, (value) => updateSpeakerStyle(key, 'nameStrokeWidth', value), { min: 0, max: 12, className: `w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                        </div>
                      </div>

                    </div>

                    <hr style={{ borderColor: uiTheme.border }} />

                    {/* Borders */}
                    <div className="space-y-2">
                      <span className="text-xs font-semibold flex items-center gap-1 opacity-80"><Box size={12} /> {t('speakers.border')}</span>

                      <div className="space-y-1 mb-2">
                        <span className="text-[10px] uppercase tracking-wider font-mono">{t('speakers.avatarBorderColor')}</span>
                        {renderColorInput(speaker.style?.avatarBorderColor || '#FFFFFF', (value) => updateSpeakerStyle(key, 'avatarBorderColor', value))}
                      </div>
                       
                      <div className="space-y-1 mb-2">
                        <span className="text-[10px] uppercase tracking-wider font-mono">{t('speakers.borderColor')}</span>
                        {renderColorInput(speaker.style?.borderColor || '#FFFFFF', (value) => updateSpeakerStyle(key, 'borderColor', value))}
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.borderWidth')}</span>
                          {renderNumberInput(speaker.style?.borderWidth ?? 0, (value) => updateSpeakerStyle(key, 'borderWidth', value), { min: 0, max: 10, className: `w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.borderRadius')}</span>
                          {renderNumberInput(speaker.style?.borderRadius ?? 28, (value) => updateSpeakerStyle(key, 'borderRadius', value), { min: 0, max: 64, className: `w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                        </div>
                        <div className="space-y-1 col-span-2">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.borderOpacity')}</span>
                          <div className="flex items-center gap-2">
                            <input 
                              type="range" min="0" max="1" step="0.05"
                              value={speaker.style?.borderOpacity ?? 1.0}
                              onChange={(e) => updateSpeakerStyle(key, 'borderOpacity', parseFloat(e.target.value))}
                              className="w-full" style={themedRangeStyle}
                            />
                            <span className="text-[10px] w-6 text-right font-mono">{speaker.style?.borderOpacity ?? 1.0}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <hr style={{ borderColor: uiTheme.border }} />

                    {/* Layout */}
                     <div className="space-y-2">
                       <span className="text-xs font-semibold flex items-center gap-1 opacity-80"><Layout size={12} /> {t('speakers.layout')}</span>
                       
                       <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.paddingX')}</span>
                          {renderNumberInput(speaker.style?.paddingX ?? 20, (value) => updateSpeakerStyle(key, 'paddingX', value), { className: `w-full border rounded px-2 py-1 text-xs focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.paddingY')}</span>
                          {renderNumberInput(speaker.style?.paddingY ?? 12, (value) => updateSpeakerStyle(key, 'paddingY', value), { className: `w-full border rounded px-2 py-1 text-xs focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.shadow')}</span>
                          {renderNumberInput(speaker.style?.shadowSize ?? 1, (value) => updateSpeakerStyle(key, 'shadowSize', value), { min: 0, max: 64, className: `w-full border rounded px-2 py-1 text-xs focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                        </div>
                      </div>
                    </div>

                  </div>
                  );
                })()}
              </div>
            </div>

          </div>
        )}

        {activeTab === 'annotation' && config.speakers?.ANNOTATION && (
          <div className="space-y-4">
            {(() => {
              const annotation = config.speakers.ANNOTATION;
              return (
                <div className="p-4 rounded-xl border space-y-4 shadow-sm" style={{ backgroundColor: uiTheme.cardBg, borderColor: uiTheme.border, boxShadow: `0 6px 18px ${uiTheme.shadow}` }}>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium border-b pb-1" style={{ borderColor: uiTheme.border, color: uiTheme.text }}>
                      <Box size={14} /> {t('annotation.title')}
                    </label>
                    <div className="flex justify-between items-center pt-1 gap-2">
                      <div className="flex-1 flex items-center gap-1">
                        <select
                          value={annotation.preset || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateSpeaker('ANNOTATION', (currentSpeaker) => {
                              const nextSpeaker = { ...currentSpeaker, style: { ...(currentSpeaker.style || {}) } };
                              if (val) {
                                const presetData = normalizePresetPayload(annotationPresets[val]);
                                if (presetData?.style) {
                                  nextSpeaker.style = { ...nextSpeaker.style, ...presetData.style };
                                }
                                if (presetData?.side) {
                                  nextSpeaker.side = presetData.side;
                                }
                              }
                              nextSpeaker.preset = val;
                              return nextSpeaker;
                            });
                          }}
                          className={`flex-1 border rounded px-1 py-1 text-xs focus:outline-none w-full ${inputClass}`}
                          style={inputSurfaceStyle}
                        >
                          <option value="">{annotation.preset ? t('speakers.custom') : t('speakers.applyPreset')}</option>
                          {Object.keys(annotationPresets).map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                        {annotation.preset && annotationPresets[annotation.preset] && (
                          <button
                            onClick={() => {
                              if (window.confirm(t('speakers.deletePresetConfirm', { name: annotation.preset }))) {
                                handleRemovePreset(annotation.preset, 'annotation');
                              }
                            }}
                            className="p-1 rounded text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
                            title={t('speakers.deletePreset')}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 flex gap-1.5 justify-end">
                      <button
                        onClick={() => {
                          if (annotation.preset) {
                            const existing = { ...annotationPresets };
                            existing[annotation.preset] = buildPresetPayload(annotation);
                            onAnnotationPresetsChange(existing);
                            showToast(t('speakers.presetUpdated', { name: annotation.preset }));
                            return;
                          }

                          setPresetPromptKey('ANNOTATION');
                          setPresetPromptMode('save');
                          setPresetNameInput('annotation preset');
                        }}
                        className="text-xs px-2 py-1 rounded transition-colors"
                        style={{ backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.text }}
                      >
                        {annotation.preset ? t('speakers.updatePreset') : t('speakers.savePreset')}
                      </button>
                      {annotation.preset && (
                        <button
                          onClick={() => {
                            setPresetPromptKey('ANNOTATION');
                            setPresetPromptMode('save');
                            setPresetNameInput(`${annotation.preset} copy`);
                          }}
                          className="text-xs px-2 py-1 rounded transition-colors"
                          style={{ backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.text }}
                        >
                          {t('speakers.saveAsPreset')}
                        </button>
                      )}
                      {annotation.preset && (
                        <button
                          onClick={() => {
                            setPresetPromptKey('ANNOTATION');
                            setPresetPromptMode('rename');
                            setPresetNameInput(annotation.preset || '');
                          }}
                          className="text-xs px-2 py-1 rounded transition-colors"
                          style={{ backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.text }}
                        >
                          {t('speakers.renamePreset')}
                        </button>
                      )}
                    </div>
                    {presetPromptKey === 'ANNOTATION' && (
                      <div className="mt-2 p-2 rounded border flex gap-2 items-center" style={{ backgroundColor: uiTheme.panelBgSubtle, borderColor: uiTheme.border }}>
                        <input
                          type="text"
                          value={presetNameInput}
                          onChange={(e) => setPresetNameInput(e.target.value)}
                          placeholder={t('speakers.presetName')}
                          className="flex-1 text-xs px-2 py-1 rounded focus:outline-none"
                          style={{ backgroundColor: uiTheme.inputBg, color: uiTheme.text }}
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            if (!presetNameInput.trim()) return;
                            if (presetPromptMode === 'rename' && annotation.preset) {
                              const oldName = annotation.preset;
                              const newName = presetNameInput.trim();
                              const existing = { ...annotationPresets };
                              const payload = existing[oldName] || buildPresetPayload(annotation);
                              if (oldName !== newName) {
                                delete existing[oldName];
                              }
                              existing[newName] = payload;
                              onAnnotationPresetsChange(existing);

                              const nextSpeakers = {
                                ...config.speakers,
                                ANNOTATION: {
                                  ...config.speakers.ANNOTATION,
                                  preset: newName,
                                }
                              };
                              updateConfig('speakers', nextSpeakers);
                              showToast(t('speakers.presetRenamed', { oldName, newName }));
                            } else {
                              const existing = { ...annotationPresets };
                              existing[presetNameInput.trim()] = buildPresetPayload(annotation);
                              onAnnotationPresetsChange(existing);
                              showToast(t('speakers.presetSaved', { name: presetNameInput.trim() }));
                            }
                            setPresetPromptKey(null);
                            setPresetPromptMode('save');
                          }}
                          className="h-7 w-7 rounded text-white inline-flex items-center justify-center"
                          style={{ backgroundColor: secondaryThemeColor }}
                          title={t('common.confirm')}
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setPresetPromptKey(null);
                            setPresetPromptMode('save');
                          }}
                          className="h-7 w-7 rounded inline-flex items-center justify-center"
                          style={{ backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.text }}
                          title={t('common.cancel')}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('annotation.position')}</span>
                        <select
                          value={annotation.style?.annotationPosition || 'bottom'}
                          onChange={(e) => updateSpeakerStyle('ANNOTATION', 'annotationPosition', e.target.value)}
                          className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                          style={inputSurfaceStyle}
                        >
                          <option value="top">{t('annotation.position.top')}</option>
                          <option value="bottom">{t('annotation.position.bottom')}</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('annotation.align')}</span>
                        <select
                          value={annotation.style?.annotationAlign || 'center'}
                          onChange={(e) => updateSpeakerStyle('ANNOTATION', 'annotationAlign', e.target.value)}
                          className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                          style={inputSurfaceStyle}
                        >
                          <option value="left">{t('annotation.align.left')}</option>
                          <option value="center">{t('annotation.align.center')}</option>
                          <option value="right">{t('annotation.align.right')}</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.fontSize')}</span>
                        {renderNumberInput(annotation.style?.fontSize ?? 24, (value) => updateSpeakerStyle('ANNOTATION', 'fontSize', value), { className: `w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.fontWeight')}</span>
                        <select
                          value={annotation.style?.fontWeight || 'normal'}
                          onChange={(e) => updateSpeakerStyle('ANNOTATION', 'fontWeight', e.target.value)}
                          className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                          style={inputSurfaceStyle}
                        >
                          <option value="normal">常规 (Normal)</option>
                          <option value="bold">加粗 (Bold)</option>
                          <option value="bolder">更粗 (Bolder)</option>
                          <option value="lighter">较细 (Lighter)</option>
                          <option value="100">100</option>
                          <option value="300">300</option>
                          <option value="500">500</option>
                          <option value="700">700</option>
                          <option value="900">900</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1 col-span-2">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.font')}</span>
                        {renderFontFamilyFields(annotation.style?.fontFamily, (value) => updateSpeakerStyle('ANNOTATION', 'fontFamily', value))}
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('project.animationStyle')}</span>
                        <select
                          value={annotation.style?.animationStyle || 'rise'}
                          onChange={(e) => updateSpeakerStyle('ANNOTATION', 'animationStyle', e.target.value)}
                          className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                          style={inputSurfaceStyle}
                        >
                          <option value="none">{t('anim.none')}</option>
                          <option value="fade">{t('anim.fade')}</option>
                          <option value="rise">{t('anim.rise')}</option>
                          <option value="pop">{t('anim.pop')}</option>
                          <option value="slide">{t('anim.slide')}</option>
                          <option value="blur">{t('anim.blur')}</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.shadow')}</span>
                        {renderNumberInput(annotation.style?.shadowSize ?? 1, (value) => updateSpeakerStyle('ANNOTATION', 'shadowSize', value), { className: `w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider opacity-70">{t('annotation.maxWidth')}</span>
                      {renderNumberInput(annotation.style?.maxWidth ?? 720, (value) => updateSpeakerStyle('ANNOTATION', 'maxWidth', value), { className: `w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider font-mono">{t('speakers.bg')}</span>
                        {renderColorInput(annotation.style?.bgColor || '#111827', (value) => updateSpeakerStyle('ANNOTATION', 'bgColor', value))}
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider font-mono">{t('speakers.text')}</span>
                        {renderColorInput(annotation.style?.textColor || '#FFFFFF', (value) => updateSpeakerStyle('ANNOTATION', 'textColor', value))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.paddingX')}</span>
                        {renderNumberInput(annotation.style?.paddingX ?? 24, (value) => updateSpeakerStyle('ANNOTATION', 'paddingX', value), { className: `w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.paddingY')}</span>
                        {renderNumberInput(annotation.style?.paddingY ?? 12, (value) => updateSpeakerStyle('ANNOTATION', 'paddingY', value), { className: `w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('annotation.marginX')}</span>
                        {renderNumberInput(annotation.style?.annotationMarginX ?? 0, (value) => updateSpeakerStyle('ANNOTATION', 'annotationMarginX', Math.max(0, value)), { className: `w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.margin')}</span>
                        {renderNumberInput(annotation.style?.margin ?? 12, (value) => updateSpeakerStyle('ANNOTATION', 'margin', value), { className: `w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('annotation.roundness')}</span>
                        {renderNumberInput(annotation.style?.annotationBorderRadius ?? 28, (value) => updateSpeakerStyle('ANNOTATION', 'annotationBorderRadius', value), { className: `w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.opacity')}</span>
                        {renderNumberInput(annotation.style?.opacity ?? 0.9, (value) => updateSpeakerStyle('ANNOTATION', 'opacity', value), { min: 0, max: 1, step: 0.05, className: `w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`, style: inputSurfaceStyle })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
