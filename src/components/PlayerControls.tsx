import { Play, Pause, SquareSquare, RotateCcw, Volume1, Repeat, Settings2, Clock3, SkipBack, SkipForward, ArrowRight, ArrowLeft, ArrowDown } from 'lucide-react';
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
  onEditingSubChange?: (start: number, end: number) => void;
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
  onEditingSubChange,
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
  const exportRangeDragRef = useRef<'start' | 'end' | null>(null);
  
  const [volume, setVolume] = useState(0.8);
  const [zoomLevel, setZoomLevel] = useState(50);
  const [minZoom, setMinZoom] = useState(10);
  const [isWaveformReady, setIsWaveformReady] = useState(false);
  const [displayCurrentTime, setDisplayCurrentTime] = useState(0);
  const [waveformOverlayMetrics, setWaveformOverlayMetrics] = useState({ scrollLeft: 0, wrapperWidth: 0, viewportWidth: 0 });
  const [dragPreviewRange, setDragPreviewRange] = useState<{ start: number; end: number } | null>(null);

  const zoomRangeRef = useRef<HTMLInputElement>(null);

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
    if (!waveformRef.current) return;
    if (!audioRef?.current) return;

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
      media: audioRef.current,
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

    if (audioPath) {
      // With media element passed, load just fetches peaks without creating another audio element
      wavesurfer.current.load(audioPath);
    }

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
    if (!isWaveformReady) {
      setWaveformOverlayMetrics({ scrollLeft: 0, wrapperWidth: 0, viewportWidth: 0 });
      return;
    }

    const updateOverlayMetrics = () => {
      const { scrollElement, wrapperElement } = getWaveformOverlayElements();
      setWaveformOverlayMetrics({
        scrollLeft: scrollElement?.scrollLeft ?? 0,
        wrapperWidth: wrapperElement?.clientWidth ?? 0,
        viewportWidth: scrollElement?.clientWidth ?? waveformRef.current?.clientWidth ?? 0,
      });
    };

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
      const dragTarget = exportRangeDragRef.current;
      if (!dragTarget || !waveformOverlayMetrics.wrapperWidth) {
        return;
      }

      const waveformDuration = Math.max(duration || 0, defaultExportEnd || 0, exportRangeEnd || 0);
      const { scrollElement } = getWaveformOverlayElements();
      const viewportRect = waveformRef.current?.getBoundingClientRect();
      if (!viewportRect || waveformDuration <= 0) {
        return;
      }

      const scrollLeft = scrollElement?.scrollLeft ?? waveformOverlayMetrics.scrollLeft;
      const relativeX = event.clientX - viewportRect.left + scrollLeft;
      const clampedX = Math.max(0, Math.min(relativeX, waveformOverlayMetrics.wrapperWidth));
      const nextTime = Number(((clampedX / waveformOverlayMetrics.wrapperWidth) * waveformDuration).toFixed(2));

      if (dragTarget === 'start') {
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
  }, [defaultExportEnd, dragPreviewRange, duration, exportRangeEnd, exportRangeStart, getWaveformOverlayElements, onExportRangeChange, waveformOverlayMetrics]);

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

  const textClass = isDarkMode ? "text-gray-400" : "text-gray-600";
  const showWaveformContainer = Boolean(audioPath && isWaveformReady);
  const liveCurrentTime = audioRef.current?.currentTime ?? displayCurrentTime;
  const displayedExportRangeStart = dragPreviewRange?.start ?? exportRangeStart;
  const displayedExportRangeEnd = dragPreviewRange?.end ?? exportRangeEnd;
  const formattedExportRangeStart = formatTime(displayedExportRangeStart);
  const formattedExportRangeEnd = formatTime(displayedExportRangeEnd);
  const waveformDuration = Math.max(duration || 0, defaultExportEnd || 0, displayedExportRangeEnd || 0);
  const clampedExportStart = waveformDuration > 0 ? Math.max(0, Math.min(displayedExportRangeStart, waveformDuration)) : 0;
  const clampedExportEnd = waveformDuration > 0 ? Math.max(clampedExportStart, Math.min(displayedExportRangeEnd, waveformDuration)) : 0;
  const exportBarStartPercent = waveformDuration > 0 ? (clampedExportStart / waveformDuration) * 100 : 0;
  const exportBarWidthPercent = waveformDuration > 0 ? ((clampedExportEnd - clampedExportStart) / waveformDuration) * 100 : 0;
  const hasStartRangeSubtitle = Boolean(rangeSubtitle && rangeSubtitle.start >= 0);
  const hasEndRangeSubtitle = Boolean(rangeSubtitle && rangeSubtitle.end >= 0);
  const rangeTooltipStyle = {
    backgroundColor: isDarkMode ? 'rgba(17, 24, 39, 0.78)' : 'rgba(255, 255, 255, 0.78)',
    color: uiTheme.text,
    border: `1px solid ${rgba(secondaryThemeColor, 0.3)}`,
    backdropFilter: 'blur(14px) saturate(140%)',
    WebkitBackdropFilter: 'blur(14px) saturate(140%)'
  };
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
          {showWaveformContainer && waveformOverlayMetrics.wrapperWidth > 0 && waveformDuration > 0 && (
            <div className="relative w-full overflow-hidden mb-2" style={{ height: `${Math.max(exportHandleSize + 2, 14)}px` }}>
              <div
                className="absolute top-1/2 left-0"
                style={{
                  width: `${waveformOverlayMetrics.wrapperWidth}px`,
                  height: `${exportBarHeight}px`,
                  transform: `translate(${-waveformOverlayMetrics.scrollLeft}px, -50%)`,
                  backgroundColor: exportBarBaseColor,
                  borderRadius: 9999,
                  boxShadow: `inset 0 0 0 1px ${rgba(themeColor, isDarkMode ? 0.2 : 0.12)}`,
                }}
              >
                <div
                  className="absolute top-0 h-full rounded-full"
                  style={{
                    left: `${exportBarStartPercent}%`,
                    width: `${exportBarWidthPercent}%`,
                    minWidth: exportBarWidthPercent > 0 ? `${exportHandleSize}px` : 0,
                    backgroundColor: exportBarFillColor,
                    boxShadow: `0 0 0 1px ${rgba(secondaryThemeColor, isDarkMode ? 0.3 : 0.18)}, 0 3px 12px ${rgba(secondaryThemeColor, isDarkMode ? 0.26 : 0.18)}`,
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
                      exportRangeDragRef.current = 'start';
                      document.body.style.userSelect = 'none';
                      document.body.style.cursor = 'ew-resize';
                    }}
                    aria-label={t('export.rangeStart')}
                  />
                  <button
                    type="button"
                    className="absolute top-1/2 translate-x-1/2 -translate-y-1/2 rounded-full border pointer-events-auto transition-all duration-150 hover:scale-110"
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
                      exportRangeDragRef.current = 'end';
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
            <div
              className="w-full cursor-pointer"
              ref={waveformRef}
              title={t('player.waveformTitle')}
              style={{ visibility: isWaveformReady ? 'visible' : 'hidden' }}
            />
          </div>
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
              setZoomLevel(z);
            }} />
          </div>
          )}

          {compactMobile && (
            <div className="flex items-center gap-1 p-1 rounded-md shrink-0" style={{ backgroundColor: `${secondaryThemeColor}12`, border: `1px solid ${secondaryThemeColor}22` }}>
              <ZoomOut size={11} className="opacity-60 cursor-pointer hover:opacity-100 shrink-0" onClick={() => {
                const z = Math.max(minZoom, zoomLevel * 0.8);
                hasUserAdjustedZoomRef.current = true;
                setZoomLevel(z);
              }} />
              <div className="text-[9px] font-mono leading-none min-w-[28px] text-center" style={{ color: uiTheme.textMuted }}>
                {Math.round((zoomLevel / 50) * 10) / 10}x
              </div>
              <ZoomIn size={11} className="opacity-60 cursor-pointer hover:opacity-100 shrink-0" onClick={() => {
                const z = Math.min(1000, zoomLevel * 1.2);
                hasUserAdjustedZoomRef.current = true;
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
