import { Play, Pause, SquareSquare, RotateCcw, Volume1, Repeat, Settings2, Clock3, SkipBack, SkipForward, ArrowRight, ArrowLeft, ArrowDown, ChevronUp, ChevronDown } from 'lucide-react';
import { memo, useState, useRef, useEffect, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { translate, type Language } from '../i18n';
import { createThemeTokens, rgba } from '../theme';

interface PlayerControlsProps {
  audioPath: string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  duration: number;
  isPlaying: boolean;
  loop: boolean;
  playbackRate: number;
  onPlayPause: () => void;
  onReset: () => void;
  onSeek: (time: number) => void;
  onLoopChange: (loop: boolean) => void;
  onRateChange: (rate: number) => void;
  isDarkMode: boolean;
  language: Language;
  themeColor: string;
  secondaryThemeColor: string;
  exportRangeStart: number;
  exportRangeEnd: number;
  defaultExportStart: number;
  defaultExportEnd: number;
  onExportRangeChange: (range: { start?: number; end?: number }) => void;
  editingSub?: { id: string, start: number, end: number, text: string } | null;
  rangeSubtitle?: { id: string, start: number, end: number, text: string } | null;
  nearbySubtitles?: Array<{ id: string; start: number; end: number; text: string; speakerId?: string }>;
  backgroundSlides?: Array<{ id: string; start: number; end: number; name?: string; type?: 'image' | 'text'; image?: string; text?: string; layer?: 'background' | 'overlay'; backgroundOrder?: number; overlayOrder?: number }>;
  onBackgroundSlidesChange?: (slides: Array<{ id: string; start: number; end: number }>) => void;
  onEditingSubChange?: (start: number, end: number) => void;
  onEditInsertImage?: (id: string) => void;
  compactMobile?: boolean;
}

interface WaveformRegion {
  start: number;
  end: number;
  element?: HTMLElement | null;
  on: (event: 'update' | 'update-end', callback: () => void) => void;
  un: (event: 'update' | 'update-end', callback: () => void) => void;
}

interface WaveformRegionsPlugin {
  clearRegions: () => void;
  addRegion: (options: {
    start: number;
    end: number;
    color: string;
    drag: boolean;
    resize: boolean;
  }) => WaveformRegion;
}

const formatTime = (seconds: number) => {
  if (isNaN(seconds) || !isFinite(seconds)) return '00:00.0';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
};

export const PlayerControls = memo(function PlayerControls({ 
  audioPath,
  audioRef,
  duration, 
  isPlaying, 
  loop,
  playbackRate,
  onPlayPause, 
  onReset, 
  onSeek,
  onLoopChange,
  onRateChange,
  isDarkMode,
  language,
  themeColor,
  secondaryThemeColor,
  exportRangeStart,
  exportRangeEnd,
  defaultExportStart,
  defaultExportEnd,
  onExportRangeChange,
  editingSub,
  rangeSubtitle,
  nearbySubtitles = [],
  backgroundSlides = [],
  onBackgroundSlidesChange,
  onEditingSubChange,
  onEditInsertImage,
  compactMobile = false
}: PlayerControlsProps) {
  const t = (key: string) => translate(language, key);
  const uiTheme = createThemeTokens(themeColor, isDarkMode);
  const waveformHeight = compactMobile ? 24 : 48;
  const exportBarHeight = compactMobile ? 5 : 6;
  const exportHandleSize = compactMobile ? 9 : 10;
  const waveformBaseColor = rgba(secondaryThemeColor, isDarkMode ? 0.72 : 0.56);
  const waveformProgressColor = secondaryThemeColor;
  const exportBarBaseColor = rgba(themeColor, isDarkMode ? 0.42 : 0.58);
  const exportBarFillColor = secondaryThemeColor;
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [regionTooltip, setRegionTooltip] = useState<{ start: number; end: number } | null>(null);
  const [timeInputMode, setTimeInputMode] = useState(false);
  const [timeInputValue, setTimeInputValue] = useState('');
  const [exportStartInputMode, setExportStartInputMode] = useState(false);
  const [exportStartInputValue, setExportStartInputValue] = useState('');
  const [exportEndInputMode, setExportEndInputMode] = useState(false);
  const [exportEndInputValue, setExportEndInputValue] = useState('');
  const speedMenuRef = useRef<HTMLDivElement>(null);
  const onEditingSubChangeRef = useRef(onEditingSubChange);
  
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const wsRegions = useRef<WaveformRegionsPlugin | null>(null);
  const hasUserAdjustedZoomRef = useRef(false);
  const exportRangeDragRef = useRef<{ mode: 'start' | 'end' | 'move'; initialStart: number; initialEnd: number; anchorTime: number } | null>(null);
  
  const [volume, setVolume] = useState(0.8);
  const [zoomLevel, setZoomLevel] = useState(50);
  const [minZoom, setMinZoom] = useState(10);
  const [isWaveformReady, setIsWaveformReady] = useState(false);
  const [displayCurrentTime, setDisplayCurrentTime] = useState(0);
  const [waveformOverlayMetrics, setWaveformOverlayMetrics] = useState({ scrollLeft: 0, wrapperWidth: 0, viewportWidth: 0 });
  const [dragPreviewRange, setDragPreviewRange] = useState<{ start: number; end: number } | null>(null);
  const backgroundSlideDragRef = useRef<{ id: string; edge: 'start' | 'end' | 'move'; initialStart: number; initialEnd: number; anchorTime: number } | null>(null);
  const [waveformHoverPreview, setWaveformHoverPreview] = useState<{ x: number; time: number } | null>(null);
  const [insertImageHoverLabel, setInsertImageHoverLabel] = useState<{ x: number; y: number; label: string; type?: 'image' | 'text'; image?: string; text?: string } | null>(null);
  const [isBackgroundSlideTrackCollapsed, setIsBackgroundSlideTrackCollapsed] = useState(true);

  const zoomRangeRef = useRef<HTMLInputElement>(null);

  const textClass = isDarkMode ? "text-gray-400" : "text-gray-600";
  const showWaveformContainer = audioPath ? isWaveformReady : true;
  const liveCurrentTime = audioRef.current?.currentTime ?? displayCurrentTime;
  const displayedExportRangeStart = dragPreviewRange?.start ?? exportRangeStart;
  const displayedExportRangeEnd = dragPreviewRange?.end ?? exportRangeEnd;
  const formattedExportRangeStart = formatTime(displayedExportRangeStart);
  const formattedExportRangeEnd = formatTime(displayedExportRangeEnd);
  const waveformDuration = Math.max(duration || 0, defaultExportEnd || 0, displayedExportRangeEnd || 0);
  const overlayTrackWidth = waveformOverlayMetrics.wrapperWidth || waveformRef.current?.clientWidth || 0;
  const clampedExportStart = waveformDuration > 0 ? Math.max(0, Math.min(displayedExportRangeStart, waveformDuration)) : 0;
  const clampedExportEnd = waveformDuration > 0 ? Math.max(clampedExportStart, Math.min(displayedExportRangeEnd, waveformDuration)) : 0;
  const exportBarStartPercent = waveformDuration > 0 ? (clampedExportStart / waveformDuration) * 100 : 0;
  const exportBarWidthPercent = waveformDuration > 0 ? ((clampedExportEnd - clampedExportStart) / waveformDuration) * 100 : 0;
  const backgroundSlidesBelow = backgroundSlides.filter((slide) => slide.layer !== 'overlay').sort((a, b) => (b.backgroundOrder ?? 0) - (a.backgroundOrder ?? 0));
  const backgroundSlidesAbove = backgroundSlides.filter((slide) => slide.layer === 'overlay').sort((a, b) => (b.overlayOrder ?? 0) - (a.overlayOrder ?? 0));
  const backgroundSlideBarHeight = 3;
  const backgroundSlideTrackGap = 7;
  const backgroundSlideTrackPaddingTop = 10;
  const backgroundSlideTrackPaddingBottom = 4;
  const backgroundSlideTrackInnerHeight = backgroundSlides.length > 0 ? 12 + backgroundSlides.length * 10 : 0;
  const backgroundSlideTrackContentHeight = Math.min(128, backgroundSlideTrackInnerHeight);
  const backgroundSlideTrackHeight = backgroundSlides.length > 0 ? (isBackgroundSlideTrackCollapsed ? 8 : backgroundSlideTrackContentHeight + backgroundSlideTrackPaddingTop + backgroundSlideTrackPaddingBottom) : 0;
  const backgroundSlideGapToExportBar = backgroundSlides.length > 0 ? 7 : 1;
  const backgroundSlideBars = waveformDuration > 0
    ? [
        ...backgroundSlidesAbove.map((slide, index) => ({
          ...slide,
          group: 'overlay' as const,
          trackIndex: index,
          left: `${Math.max(0, Math.min(100, (slide.start / waveformDuration) * 100))}%`,
          width: `${Math.max(0, Math.min(100, ((Math.max(slide.end, slide.start) - slide.start) / waveformDuration) * 100))}%`,
        })),
        ...backgroundSlidesBelow.map((slide, index) => ({
          ...slide,
          group: 'background' as const,
          trackIndex: index,
          left: `${Math.max(0, Math.min(100, (slide.start / waveformDuration) * 100))}%`,
          width: `${Math.max(0, Math.min(100, ((Math.max(slide.end, slide.start) - slide.start) / waveformDuration) * 100))}%`,
        })),
      ].filter((slide) => Number.parseFloat(slide.width) > 0)
    : [];
  const hasStartRangeSubtitle = Boolean(rangeSubtitle && rangeSubtitle.start >= 0);
  const hasEndRangeSubtitle = Boolean(rangeSubtitle && rangeSubtitle.end >= 0);
  const rangeTooltipStyle = {
    backgroundColor: isDarkMode ? 'rgba(17, 24, 39, 0.78)' : 'rgba(255, 255, 255, 0.78)',
    color: uiTheme.text,
    border: `1px solid ${rgba(secondaryThemeColor, 0.3)}`,
    backdropFilter: 'blur(14px) saturate(140%)',
    WebkitBackdropFilter: 'blur(14px) saturate(140%)'
  };

  useEffect(() => {
    hasUserAdjustedZoomRef.current = false;
  }, [audioPath]);

  useEffect(() => {
    if (!exportRangeDragRef.current) {
      setDragPreviewRange(null);
    }
  }, [exportRangeStart, exportRangeEnd]);

  useEffect(() => {
    onEditingSubChangeRef.current = onEditingSubChange;
  }, [onEditingSubChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    let rafId = 0;
    const syncFromAudio = () => {
      if (!Number.isFinite(audio.currentTime)) return;
      setDisplayCurrentTime(audio.currentTime);
    };

    const handleSeeked = () => syncFromAudio();
    const handleLoadedMeta = () => syncFromAudio();
    const handlePausedTime = () => {
      if (!isPlaying) {
        syncFromAudio();
      }
    };

    audio.addEventListener('seeked', handleSeeked);
    audio.addEventListener('loadedmetadata', handleLoadedMeta);
    audio.addEventListener('timeupdate', handlePausedTime);

    if (isPlaying) {
      const tick = () => {
        syncFromAudio();
        rafId = window.requestAnimationFrame(tick);
      };
      rafId = window.requestAnimationFrame(tick);
    } else {
      syncFromAudio();
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      audio.removeEventListener('seeked', handleSeeked);
      audio.removeEventListener('loadedmetadata', handleLoadedMeta);
      audio.removeEventListener('timeupdate', handlePausedTime);
    };
  }, [audioRef, audioPath, isPlaying]);

  const parseFlexibleTime = (value: string) => {
    const input = value.trim();
    if (!input) return null;

    if (/^\d+(\.\d+)?$/.test(input)) {
      const seconds = Number(input);
      return Number.isFinite(seconds) ? seconds : null;
    }

    const parts = input.split(':').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2 || parts.length > 3) return null;

    const numericParts = parts.map((part) => Number(part));
    if (numericParts.some((part) => !Number.isFinite(part) || part < 0)) return null;

    if (parts.length === 2) {
      const [minutes, seconds] = numericParts;
      return minutes * 60 + seconds;
    }

    const [hours, minutes, seconds] = numericParts;
    return hours * 3600 + minutes * 60 + seconds;
  };

  const commitTimeJump = () => {
    const next = parseFlexibleTime(timeInputValue);
    if (next !== null && Number.isFinite(next) && next >= 0 && next <= duration) {
      onSeek(next);
    }
    setTimeInputMode(false);
  };

  const commitExportRangeInput = (field: 'start' | 'end') => {
    const rawValue = field === 'start' ? exportStartInputValue : exportEndInputValue;
    const next = parseFlexibleTime(rawValue);
    if (next !== null && Number.isFinite(next) && next >= 0) {
      onExportRangeChange(field === 'start' ? { start: next } : { end: next });
    }

    if (field === 'start') {
      setExportStartInputMode(false);
      return;
    }

    setExportEndInputMode(false);
  };

  const getWaveformOverlayElements = useCallback(() => {
    const host = waveformRef.current?.firstElementChild as HTMLElement | null;
    const shadowRoot = host?.shadowRoot;
    if (!shadowRoot) {
      return { scrollElement: null, wrapperElement: null };
    }

    const scrollElement = shadowRoot.querySelector('.scroll, [part="scroll"]') as HTMLElement | null;
    const wrapperElement = shadowRoot.querySelector('.wrapper, [part="wrapper"]') as HTMLElement | null;
    return { scrollElement, wrapperElement };
  }, []);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!audioPath) {
      setIsWaveformReady(false);
      wsRegions.current = null;
      wavesurfer.current = null;
      return;
    }
    if (!waveformRef.current) return;

    const readyResetTimer = window.setTimeout(() => setIsWaveformReady(false), 0);
    waveformRef.current.innerHTML = '';

    wavesurfer.current = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: waveformBaseColor,
      progressColor: waveformProgressColor,
      cursorColor: isDarkMode ? '#ffffff' : '#111827',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: waveformHeight,
      normalize: true,
      minPxPerSec: 50,
    });

    // Inject custom scrollbar styles into WaveSurfer's shadow wrapper
    const injectScrollbarStyle = () => {
      if (!waveformRef.current) return;
      const host = waveformRef.current.firstElementChild;
      if (host && host.shadowRoot) {
        if (!host.shadowRoot.querySelector('#ws-custom-scrollbar')) {
          const style = document.createElement('style');
          style.id = 'ws-custom-scrollbar';
          style.textContent = `
            ::-webkit-scrollbar { height: 6px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: ${rgba(secondaryThemeColor, 0.45)}; border-radius: 10px; }
            ::-webkit-scrollbar-thumb:hover { background: ${rgba(secondaryThemeColor, 0.65)}; }
          `;
          host.shadowRoot.appendChild(style);
        }

          if (!host.shadowRoot.querySelector('#ws-region-style')) {
            const regionStyle = document.createElement('style');
            regionStyle.id = 'ws-region-style';
            regionStyle.textContent = `
              .region[data-pomchat-nearby="1"] {
                border: 1px solid transparent !important;
                background:
                 linear-gradient(
                   to right,
                   ${rgba(secondaryThemeColor, 0.62)} 0,
                   ${rgba(secondaryThemeColor, 0.62)} 1px,
                   transparent 1px,
                   transparent calc(100% - 1px),
                   ${rgba(secondaryThemeColor, 0.62)} calc(100% - 1px),
                   ${rgba(secondaryThemeColor, 0.62)} 100%
                 ),
                 ${rgba(secondaryThemeColor, 0.16)} !important;
                box-shadow: none !important;
               }
               .region {
                border: 1px solid transparent !important;
                background:
                  linear-gradient(
                   to right,
                   ${rgba(secondaryThemeColor, 0.95)} 0,
                   ${rgba(secondaryThemeColor, 0.95)} 2px,
                   transparent 2px,
                   transparent calc(100% - 2px),
                   ${rgba(secondaryThemeColor, 0.95)} calc(100% - 2px),
                   ${rgba(secondaryThemeColor, 0.95)} 100%
                 ),
                 linear-gradient(90deg, ${secondaryThemeColor}55, ${secondaryThemeColor}2f) !important;
                box-shadow: none !important;
               }
               .region::before,
               .region::after {
                 content: '';
                 position: absolute;
                 top: 50%;
                transform: translateY(-50%);
               width: 7px;
               height: 20px;
                border-radius: 999px;
               background: ${secondaryThemeColor};
               border: 1px solid rgba(255,255,255,0.9);
               box-shadow: 0 2px 8px rgba(0,0,0,0.24);
                 z-index: 5;
                 pointer-events: none;
               }
              .region::before { left: -4px; }
              .region::after { right: -4px; }
               .region .region-handle,
               .region .handle,
               .region [part~="region-handle"],
               .region [part~="region-handle-left"],
               .region [part~="region-handle-right"] {
                width: 7px !important;
                height: 20px !important;
                top: 50% !important;
               transform: translateY(-50%) !important;
               margin-top: 0 !important;
               border-radius: 999px !important;
               background: ${secondaryThemeColor} !important;
               border: 1px solid rgba(255,255,255,0.9) !important;
               box-shadow: 0 2px 8px rgba(0,0,0,0.24) !important;
               opacity: 1 !important;
             }
               .region[data-pomchat-nearby="1"]::before,
               .region[data-pomchat-nearby="1"]::after,
               .region[data-pomchat-nearby="1"] .region-handle,
               .region[data-pomchat-nearby="1"] .handle,
               .region[data-pomchat-nearby="1"] [part~="region-handle"],
               .region[data-pomchat-nearby="1"] [part~="region-handle-left"],
               .region[data-pomchat-nearby="1"] [part~="region-handle-right"] {
                display: none !important;
                }
                .region[data-pomchat-background-slide="1"] {
                  border: 1px solid transparent !important;
                  background: ${rgba(secondaryThemeColor, 0.18)} !important;
                  box-shadow: inset 0 0 0 1px ${rgba(secondaryThemeColor, 0.42)} !important;
                }
                .region[data-pomchat-background-slide="1"]::before,
                .region[data-pomchat-background-slide="1"]::after,
                .region[data-pomchat-background-slide="1"] .region-handle,
                .region[data-pomchat-background-slide="1"] .handle,
                .region[data-pomchat-background-slide="1"] [part~="region-handle"],
                .region[data-pomchat-background-slide="1"] [part~="region-handle-left"],
                .region[data-pomchat-background-slide="1"] [part~="region-handle-right"] {
                  display: none !important;
                }
              `;
            host.shadowRoot.appendChild(regionStyle);
          }
      }
    };

    wavesurfer.current.on('ready', () => {
      setIsWaveformReady(true);
      injectScrollbarStyle();
    });
    // Fallback if ready fired too fast
    setTimeout(injectScrollbarStyle, 100);
    setTimeout(injectScrollbarStyle, 500);

    // Calculate minimum zoom to fit the entire audio
    wavesurfer.current.on('decode', () => {
      if (waveformRef.current && wavesurfer.current) {
        const dur = Math.max(duration || 0, wavesurfer.current.getDuration() || 0);
        if (dur > 0) {
          const containerWidth = waveformRef.current.clientWidth;
          const calculatedMin = containerWidth / dur;
          setMinZoom(calculatedMin);

          if (!hasUserAdjustedZoomRef.current) {
            setZoomLevel(calculatedMin);
            wavesurfer.current.zoom(calculatedMin);
          } else if ((wavesurfer.current.options.minPxPerSec || 0) < calculatedMin) {
            setZoomLevel(calculatedMin);
            wavesurfer.current.zoom(calculatedMin);
          }
        }
      }
    });
    
    wsRegions.current = wavesurfer.current.registerPlugin(RegionsPlugin.create());

    // Let WaveSurfer decode the source directly so containers like M4A
    // can still produce peaks even when playback is handled elsewhere.
    void wavesurfer.current.load(audioPath).catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error('WaveSurfer load failed:', error);
    });

    wavesurfer.current.on('interaction', (newTime) => {
      onSeek(newTime);
    });

    return () => {
      window.clearTimeout(readyResetTimer);
      setIsWaveformReady(false);
      wavesurfer.current?.destroy();
      wavesurfer.current = null;
      wsRegions.current = null;
      if (waveformRef.current) {
        waveformRef.current.innerHTML = '';
      }
    };
  }, [audioPath, isDarkMode, onSeek, audioRef, waveformBaseColor, waveformHeight, waveformProgressColor, secondaryThemeColor]);

  useEffect(() => {
    const updateOverlayMetrics = () => {
      const { scrollElement, wrapperElement } = getWaveformOverlayElements();
      setWaveformOverlayMetrics({
        scrollLeft: scrollElement?.scrollLeft ?? 0,
        wrapperWidth: wrapperElement?.clientWidth ?? waveformRef.current?.clientWidth ?? 0,
        viewportWidth: scrollElement?.clientWidth ?? waveformRef.current?.clientWidth ?? 0,
      });
    };

    if (!isWaveformReady && !audioPath) {
      updateOverlayMetrics();
      return;
    }

    if (!isWaveformReady) {
      setWaveformOverlayMetrics({ scrollLeft: 0, wrapperWidth: 0, viewportWidth: 0 });
      return;
    }

    const { scrollElement, wrapperElement } = getWaveformOverlayElements();
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => updateOverlayMetrics())
      : null;

    scrollElement?.addEventListener('scroll', updateOverlayMetrics, { passive: true });
    resizeObserver?.observe(waveformRef.current!);
    if (scrollElement) {
      resizeObserver?.observe(scrollElement);
    }
    if (wrapperElement) {
      resizeObserver?.observe(wrapperElement);
    }
    updateOverlayMetrics();
    const syncTimer = window.setTimeout(updateOverlayMetrics, 80);

    return () => {
      window.clearTimeout(syncTimer);
      scrollElement?.removeEventListener('scroll', updateOverlayMetrics);
      resizeObserver?.disconnect();
    };
  }, [audioPath, getWaveformOverlayElements, isWaveformReady]);

  // Sync zoomLevel to slider DOM when it changes externally (auto-fit, waveform load, etc.)
  useEffect(() => {
    if (zoomRangeRef.current && Number(zoomRangeRef.current.value) !== zoomLevel) {
      zoomRangeRef.current.value = String(zoomLevel);
    }
  }, [zoomLevel]);

  // Handle Waveform Zoom via scroll — pure RAF, no direct WaveSurfer manipulation
  useEffect(() => {
    const container = waveformRef.current;
    if (!container) return;

    let rafId: number | null = null;

    const handleWheel = (e: WheelEvent) => {
      if (!isWaveformReady) return;
      e.preventDefault();
      e.stopPropagation();

      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }

      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        if (!wavesurfer.current || !isWaveformReady) return;

        const currentZoom = zoomLevel; // use React state as source of truth
        const zoomFactor = e.deltaY < 0 ? 1.2 : 0.8;
        const newZoom = Math.max(minZoom, Math.min(1000, currentZoom * zoomFactor));

        hasUserAdjustedZoomRef.current = true;
        setZoomLevel(newZoom);
        wavesurfer.current.zoom(newZoom);
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      container.removeEventListener('wheel', handleWheel);
    };
  }, [isWaveformReady, minZoom, zoomLevel]);

  // Update WaveSurfer playback rate
  useEffect(() => {
    if (wavesurfer.current) {
      wavesurfer.current.setPlaybackRate(playbackRate);
    }
  }, [playbackRate]);

  useEffect(() => {
    if (!wavesurfer.current || !isWaveformReady) {
      return;
    }

    const nextTime = Number.isFinite(liveCurrentTime) ? liveCurrentTime : 0;
    const durationSeconds = wavesurfer.current.getDuration() || 0;
    if (durationSeconds <= 0) {
      return;
    }

    const clampedTime = Math.max(0, Math.min(nextTime, durationSeconds));
    const currentWaveTime = wavesurfer.current.getCurrentTime();
    if (Math.abs(currentWaveTime - clampedTime) < 1 / 120) {
      return;
    }

    wavesurfer.current.setTime(clampedTime);
  }, [isWaveformReady, liveCurrentTime]);

  // Volume Sync
  useEffect(() => {
    if (audioRef?.current) {
      audioRef.current.volume = volume;
    }
  }, [volume, audioRef]);

  // Handle Editing Subtitle Regions
  useEffect(() => {
    if (!wsRegions.current || !wavesurfer.current) return;
    wsRegions.current.clearRegions();

    const sourceRegion = editingSub ?? rangeSubtitle;
    nearbySubtitles.forEach((sub) => {
      const isPrimary = Boolean(sourceRegion && sub.start === sourceRegion.start && sub.end === sourceRegion.end);
      if (isPrimary) return;

      const region = wsRegions.current?.addRegion({
        start: sub.start,
        end: sub.end,
        color: `${secondaryThemeColor}14`,
        drag: false,
        resize: false,
      });

      if (region?.element?.dataset) {
        region.element.dataset.pomchatNearby = '1';
      }
    });

      if (sourceRegion) {
        const region = wsRegions.current.addRegion({
        start: sourceRegion.start,
        end: sourceRegion.end,
        color: `${secondaryThemeColor}33`,
        drag: Boolean(editingSub),
        resize: Boolean(editingSub),
      });

      const tooltipTimer = window.setTimeout(() => {
        setRegionTooltip({ start: sourceRegion.start, end: sourceRegion.end });
      }, 0);

      if (region.element?.dataset) {
        region.element.dataset.pomchatNearby = '0';
      }

      if (!editingSub) {
        return () => {
          window.clearTimeout(tooltipTimer);
          setRegionTooltip(null);
        };
      }

      const handleUpdate = () => {
        if (onEditingSubChangeRef.current) {
          onEditingSubChangeRef.current(region.start, region.end);
        }
      };

      const handleRegionUpdating = () => {
        setRegionTooltip({ start: region.start, end: region.end });
      };

      const handleRegionDone = () => {
        setRegionTooltip({ start: region.start, end: region.end });
        handleUpdate();
      };

      region.on('update', handleRegionUpdating);
      region.on('update-end', handleRegionDone);
      return () => {
        window.clearTimeout(tooltipTimer);
        setRegionTooltip(null);
        region.un('update', handleRegionUpdating);
        region.un('update-end', handleRegionDone);
      };
    }

    const tooltipResetTimer = window.setTimeout(() => setRegionTooltip(null), 0);
    return () => {
      window.clearTimeout(tooltipResetTimer);
    };
  }, [editingSub, nearbySubtitles, rangeSubtitle, secondaryThemeColor, isDarkMode]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const pointerWaveformDuration = Math.max(duration || 0, defaultExportEnd || 0, exportRangeEnd || 0);

      if (backgroundSlideDragRef.current) {
        const viewportRect = waveformRef.current?.getBoundingClientRect();
        if (!viewportRect || pointerWaveformDuration <= 0) {
          return;
        }
        const { scrollElement } = getWaveformOverlayElements();
        const scrollLeft = scrollElement?.scrollLeft ?? waveformOverlayMetrics.scrollLeft;
        const relativeX = event.clientX - viewportRect.left + scrollLeft;
        const contentWidth = waveformOverlayMetrics.wrapperWidth || viewportRect.width;
        const clampedX = Math.max(0, Math.min(relativeX, contentWidth));
        const nextTime = Number(((clampedX / contentWidth) * pointerWaveformDuration).toFixed(2));
        const dragTarget = backgroundSlideDragRef.current;

        if (onBackgroundSlidesChange) {
          onBackgroundSlidesChange(backgroundSlides.map((slide) => {
            if (slide.id !== dragTarget.id) return slide;
            if (dragTarget.edge === 'move') {
              const durationSpan = Math.max(0, dragTarget.initialEnd - dragTarget.initialStart);
              const delta = nextTime - dragTarget.anchorTime;
              const unclampedStart = dragTarget.initialStart + delta;
              const maxStart = Math.max(0, pointerWaveformDuration - durationSpan);
              const start = Math.max(0, Math.min(unclampedStart, maxStart));
              return { ...slide, start, end: start + durationSpan };
            }
            if (dragTarget.edge === 'start') {
              return { ...slide, start: Math.min(nextTime, slide.end) };
            }
            return { ...slide, end: Math.max(nextTime, slide.start) };
          }));
        }
        return;
      }

      const dragTarget = exportRangeDragRef.current;
      if (!dragTarget || !waveformOverlayMetrics.wrapperWidth) {
        return;
      }

      const { scrollElement } = getWaveformOverlayElements();
      const viewportRect = waveformRef.current?.getBoundingClientRect();
      if (!viewportRect || pointerWaveformDuration <= 0) {
        return;
      }

      const scrollLeft = scrollElement?.scrollLeft ?? waveformOverlayMetrics.scrollLeft;
      const relativeX = event.clientX - viewportRect.left + scrollLeft;
      const clampedX = Math.max(0, Math.min(relativeX, waveformOverlayMetrics.wrapperWidth));
      const nextTime = Number(((clampedX / waveformOverlayMetrics.wrapperWidth) * pointerWaveformDuration).toFixed(2));

      if (dragTarget.mode === 'move') {
        const durationSpan = Math.max(0, dragTarget.initialEnd - dragTarget.initialStart);
        const delta = nextTime - dragTarget.anchorTime;
        const unclampedStart = dragTarget.initialStart + delta;
        const maxStart = Math.max(0, pointerWaveformDuration - durationSpan);
        const start = Math.max(0, Math.min(unclampedStart, maxStart));
        setDragPreviewRange({ start, end: start + durationSpan });
      } else if (dragTarget.mode === 'start') {
        setDragPreviewRange((prev) => {
          const currentEnd = prev?.end ?? exportRangeEnd;
          return {
            start: Math.min(nextTime, currentEnd),
            end: currentEnd,
          };
        });
      } else {
        setDragPreviewRange((prev) => {
          const currentStart = prev?.start ?? exportRangeStart;
          return {
            start: currentStart,
            end: Math.max(nextTime, currentStart),
          };
        });
      }
    };

    const handlePointerUp = () => {
      if (backgroundSlideDragRef.current) {
        backgroundSlideDragRef.current = null;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        return;
      }

      if (exportRangeDragRef.current && dragPreviewRange) {
        onExportRangeChange(dragPreviewRange);
      }
      exportRangeDragRef.current = null;
      setDragPreviewRange(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [backgroundSlides, defaultExportEnd, dragPreviewRange, duration, exportRangeEnd, exportRangeStart, getWaveformOverlayElements, onBackgroundSlidesChange, onExportRangeChange, waveformOverlayMetrics]);

  // Removed manual Sync effect since WaveSurfer syncs via the media element automatically.
  // UI time display is read directly from the audio element.

  const rates = [0.5, 1.0, 1.25, 1.5, 2.0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(event.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePlaceholderWaveformSeek = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (waveformDuration <= 0) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, relativeX / rect.width));
    onSeek(ratio * waveformDuration);
  }, [onSeek, waveformDuration]);
  const handlePlaceholderWaveformHover = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (waveformDuration <= 0) {
      setWaveformHoverPreview(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const ratio = rect.width > 0 ? relativeX / rect.width : 0;
    setWaveformHoverPreview({ x: relativeX, time: ratio * waveformDuration });
  }, [waveformDuration]);
  const getPointerTime = useCallback((clientX: number) => {
    const viewportRect = waveformRef.current?.getBoundingClientRect();
    const pointerWaveformDuration = Math.max(duration || 0, defaultExportEnd || 0, exportRangeEnd || 0);
    if (!viewportRect || pointerWaveformDuration <= 0) {
      return 0;
    }
    const { scrollElement } = getWaveformOverlayElements();
    const scrollLeft = scrollElement?.scrollLeft ?? waveformOverlayMetrics.scrollLeft;
    const relativeX = clientX - viewportRect.left + scrollLeft;
    const contentWidth = waveformOverlayMetrics.wrapperWidth || viewportRect.width;
    const clampedX = Math.max(0, Math.min(relativeX, contentWidth));
    return Number(((clampedX / contentWidth) * pointerWaveformDuration).toFixed(2));
  }, [defaultExportEnd, duration, exportRangeEnd, getWaveformOverlayElements, waveformOverlayMetrics.scrollLeft, waveformOverlayMetrics.wrapperWidth]);
  const handleRealWaveformHover = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (waveformDuration <= 0) {
      setWaveformHoverPreview(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const contentWidth = waveformOverlayMetrics.wrapperWidth || rect.width;
    const scrollRatio = rect.width > 0 ? relativeX / rect.width : 0;
    const scrollLeft = waveformOverlayMetrics.scrollLeft;
    const absoluteX = Math.max(0, Math.min(contentWidth, scrollLeft + scrollRatio * rect.width));
    const time = contentWidth > 0 ? (absoluteX / contentWidth) * waveformDuration : 0;
    setWaveformHoverPreview({ x: relativeX, time });
  }, [waveformDuration, waveformOverlayMetrics.scrollLeft, waveformOverlayMetrics.wrapperWidth]);
  const clearWaveformHover = useCallback(() => {
    setWaveformHoverPreview(null);
  }, []);

  return (
    <div className={`border-t flex flex-col shrink-0 z-20 transition-colors duration-300 [&_.text-xs]:text-sm ${compactMobile ? 'h-auto px-2.5 py-1.5' : 'h-auto px-6 py-2'}`} style={{ backgroundColor: uiTheme.toolbarBg, borderColor: uiTheme.border, boxShadow: `0 -4px 14px ${secondaryThemeColor}16` }}>
      
      {/* Waveform Track */}
      <div
        className="relative z-10 w-full overflow-visible"
        style={{
          height: showWaveformContainer ? undefined : 0,
          marginBottom: showWaveformContainer ? '0.5rem' : 0
        }}
      >
      {showWaveformContainer && editingSub && regionTooltip && (
            <div
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 px-2 py-1 rounded-md text-[10px] font-mono z-[70] pointer-events-none whitespace-nowrap"
              style={{
                backgroundColor: isDarkMode ? `${themeColor}F2` : uiTheme.panelBgElevated,
                color: isDarkMode ? '#ffffff' : uiTheme.text,
                border: `1px solid ${secondaryThemeColor}`,
                boxShadow: isDarkMode ? `0 8px 22px ${secondaryThemeColor}22` : `0 8px 20px ${secondaryThemeColor}1A`
              }}
            >
              {formatTime(regionTooltip.start)} - {formatTime(regionTooltip.end)}
            </div>
          )}
          {showWaveformContainer && waveformHoverPreview && waveformDuration > 0 && (
            <div
              className="absolute bottom-full mb-2 px-2 py-1 rounded-md text-[10px] font-mono z-[65] pointer-events-none whitespace-nowrap -translate-x-1/2"
              style={{
                left: `${waveformHoverPreview.x}px`,
                backgroundColor: isDarkMode ? `${themeColor}F2` : uiTheme.panelBgElevated,
                color: isDarkMode ? '#ffffff' : uiTheme.text,
                border: `1px solid ${secondaryThemeColor}`,
                boxShadow: isDarkMode ? `0 8px 22px ${secondaryThemeColor}22` : `0 8px 20px ${secondaryThemeColor}1A`
              }}
            >
              {formatTime(waveformHoverPreview.time)}
            </div>
          )}
          {showWaveformContainer && insertImageHoverLabel && (
            <div
                className="fixed px-2 py-1 rounded-md text-[10px] z-[9999] pointer-events-none whitespace-nowrap"
                style={{
                  left: `${insertImageHoverLabel.x}px`,
                  top: `${insertImageHoverLabel.y}px`,
                  backgroundColor: isDarkMode
                    ? `color-mix(in srgb, ${themeColor} 15%, black)`
                    : `color-mix(in srgb, ${themeColor} 15%, white)`,
                  color: isDarkMode ? '#ffffff' : '#1f2937',
                  border: `1px solid ${secondaryThemeColor}`,
                  boxShadow: isDarkMode ? `0 8px 22px ${secondaryThemeColor}22` : `0 8px 20px ${secondaryThemeColor}1A`,
                  transform: insertImageHoverLabel.type === 'text'
                    ? 'translate(-50%, calc(-100% - 4px))'
                    : 'translate(-50%, calc(-100% - 8px))'
                }}
              >
                {insertImageHoverLabel.type === 'image' && insertImageHoverLabel.image ? (
                  <img src={insertImageHoverLabel.image} alt={insertImageHoverLabel.label} className="block w-20 h-12 object-cover rounded mb-1" />
                ) : null}
                {insertImageHoverLabel.type === 'text' && insertImageHoverLabel.text ? (
                  <div className="max-w-32 text-[10px] leading-4 whitespace-pre-wrap line-clamp-2 mb-1">{insertImageHoverLabel.text}</div>
                ) : null}
                {insertImageHoverLabel.label}
            </div>
          )}
          {showWaveformContainer && overlayTrackWidth > 0 && (
            <div className="relative w-full overflow-visible mb-0.5" style={{ height: `${Math.max(exportHandleSize + 4, 14)}px`, marginTop: backgroundSlides.length > 0 ? `${backgroundSlideTrackHeight + backgroundSlideGapToExportBar}px` : undefined }}>
              {backgroundSlideBars.length > 0 && (
                <div
                  className="absolute left-0 right-0 rounded-lg overflow-hidden"
                  style={{
                    top: `${-(backgroundSlideTrackHeight + backgroundSlideGapToExportBar)}px`,
                    height: `${backgroundSlideTrackHeight}px`,
                    background: `linear-gradient(180deg, ${rgba(themeColor, isDarkMode ? 0.09 : 0.05)} 0%, ${rgba(themeColor, isDarkMode ? 0.05 : 0.025)} 100%)`,
                    border: `1px solid ${rgba(themeColor, isDarkMode ? 0.18 : 0.12)}`,
                    boxShadow: `inset 0 0 0 1px ${rgba(themeColor, isDarkMode ? 0.04 : 0.02)}`,
                  }}
                >
                  <div
                    className="relative overflow-x-hidden"
                    style={{
                      height: '100%',
                      overflowY: backgroundSlideTrackInnerHeight > backgroundSlideTrackContentHeight ? 'auto' : 'hidden',
                      overscrollBehavior: 'contain',
                    }}
                  >
                    <div
                      className="relative"
                      style={{ height: `${backgroundSlideTrackInnerHeight + backgroundSlideTrackPaddingTop + backgroundSlideTrackPaddingBottom}px` }}
                    >
                      <div
                        className="absolute left-0 top-0"
                        style={{
                          width: `${overlayTrackWidth}px`,
                          height: `${backgroundSlideTrackInnerHeight + backgroundSlideTrackPaddingTop + backgroundSlideTrackPaddingBottom}px`,
                          transform: `translate(${-waveformOverlayMetrics.scrollLeft}px, 0)`,
                        }}
                      >
                      {!isBackgroundSlideTrackCollapsed && backgroundSlidesBelow.length > 0 && backgroundSlidesAbove.length > 0 ? (
                        <div
                          className="absolute left-2 right-2"
                          style={{
                            top: `${backgroundSlideTrackPaddingTop + backgroundSlidesAbove.length * (backgroundSlideBarHeight + backgroundSlideTrackGap) + 1}px`,
                            height: '1px',
                            backgroundColor: rgba(themeColor, isDarkMode ? 0.55 : 0.38),
                          }}
                        />
                      ) : null}
                      {backgroundSlideBars.map((slide) => (
                        (() => {
                          const collapsedTop = 2;
                          const expandedTop = backgroundSlideTrackPaddingTop + (slide.group === 'overlay'
                            ? slide.trackIndex * (backgroundSlideBarHeight + backgroundSlideTrackGap)
                            : (backgroundSlidesAbove.length * (backgroundSlideBarHeight + backgroundSlideTrackGap)) + backgroundSlideTrackGap + slide.trackIndex * (backgroundSlideBarHeight + backgroundSlideTrackGap));

                          return <div
                            key={slide.id}
                            className="absolute group"
                            style={{
                              left: slide.left,
                              width: slide.width,
                              top: `${isBackgroundSlideTrackCollapsed ? collapsedTop : expandedTop}px`,
                              height: `${backgroundSlideBarHeight}px`,
                              minWidth: '10px',
                              opacity: isBackgroundSlideTrackCollapsed ? 0.42 : 1,
                              zIndex: isBackgroundSlideTrackCollapsed ? 20 : undefined,
                              pointerEvents: isBackgroundSlideTrackCollapsed ? 'none' : 'auto',
                              cursor: isBackgroundSlideTrackCollapsed ? 'default' : 'grab',
                            }}
                            onPointerDown={(event) => {
                              if (isBackgroundSlideTrackCollapsed) return;
                              event.preventDefault();
                              event.stopPropagation();
                              backgroundSlideDragRef.current = { id: slide.id, edge: 'move', initialStart: slide.start, initialEnd: slide.end, anchorTime: getPointerTime(event.clientX) };
                              document.body.style.userSelect = 'none';
                              document.body.style.cursor = 'grabbing';
                            }}
                            onDoubleClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              onSeek(slide.start);
                              if (onEditInsertImage) {
                                onEditInsertImage(slide.id);
                              }
                            }}
                            onMouseEnter={(event) => {
                              if (!isBackgroundSlideTrackCollapsed && slide.name) {
                                const rect = event.currentTarget.getBoundingClientRect();
                                const x = rect.left + rect.width / 2;
                                const y = rect.top;
                                setInsertImageHoverLabel({ x, y, label: `${slide.type === 'text' ? t('project.assetTypeText') : t('project.assetTypeImage')} ${slide.name}`, type: slide.type, image: slide.image, text: slide.text });
                              }
                            }}
                            onMouseLeave={() => {
                              if (!isBackgroundSlideTrackCollapsed) {
                                setInsertImageHoverLabel(null);
                              }
                            }}
                          >
                          <div
                            className="absolute inset-0 rounded-sm"
                            style={{
                              backgroundColor: slide.group === 'background' ? themeColor : secondaryThemeColor,
                              boxShadow: `0 0 0 1px ${rgba(slide.group === 'background' ? themeColor : secondaryThemeColor, isDarkMode ? 0.18 : 0.12)}`,
                              backgroundImage: slide.type === 'text' ? `linear-gradient(135deg, transparent 25%, ${rgba('#ffffff', 0.18)} 25%, ${rgba('#ffffff', 0.18)} 50%, transparent 50%, transparent 75%, ${rgba('#ffffff', 0.18)} 75%, ${rgba('#ffffff', 0.18)} 100%)` : undefined,
                              backgroundSize: slide.type === 'text' ? '8px 8px' : undefined,
                            }}
                          />
                          {!isBackgroundSlideTrackCollapsed ? <button
                            type="button"
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full border"
                            style={{
                              left: 0,
                              width: '10px',
                              height: '10px',
                              backgroundColor: uiTheme.panelBgElevated,
                              borderColor: slide.group === 'background' ? themeColor : secondaryThemeColor,
                              boxShadow: `0 0 0 1px ${rgba(slide.group === 'background' ? themeColor : secondaryThemeColor, isDarkMode ? 0.24 : 0.16)}`,
                              cursor: 'ew-resize',
                              pointerEvents: 'auto',
                            }}
                            onPointerDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              backgroundSlideDragRef.current = { id: slide.id, edge: 'start', initialStart: slide.start, initialEnd: slide.end, anchorTime: slide.start };
                              document.body.style.userSelect = 'none';
                              document.body.style.cursor = 'ew-resize';
                            }}
                            title={slide.name}
                          /> : null}
                          {!isBackgroundSlideTrackCollapsed ? <button
                            type="button"
                            className="absolute top-1/2 translate-x-1/2 -translate-y-1/2 rounded-full border"
                            style={{
                              right: 0,
                              width: '10px',
                              height: '10px',
                              backgroundColor: uiTheme.panelBgElevated,
                              borderColor: slide.group === 'background' ? themeColor : secondaryThemeColor,
                              boxShadow: `0 0 0 1px ${rgba(slide.group === 'background' ? themeColor : secondaryThemeColor, isDarkMode ? 0.24 : 0.16)}`,
                              cursor: 'ew-resize',
                              pointerEvents: 'auto',
                            }}
                            onPointerDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              backgroundSlideDragRef.current = { id: slide.id, edge: 'end', initialStart: slide.start, initialEnd: slide.end, anchorTime: slide.end };
                              document.body.style.userSelect = 'none';
                              document.body.style.cursor = 'ew-resize';
                            }}
                            title={slide.name}
                          /> : null}
                          </div>;
                        })()
                      ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* Collapse/expand button — positioned at top of the track, outside the track container so it moves with track height */}
              {backgroundSlideBars.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsBackgroundSlideTrackCollapsed((prev) => !prev)}
                   className="absolute right-1.5 h-5 w-5 rounded-full border inline-flex items-center justify-center z-10"
                  style={{
                    top: `${-(backgroundSlideTrackHeight + backgroundSlideGapToExportBar) - 8}px`,
                    borderColor: rgba(secondaryThemeColor, 0.3),
                    backgroundColor: isDarkMode ? 'rgba(17,24,39,0.7)' : 'rgba(255,255,255,0.72)',
                    color: secondaryThemeColor,
                    transform: 'translateY(-50%)',
                  }}
                  title={isBackgroundSlideTrackCollapsed ? t('project.expandTimelineEditor') : t('project.collapseTimelineEditor')}
                >
                  {isBackgroundSlideTrackCollapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              )}
              <div
                className="absolute left-0 top-0"
                style={{
                  width: `${overlayTrackWidth}px`,
                  height: `${exportBarHeight}px`,
                  transform: `translate(${-waveformOverlayMetrics.scrollLeft}px, 0)`,
                  backgroundColor: exportBarBaseColor,
                  borderRadius: 9999,
                  boxShadow: `inset 0 0 0 1px ${rgba(themeColor, isDarkMode ? 0.2 : 0.12)}`,
                }}
                >
                  <div
                    className="absolute top-0 h-full rounded-full"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    exportRangeDragRef.current = { mode: 'move', initialStart: exportRangeStart, initialEnd: exportRangeEnd, anchorTime: getPointerTime(event.clientX) };
                    document.body.style.userSelect = 'none';
                    document.body.style.cursor = 'grabbing';
                  }}
                  style={{
                    left: `${exportBarStartPercent}%`,
                    width: `${exportBarWidthPercent}%`,
                    minWidth: exportBarWidthPercent > 0 ? `${exportHandleSize}px` : 0,
                    backgroundColor: exportBarFillColor,
                    boxShadow: `0 0 0 1px ${rgba(secondaryThemeColor, isDarkMode ? 0.3 : 0.18)}, 0 3px 12px ${rgba(secondaryThemeColor, isDarkMode ? 0.26 : 0.18)}`,
                    cursor: 'grab',
                    pointerEvents: 'auto',
                  }}
                >
                  <button
                    type="button"
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full border pointer-events-auto transition-all duration-150 hover:scale-110"
                    style={{
                      left: 0,
                      width: `${exportHandleSize}px`,
                      height: `${exportHandleSize}px`,
                      backgroundColor: uiTheme.panelBgElevated,
                      borderColor: secondaryThemeColor,
                      boxShadow: `0 2px 8px ${rgba(secondaryThemeColor, isDarkMode ? 0.3 : 0.18)}`,
                      touchAction: 'none',
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.backgroundColor = '#ffffff';
                      event.currentTarget.style.boxShadow = `0 0 0 3px ${rgba(secondaryThemeColor, isDarkMode ? 0.18 : 0.14)}, 0 4px 14px ${rgba(secondaryThemeColor, isDarkMode ? 0.34 : 0.24)}`;
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.backgroundColor = uiTheme.panelBgElevated;
                      event.currentTarget.style.boxShadow = `0 2px 8px ${rgba(secondaryThemeColor, isDarkMode ? 0.3 : 0.18)}`;
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      exportRangeDragRef.current = { mode: 'start', initialStart: exportRangeStart, initialEnd: exportRangeEnd, anchorTime: exportRangeStart };
                      document.body.style.userSelect = 'none';
                      document.body.style.cursor = 'ew-resize';
                    }}
                    aria-label={t('export.rangeStart')}
                  />
                  <button
                    type="button"
                    className="absolute top-1/2 -translate-y-1/2 translate-x-1/2 rounded-full border pointer-events-auto transition-all duration-150 hover:scale-110"
                    style={{
                      right: 0,
                      width: `${exportHandleSize}px`,
                      height: `${exportHandleSize}px`,
                      backgroundColor: uiTheme.panelBgElevated,
                      borderColor: secondaryThemeColor,
                      boxShadow: `0 2px 8px ${rgba(secondaryThemeColor, isDarkMode ? 0.3 : 0.18)}`,
                      touchAction: 'none',
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.backgroundColor = '#ffffff';
                      event.currentTarget.style.boxShadow = `0 0 0 3px ${rgba(secondaryThemeColor, isDarkMode ? 0.18 : 0.14)}, 0 4px 14px ${rgba(secondaryThemeColor, isDarkMode ? 0.34 : 0.24)}`;
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.backgroundColor = uiTheme.panelBgElevated;
                      event.currentTarget.style.boxShadow = `0 2px 8px ${rgba(secondaryThemeColor, isDarkMode ? 0.3 : 0.18)}`;
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      exportRangeDragRef.current = { mode: 'end', initialStart: exportRangeStart, initialEnd: exportRangeEnd, anchorTime: exportRangeEnd };
                      document.body.style.userSelect = 'none';
                      document.body.style.cursor = 'ew-resize';
                    }}
                    aria-label={t('export.rangeEnd')}
                  />
                </div>
              </div>
            </div>
          )}
          <div className="w-full overflow-hidden">
            {audioPath ? (
              <div
                className="w-full cursor-pointer"
                ref={waveformRef}
                title={t('player.waveformTitle')}
                style={{ visibility: isWaveformReady ? 'visible' : 'hidden' }}
                onMouseMove={handleRealWaveformHover}
                onMouseLeave={clearWaveformHover}
              />
            ) : (
              <div
                className="w-full rounded-md border"
                ref={waveformRef}
                onClick={handlePlaceholderWaveformSeek}
                onMouseMove={handlePlaceholderWaveformHover}
                onMouseLeave={clearWaveformHover}
                style={{
                  height: `${waveformHeight}px`,
                  borderColor: rgba(secondaryThemeColor, 0.2),
                  background: `linear-gradient(180deg, ${rgba(themeColor, isDarkMode ? 0.06 : 0.035)} 0%, ${rgba(themeColor, isDarkMode ? 0.03 : 0.015)} 100%)`,
                  position: 'relative',
                  cursor: waveformDuration > 0 ? 'pointer' : 'default',
                  overflow: 'hidden',
                }}
                title={waveformDuration > 0 ? t('player.waveformTitle') : undefined}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    height: '1px',
                    backgroundColor: rgba(secondaryThemeColor, isDarkMode ? 0.65 : 0.5),
                    borderRadius: 9999,
                  }}
                />
                {waveformHoverPreview && waveformDuration > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${waveformHoverPreview.x}px`,
                      width: '1px',
                      transform: 'translateX(-50%)',
                      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.96)',
                      boxShadow: isDarkMode ? '0 0 0 1px rgba(255,255,255,0.12)' : '0 0 0 1px rgba(17,24,39,0.08)',
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </div>
            )}
          </div>
          {!audioPath && showWaveformContainer && (
            <div className="mt-1 text-[11px]" style={{ color: uiTheme.textMuted }}>
              {t('player.noAudioWaveform')}
            </div>
          )}
      </div>

      {/* Controls Row */}
      <div className={`relative z-40 flex items-center gap-2 pb-2 min-w-0 ${compactMobile ? 'justify-between' : 'justify-between'}`}>
        {!compactMobile && (
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {timeInputMode ? (
            <input
              type="text"
              value={timeInputValue}
              onChange={(e) => setTimeInputValue(e.target.value)}
              onBlur={commitTimeJump}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTimeJump();
                if (e.key === 'Escape') setTimeInputMode(false);
              }}
              className={`${compactMobile ? 'w-[96px] text-sm' : 'w-[112px] text-base'} font-mono font-medium tracking-wider px-2 py-1 text-center rounded-full focus:outline-none ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
              style={{ backgroundColor: `${secondaryThemeColor}14`, border: `1px solid ${secondaryThemeColor}33` }}
              autoFocus
            />
          ) : (
            <button
              type="button"
              onDoubleClick={() => {
                setTimeInputValue(formatTime(liveCurrentTime));
                setTimeInputMode(true);
              }}
              className={`${compactMobile ? 'w-[96px] text-sm' : 'w-[112px] text-base'} font-mono font-medium tracking-wider inline-flex px-2 py-1 justify-center rounded-full transition-all duration-200 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
              style={{ 
                backgroundColor: `${secondaryThemeColor}20`, 
                border: `1.5px solid ${secondaryThemeColor}55`,
                boxShadow: `0 0 0 0 transparent`
              }}
              title="Double click to jump (supports 00:00:00.00)"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = `${secondaryThemeColor}28`;
                e.currentTarget.style.boxShadow = `0 4px 12px ${secondaryThemeColor}22`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = `${secondaryThemeColor}20`;
                e.currentTarget.style.boxShadow = '0 0 0 0 transparent';
              }}
            >
              {formatTime(liveCurrentTime)}
            </button>
          )}
          <span className={`${compactMobile ? 'text-sm' : 'text-xs'} font-mono ${textClass}`}>/ {formatTime(duration)}</span>
        </div>
        )}

        {!compactMobile && (
        <div className={`relative flex items-center gap-3 shrink-0 ${compactMobile ? 'order-1 basis-full overflow-x-auto pb-1 justify-start' : 'justify-center'}`}>
          <div className="flex items-center gap-1.5 rounded-full px-2 py-1.5" style={{ backgroundColor: `${secondaryThemeColor}10`, border: `1px solid ${secondaryThemeColor}22`, boxShadow: `0 4px 14px ${secondaryThemeColor}10` }}>
            <button
              type="button"
              onClick={() => onExportRangeChange({ start: defaultExportStart })}
              className="rounded-full p-1.5 transition-all duration-200 hover:scale-105 hover:shadow-md hover:text-white relative group"
              style={{ backgroundColor: `${secondaryThemeColor}14`, color: secondaryThemeColor, boxShadow: `0 0 0 0 transparent` }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = secondaryThemeColor;
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.boxShadow = `0 8px 18px ${secondaryThemeColor}33`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = `${secondaryThemeColor}14`;
                e.currentTarget.style.color = secondaryThemeColor;
                e.currentTarget.style.boxShadow = '0 0 0 0 transparent';
              }}
              title={t('export.useEarliest')}
            >
              <SkipBack size={14} />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap" style={rangeTooltipStyle}>
                {t('export.useEarliest')}
              </div>
            </button>
            <button
              type="button"
              disabled={!hasStartRangeSubtitle}
              onClick={() => {
                if (rangeSubtitle) {
                  onExportRangeChange({ start: rangeSubtitle.start });
                  onSeek(rangeSubtitle.start);
                }
              }}
              className="rounded-full p-1.5 transition-all duration-200 relative group disabled:cursor-not-allowed disabled:hover:scale-100"
              style={hasStartRangeSubtitle
                ? { backgroundColor: `${secondaryThemeColor}22`, color: secondaryThemeColor, boxShadow: `0 2px 8px ${secondaryThemeColor}18` }
                : { backgroundColor: isDarkMode ? 'rgba(107, 114, 128, 0.2)' : 'rgba(156, 163, 175, 0.18)', color: isDarkMode ? '#9ca3af' : '#6b7280', boxShadow: 'none' }}
              onMouseEnter={(e) => {
                if (!hasStartRangeSubtitle) return;
                e.currentTarget.style.backgroundColor = secondaryThemeColor;
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.boxShadow = `0 6px 16px ${secondaryThemeColor}38`;
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                if (!hasStartRangeSubtitle) return;
                e.currentTarget.style.backgroundColor = `${secondaryThemeColor}22`;
                e.currentTarget.style.color = secondaryThemeColor;
                e.currentTarget.style.boxShadow = `0 2px 8px ${secondaryThemeColor}18`;
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title={t('export.useSubtitleStart')}
            >
              <ArrowLeft size={14} />
              {hasStartRangeSubtitle && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap" style={rangeTooltipStyle}>
                  {t('export.useSubtitleStart')}
                </div>
              )}
            </button>
            <button
               type="button"
               onClick={() => onExportRangeChange({ start: liveCurrentTime })}
                className="rounded-full p-1.5 transition-all duration-200 hover:scale-105 relative group"
                style={{ backgroundColor: `${secondaryThemeColor}14`, color: secondaryThemeColor, boxShadow: `0 0 0 0 transparent` }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = secondaryThemeColor;
                 e.currentTarget.style.color = '#ffffff';
                 e.currentTarget.style.boxShadow = `0 8px 18px ${secondaryThemeColor}33`;
               }}
               onMouseLeave={(e) => {
                 e.currentTarget.style.backgroundColor = `${secondaryThemeColor}14`;
                 e.currentTarget.style.color = secondaryThemeColor;
                 e.currentTarget.style.boxShadow = '0 0 0 0 transparent';
               }}
                title={t('export.setCurrent')}
              >
                <Clock3 size={14} />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap" style={rangeTooltipStyle}>
                  {t('export.setCurrent')}
                </div>
              </button>
             {exportStartInputMode ? (
              <input
                type="text"
                value={exportStartInputValue}
                onChange={(e) => setExportStartInputValue(e.target.value)}
                onBlur={() => commitExportRangeInput('start')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitExportRangeInput('start');
                  if (e.key === 'Escape') setExportStartInputMode(false);
                }}
                className={`w-[82px] bg-transparent text-[11px] font-mono tabular-nums text-center outline-none ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
                autoFocus
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onSeek(exportRangeStart)}
                  className="rounded-full p-1.5 transition-all duration-200 hover:scale-105 relative group"
                  style={{ backgroundColor: `${secondaryThemeColor}14`, color: secondaryThemeColor, boxShadow: `0 0 0 0 transparent` }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = secondaryThemeColor;
                    e.currentTarget.style.color = '#ffffff';
                    e.currentTarget.style.boxShadow = `0 8px 18px ${secondaryThemeColor}33`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = `${secondaryThemeColor}14`;
                    e.currentTarget.style.color = secondaryThemeColor;
                    e.currentTarget.style.boxShadow = '0 0 0 0 transparent';
                  }}
                  title={t('player.seekExportStart')}
                >
                  <ArrowDown size={14} />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap" style={rangeTooltipStyle}>
                    {t('player.seekExportStart')}
                  </div>
                </button>
                <button
                   type="button"
                   onClick={() => {
                     setExportStartInputValue(formattedExportRangeStart);
                     setExportStartInputMode(true);
                   }}
                   className="inline-flex w-[82px] justify-center px-1 text-[11px] font-mono tabular-nums transition-opacity hover:opacity-80"
                   style={{ color: secondaryThemeColor }}
                   title={t('export.start')}
                 >
                   {formattedExportRangeStart}
                 </button>
              </>
             )}
          </div>
          <button 
            onClick={onReset}
            className={`p-1.5 rounded-full shrink-0 transition-colors ${isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = `${secondaryThemeColor}22`;
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.boxShadow = `0 8px 18px ${secondaryThemeColor}22`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '';
              e.currentTarget.style.boxShadow = 'none';
            }}
            title={t('player.restart')}
          >
            <RotateCcw size={16} />
          </button>
          <button 
            onClick={onPlayPause}
            className={`w-10 h-10 min-w-10 min-h-10 aspect-square shrink-0 flex items-center justify-center rounded-full transition-transform hover:scale-105 text-white shadow-lg`}
            style={{ backgroundColor: themeColor, boxShadow: `0 8px 18px ${themeColor}30` }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = secondaryThemeColor;
              e.currentTarget.style.boxShadow = `0 8px 18px ${secondaryThemeColor}30`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = themeColor;
              e.currentTarget.style.boxShadow = `0 8px 18px ${themeColor}30`;
            }}
          >
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
          </button>
          <button 
            className={`p-1.5 rounded-full shrink-0 transition-colors ${isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = `${secondaryThemeColor}22`;
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.boxShadow = `0 8px 18px ${secondaryThemeColor}22`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '';
              e.currentTarget.style.boxShadow = 'none';
            }}
            title={t('player.stop')}
            onClick={() => {
              if (isPlaying) onPlayPause();
              onReset();
            }}
          >
            <SquareSquare size={16} />
          </button>
          <div className="flex items-center gap-1.5 rounded-full px-2 py-1.5" style={{ backgroundColor: `${secondaryThemeColor}10`, border: `1px solid ${secondaryThemeColor}22`, boxShadow: `0 4px 14px ${secondaryThemeColor}10` }}>
            {exportEndInputMode ? (
              <input
                type="text"
                value={exportEndInputValue}
                onChange={(e) => setExportEndInputValue(e.target.value)}
                onBlur={() => commitExportRangeInput('end')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitExportRangeInput('end');
                  if (e.key === 'Escape') setExportEndInputMode(false);
                }}
                className={`w-[82px] bg-transparent text-[11px] font-mono tabular-nums text-center outline-none ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
                autoFocus
              />
            ) : (
              <>
                <button
                   type="button"
                   onClick={() => {
                     setExportEndInputValue(formattedExportRangeEnd);
                     setExportEndInputMode(true);
                   }}
                   className="inline-flex w-[82px] justify-center px-1 text-[11px] font-mono tabular-nums transition-opacity hover:opacity-80"
                   style={{ color: secondaryThemeColor }}
                   title={t('export.end')}
                 >
                   {formattedExportRangeEnd}
                 </button>
                <button
                  type="button"
                  onClick={() => onSeek(exportRangeEnd)}
                  className="rounded-full p-1.5 transition-all duration-200 hover:scale-105 relative group"
                  style={{ backgroundColor: `${secondaryThemeColor}14`, color: secondaryThemeColor, boxShadow: `0 0 0 0 transparent` }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = secondaryThemeColor;
                    e.currentTarget.style.color = '#ffffff';
                    e.currentTarget.style.boxShadow = `0 8px 18px ${secondaryThemeColor}33`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = `${secondaryThemeColor}14`;
                    e.currentTarget.style.color = secondaryThemeColor;
                    e.currentTarget.style.boxShadow = '0 0 0 0 transparent';
                  }}
                  title={t('player.seekExportEnd')}
                >
                  <ArrowDown size={14} />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap" style={rangeTooltipStyle}>
                    {t('player.seekExportEnd')}
                  </div>
                </button>
              </>
             )}
            <button
              type="button"
              onClick={() => onExportRangeChange({ end: liveCurrentTime })}
              className="rounded-full p-1.5 transition-all duration-200 hover:scale-105 relative group"
              style={{ backgroundColor: `${secondaryThemeColor}14`, color: secondaryThemeColor, boxShadow: `0 0 0 0 transparent` }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = secondaryThemeColor;
                 e.currentTarget.style.color = '#ffffff';
                 e.currentTarget.style.boxShadow = `0 8px 18px ${secondaryThemeColor}33`;
               }}
               onMouseLeave={(e) => {
                 e.currentTarget.style.backgroundColor = `${secondaryThemeColor}14`;
                 e.currentTarget.style.color = secondaryThemeColor;
                 e.currentTarget.style.boxShadow = '0 0 0 0 transparent';
               }}
              title={t('export.setCurrent')}
            >
              <Clock3 size={14} />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap" style={rangeTooltipStyle}>
                {t('export.setCurrent')}
              </div>
            </button>
            <button
              type="button"
              disabled={!hasEndRangeSubtitle}
              onClick={() => {
                if (rangeSubtitle) {
                  onExportRangeChange({ end: rangeSubtitle.end });
                  onSeek(rangeSubtitle.end);
                }
              }}
              className="rounded-full p-1.5 transition-all duration-200 relative group disabled:cursor-not-allowed disabled:hover:scale-100"
              style={hasEndRangeSubtitle
                ? { backgroundColor: `${secondaryThemeColor}22`, color: secondaryThemeColor, boxShadow: `0 2px 8px ${secondaryThemeColor}18` }
                : { backgroundColor: isDarkMode ? 'rgba(107, 114, 128, 0.2)' : 'rgba(156, 163, 175, 0.18)', color: isDarkMode ? '#9ca3af' : '#6b7280', boxShadow: 'none' }}
              onMouseEnter={(e) => {
                if (!hasEndRangeSubtitle) return;
                e.currentTarget.style.backgroundColor = secondaryThemeColor;
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.boxShadow = `0 6px 16px ${secondaryThemeColor}38`;
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                if (!hasEndRangeSubtitle) return;
                e.currentTarget.style.backgroundColor = `${secondaryThemeColor}22`;
                e.currentTarget.style.color = secondaryThemeColor;
                e.currentTarget.style.boxShadow = `0 2px 8px ${secondaryThemeColor}18`;
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title={t('export.useSubtitleEnd')}
            >
              <ArrowRight size={14} />
              {hasEndRangeSubtitle && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap" style={rangeTooltipStyle}>
                  {t('export.useSubtitleEnd')}
                </div>
              )}
            </button>
            <button
              type="button"
              onClick={() => onExportRangeChange({ end: defaultExportEnd })}
              className="rounded-full p-1.5 transition-all duration-200 hover:scale-105 hover:text-white relative group"
              style={{ backgroundColor: `${secondaryThemeColor}14`, color: secondaryThemeColor, boxShadow: `0 0 0 0 transparent` }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = secondaryThemeColor;
                 e.currentTarget.style.color = '#ffffff';
                 e.currentTarget.style.boxShadow = `0 8px 18px ${secondaryThemeColor}33`;
               }}
               onMouseLeave={(e) => {
                 e.currentTarget.style.backgroundColor = `${secondaryThemeColor}14`;
                 e.currentTarget.style.color = secondaryThemeColor;
                 e.currentTarget.style.boxShadow = '0 0 0 0 transparent';
              }}
              title={t('export.useLatest')}
            >
              <SkipForward size={14} />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap" style={rangeTooltipStyle}>
                {t('export.useLatest')}
              </div>
            </button>
           </div>
        </div>
        )}

        {compactMobile && (
          <div className="order-1 flex flex-col items-start gap-1 min-w-0">
            <div className="flex items-center gap-1">
              <button
                onClick={onReset}
                className={`p-1 rounded-full shrink-0 transition-colors ${isDarkMode ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                title={t('player.restart')}
              >
                <RotateCcw size={14} />
              </button>
              <button
                onClick={onPlayPause}
                className="w-8 h-8 min-w-8 min-h-8 aspect-square shrink-0 flex items-center justify-center rounded-full text-white"
                style={{ backgroundColor: themeColor, boxShadow: `0 6px 12px ${themeColor}33` }}
                title={isPlaying ? t('player.pause') : t('player.play')}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = secondaryThemeColor;
                  e.currentTarget.style.boxShadow = `0 6px 12px ${secondaryThemeColor}33`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = themeColor;
                  e.currentTarget.style.boxShadow = `0 6px 12px ${themeColor}33`;
                }}
              >
                {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
              </button>
              <button
                className={`p-1 rounded-full shrink-0 transition-colors ${isDarkMode ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                title={t('player.stop')}
                onClick={() => {
                  if (isPlaying) onPlayPause();
                  onReset();
                }}
              >
                <SquareSquare size={14} />
              </button>
            </div>
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[10px] font-mono" style={{ color: uiTheme.text }}>{formatTime(liveCurrentTime)}</span>
              <span className="text-[8px] font-mono" style={{ color: uiTheme.textMuted }}>/ {formatTime(duration)}</span>
            </div>
          </div>
        )}

        <div className={`flex items-center min-w-0 ${textClass} ${compactMobile ? 'order-2 ml-auto justify-end gap-1 flex-nowrap overflow-x-auto overflow-y-hidden whitespace-nowrap pb-0.5 [&>*]:shrink-0' : 'gap-3 flex-1 justify-end'}`}>
          <button 
            onClick={() => onLoopChange(!loop)}
            className={`p-1 rounded transition-colors ${loop ? '' : (isDarkMode ? 'hover:text-white hover:bg-gray-800' : 'hover:text-gray-900 hover:bg-gray-100')}`}
            style={loop ? { color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}18` } : undefined}
            title={t('player.loop')}
          >
            <Repeat size={14} />
          </button>

          {compactMobile ? (
            <div className="flex items-center gap-1 p-1 rounded-md shrink-0" style={{ backgroundColor: `${secondaryThemeColor}12`, border: `1px solid ${secondaryThemeColor}22` }}>
              <Settings2 size={11} />
              <select
                value={playbackRate}
                onChange={(e) => onRateChange(Number(e.target.value))}
                className="text-[10px] bg-transparent outline-none"
                style={{ color: uiTheme.text }}
              >
                {rates.map((rate) => (
                  <option key={rate} value={rate}>{rate.toFixed(1)}x</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="relative flex items-center" ref={speedMenuRef}>
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className={`flex items-center gap-1 p-1 text-[11px] font-mono font-bold rounded transition-colors ${isDarkMode ? 'hover:text-white hover:bg-gray-800' : 'hover:text-gray-900 hover:bg-gray-100'} ${showSpeedMenu ? (isDarkMode ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900') : ''}`}
              >
                <Settings2 size={12} />
                {playbackRate.toFixed(1)}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-2 flex flex-col border rounded shadow-xl overflow-hidden z-50" style={{ backgroundColor: uiTheme.panelBgElevated, borderColor: uiTheme.border }}>
                  {rates.map(r => (
                    <button
                      key={r}
                      onClick={() => {
                        onRateChange(r);
                        setShowSpeedMenu(false);
                      }}
                      className={`px-4 py-2 text-xs font-mono text-left transition-colors ${playbackRate === r ? '' : (isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100')}`}
                      style={playbackRate === r ? { color: themeColor, backgroundColor: `${secondaryThemeColor}18` } : undefined}
                    >
                      {r.toFixed(1)}x
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!compactMobile && (
          <div className="flex items-center gap-1.5 p-1 rounded-full" style={{ backgroundColor: `${secondaryThemeColor}12`, border: `1px solid ${secondaryThemeColor}22`, boxShadow: `0 2px 10px ${secondaryThemeColor}14` }}>
            <ZoomOut size={14} className="opacity-50 cursor-pointer hover:opacity-100" onClick={() => {
              const z = Math.max(minZoom, zoomLevel * 0.8);
              hasUserAdjustedZoomRef.current = true;
              if (wavesurfer.current) {
                wavesurfer.current.zoom(z);
              }
              setZoomLevel(z);
            }} />
            <input
              ref={zoomRangeRef}
              type="range" min={minZoom} max="1000"
              defaultValue={zoomLevel}
              onChange={e => {
                const z = Number(e.target.value);
                hasUserAdjustedZoomRef.current = true;
                if (wavesurfer.current) {
                  wavesurfer.current.zoom(z);
                }
                setZoomLevel(z);
              }}
              className="w-16 h-1" style={{ accentColor: secondaryThemeColor }}
            />
            <ZoomIn size={14} className="opacity-50 cursor-pointer hover:opacity-100" onClick={() => {
              const z = Math.min(1000, zoomLevel * 1.2);
              hasUserAdjustedZoomRef.current = true;
              if (wavesurfer.current) {
                wavesurfer.current.zoom(z);
              }
              setZoomLevel(z);
            }} />
          </div>
          )}

          {compactMobile && (
            <div className="flex items-center gap-1 p-1 rounded-md shrink-0" style={{ backgroundColor: `${secondaryThemeColor}12`, border: `1px solid ${secondaryThemeColor}22` }}>
              <ZoomOut size={11} className="opacity-60 cursor-pointer hover:opacity-100 shrink-0" onClick={() => {
                const z = Math.max(minZoom, zoomLevel * 0.8);
                hasUserAdjustedZoomRef.current = true;
                if (wavesurfer.current) {
                  wavesurfer.current.zoom(z);
                }
                setZoomLevel(z);
              }} />
              <div className="text-[9px] font-mono leading-none min-w-[28px] text-center" style={{ color: uiTheme.textMuted }}>
                {Math.round((zoomLevel / 50) * 10) / 10}x
              </div>
              <ZoomIn size={11} className="opacity-60 cursor-pointer hover:opacity-100 shrink-0" onClick={() => {
                const z = Math.min(1000, zoomLevel * 1.2);
                hasUserAdjustedZoomRef.current = true;
                if (wavesurfer.current) {
                  wavesurfer.current.zoom(z);
                }
                setZoomLevel(z);
              }} />
            </div>
          )}

          <div className={`${compactMobile ? 'flex items-center gap-1 p-1 rounded-md shrink-0' : 'flex items-center gap-2'}`} style={compactMobile ? { backgroundColor: `${secondaryThemeColor}12`, border: `1px solid ${secondaryThemeColor}22` } : undefined}>
            <Volume1 size={compactMobile ? 12 : 16} />
            {compactMobile ? (
              <>
                <button
                  type="button"
                  className="text-[9px] leading-none shrink-0"
                  onClick={() => setVolume((prev) => Math.max(0, Number((prev - 0.1).toFixed(2))))}
                  style={{ color: secondaryThemeColor }}
                >
                  -
                </button>
                <div className="text-[9px] font-mono leading-none min-w-[26px] text-center" style={{ color: uiTheme.textMuted }}>
                  {Math.round(volume * 100)}%
                </div>
                <button
                  type="button"
                  className="text-[9px] leading-none shrink-0"
                  onClick={() => setVolume((prev) => Math.min(1, Number((prev + 0.1).toFixed(2))))}
                  style={{ color: secondaryThemeColor }}
                >
                  +
                </button>
              </>
            ) : (
              <input
                type="range"
                min="0" max="1" step="0.01"
                value={volume}
                onChange={e => setVolume(parseFloat(e.target.value))}
                className="w-16 h-1"
                style={{ accentColor: secondaryThemeColor }}
              />
            )}
          </div>
        </div>
      </div>

    </div>
  );
});
