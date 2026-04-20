import { FileText, Clock, MousePointer2, Check, Trash2, Search, ChevronUp, ChevronDown, X, List, CheckSquare, Square, Eye, EyeOff } from 'lucide-react';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { SubtitleItem } from '../hooks/useAssSubtitle';
import { translate, type Language } from '../i18n';
import { createThemeTokens, rgba } from '../theme';
import { Tooltip } from './ui/Tooltip';

interface SubtitlePanelProps {
  subtitles: SubtitleItem[];
  speakers: Record<string, { name?: string; type?: string }>;
  currentTime: number;
  isDarkMode: boolean;
  language: Language;
  themeColor: string;
  secondaryThemeColor: string;
  onSeek: (time: number) => void;
  onUpdateSubtitle: (id: string, updates: Partial<SubtitleItem>) => void;
  onDeleteSubtitle: (id: string) => void | Promise<void>;
  onBulkDeleteSubtitles: (ids: string[]) => void | Promise<void>;
  onBulkUpdateSpeaker: (ids: string[], speakerId: string) => void | Promise<void>;
  onBulkUpdateVisibility: (ids: string[], visible: boolean) => void | Promise<void>;
  editingSub?: { id: string, start: number, end: number, text: string } | null;
  setEditingSub?: (sub: { id: string, start: number, end: number, text: string } | null) => void;
  compactMode: boolean;
  onCompactModeChange: (next: boolean) => void;
}

export function SubtitlePanel({ subtitles, speakers, currentTime, isDarkMode, language, themeColor, secondaryThemeColor, onSeek, onUpdateSubtitle, onDeleteSubtitle, onBulkDeleteSubtitles, onBulkUpdateSpeaker, onBulkUpdateVisibility, editingSub, setEditingSub, compactMode, onCompactModeChange }: SubtitlePanelProps) {
  const t = (key: string, vars?: Record<string, string | number>) => translate(language, key, vars);
  const uiTheme = createThemeTokens(themeColor, isDarkMode);
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ start: string; end: string; text: string; speakerId: string; visible: boolean }>({ start: '', end: '', text: '', speakerId: '', visible: true });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedSubtitleIds, setSelectedSubtitleIds] = useState<string[]>([]);
  const [lastSelectedSubtitleId, setLastSelectedSubtitleId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const compactListRef = useRef<HTMLDivElement>(null);
  const [compactScrollTop, setCompactScrollTop] = useState(0);
  const [compactViewportHeight, setCompactViewportHeight] = useState(0);
  const COMPACT_ROW_HEIGHT = 34;
  const searchMatches = subtitles.filter((sub) => sub.text.toLowerCase().includes(searchQuery.trim().toLowerCase()));
  const currentSearchMatchId = searchQuery.trim() && searchMatches.length > 0 ? searchMatches[searchIndex % searchMatches.length]?.id : undefined;
  const selectableSpeakers = useMemo(() => Object.entries(speakers).filter(([, speaker]) => speaker?.type !== 'annotation'), [speakers]);
  const subtitleSpeakerOptions = useMemo(() => {
    const presentSpeakerIds = new Set(subtitles.map((sub) => sub.speakerId));
    return selectableSpeakers.filter(([speakerId]) => presentSpeakerIds.has(speakerId));
  }, [selectableSpeakers, subtitles]);
  const selectableSpeakerIds = useMemo(() => selectableSpeakers.map(([speakerId]) => speakerId), [selectableSpeakers]);
  const subtitleSpeakerIds = useMemo(() => subtitleSpeakerOptions.map(([speakerId]) => speakerId), [subtitleSpeakerOptions]);
  const [selectionSpeakerId, setSelectionSpeakerId] = useState('');
  const [bulkSpeakerId, setBulkSpeakerId] = useState('');
  const [showSelectionSpeakerPicker, setShowSelectionSpeakerPicker] = useState(false);
  const [showBulkSpeakerPicker, setShowBulkSpeakerPicker] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState<null | { type: 'delete' } | { type: 'speaker'; speakerId: string } | { type: 'visibility'; visible: boolean }>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const validSelectedSubtitleIds = useMemo(() => {
    const validIdSet = new Set(subtitles.map((sub) => sub.id));
    return selectedSubtitleIds.filter((id) => validIdSet.has(id));
  }, [selectedSubtitleIds, subtitles]);
  const selectedSubtitleIdSet = useMemo(() => new Set(validSelectedSubtitleIds), [validSelectedSubtitleIds]);
  const subtitleIndexMap = useMemo(
    () => new Map(subtitles.map((subtitle, index) => [subtitle.id, index + 1])),
    [subtitles]
  );
  const selectedSubtitles = useMemo(
    () => subtitles.filter((sub) => selectedSubtitleIdSet.has(sub.id)),
    [selectedSubtitleIdSet, subtitles]
  );
  const pendingSpeakerName = pendingBulkAction?.type === 'speaker'
    ? (speakers[pendingBulkAction.speakerId]?.name || pendingBulkAction.speakerId)
    : '';
  const handleSelectAll = useCallback(() => {
    setSelectedSubtitleIds(subtitles.map((sub) => sub.id));
    setLastSelectedSubtitleId(subtitles[subtitles.length - 1]?.id ?? null);
  }, [subtitles]);
  const effectiveBulkSpeakerId = bulkSpeakerId && selectableSpeakerIds.includes(bulkSpeakerId)
    ? bulkSpeakerId
    : (selectableSpeakerIds[0] ?? '');
  const effectiveSelectionSpeakerId = selectionSpeakerId && subtitleSpeakerIds.includes(selectionSpeakerId)
    ? selectionSpeakerId
    : (subtitleSpeakerIds[0] ?? '');
  const resetMultiSelectState = useCallback(() => {
    setSelectedSubtitleIds([]);
    setLastSelectedSubtitleId(null);
    setPendingBulkAction(null);
    setShowSelectionSpeakerPicker(false);
    setShowBulkSpeakerPicker(false);
  }, []);

  useEffect(() => {
    if (!multiSelectMode) return;
    const handleMultiSelectShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        const target = event.target as HTMLElement | null;
        const tagName = target?.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target?.isContentEditable) {
          return;
        }
        event.preventDefault();
        handleSelectAll();
      }
    };
    window.addEventListener('keydown', handleMultiSelectShortcut);
    return () => window.removeEventListener('keydown', handleMultiSelectShortcut);
  }, [handleSelectAll, multiSelectMode]);

  const scrollToSubtitle = (subtitleId: string) => {
    const subtitleIndex = subtitles.findIndex((sub) => sub.id === subtitleId);
    if (compactMode) {
      const container = compactListRef.current;
      if (container && subtitleIndex >= 0) {
        const targetScrollTop = subtitleIndex * COMPACT_ROW_HEIGHT - (container.clientHeight / 2) + (COMPACT_ROW_HEIGHT / 2);
        container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
      }
      return;
    }

    const el = document.getElementById(`sub-${subtitleId}`);
    const container = scrollContainerRef.current;
    if (el && container) {
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const relativeTop = elRect.top - containerRect.top;
      const targetScrollTop = container.scrollTop + relativeTop - (containerRect.height / 2) + (elRect.height / 2);
      container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
    }
  };
  
  // Find current or most recently active subtitle
  let activeSubId: string | undefined;
  for (let i = subtitles.length - 1; i >= 0; i--) {
    if (currentTime >= subtitles[i].start) {
      activeSubId = subtitles[i].id;
      break;
    }
  }

  useEffect(() => {
    if (activeSubId && !inlineEditingId) {
      scrollToSubtitle(activeSubId);
    }
  }, [activeSubId, inlineEditingId]);

  useEffect(() => {
    if (!activeSubId || inlineEditingId) {
      return;
    }

    const timer = window.setTimeout(() => {
      scrollToSubtitle(activeSubId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [compactMode, activeSubId, inlineEditingId]);

  useEffect(() => {
    if (!compactMode || !compactListRef.current) {
      return;
    }

    const el = compactListRef.current;
    const updateHeight = () => {
      setCompactViewportHeight(el.clientHeight);
    };

    updateHeight();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [compactMode]);

  const compactVisibleStart = Math.max(0, Math.floor(compactScrollTop / COMPACT_ROW_HEIGHT) - 8);
  const compactVisibleCount = Math.ceil((compactViewportHeight || 360) / COMPACT_ROW_HEIGHT) + 16;
  const compactVisibleEnd = Math.min(subtitles.length, compactVisibleStart + compactVisibleCount);
  const compactVisibleRows = subtitles.slice(compactVisibleStart, compactVisibleEnd);
  const compactTotalHeight = subtitles.length * COMPACT_ROW_HEIGHT;

  const jumpToSearchMatch = (direction: 1 | -1) => {
    if (searchMatches.length === 0) return;
    const nextIndex = direction === 1
      ? (searchIndex + 1) % searchMatches.length
      : (searchIndex - 1 + searchMatches.length) % searchMatches.length;
    setSearchIndex(nextIndex);
    const match = searchMatches[nextIndex];
    if (match) {
      scrollToSubtitle(match.id);
      onSeek(match.start);
    }
  };

  const hoverClass = isDarkMode ? "hover:bg-gray-800" : "hover:bg-gray-100";

  const toggleSelectedSubtitle = (subtitleId: string, extendRange = false) => {
    setSelectedSubtitleIds((prev) => {
      if (extendRange && lastSelectedSubtitleId) {
        const currentIndex = subtitles.findIndex((sub) => sub.id === subtitleId);
        const anchorIndex = subtitles.findIndex((sub) => sub.id === lastSelectedSubtitleId);
        if (currentIndex >= 0 && anchorIndex >= 0) {
          const start = Math.min(currentIndex, anchorIndex);
          const end = Math.max(currentIndex, anchorIndex);
          const rangeIds = subtitles.slice(start, end + 1).map((sub) => sub.id);
          return Array.from(new Set([...prev, ...rangeIds]));
        }
      }

      return prev.includes(subtitleId) ? prev.filter((id) => id !== subtitleId) : [...prev, subtitleId];
    });
    setLastSelectedSubtitleId(subtitleId);
  };

  const handleSelectSpeaker = () => {
    if (!effectiveSelectionSpeakerId) return;
    const matchingIds = subtitles.filter((sub) => sub.speakerId === effectiveSelectionSpeakerId).map((sub) => sub.id);
    setSelectedSubtitleIds(matchingIds);
    setLastSelectedSubtitleId(matchingIds[matchingIds.length - 1] ?? null);
    setShowSelectionSpeakerPicker(false);
  };

  const handleClearSelection = () => {
    setSelectedSubtitleIds([]);
    setLastSelectedSubtitleId(null);
  };

  const handleApplyBulkSpeaker = () => {
    if (validSelectedSubtitleIds.length === 0 || !effectiveBulkSpeakerId) return;
    setPendingBulkAction({ type: 'speaker', speakerId: effectiveBulkSpeakerId });
    setShowBulkSpeakerPicker(false);
  };

  const handleBulkVisibility = (visible: boolean) => {
    if (validSelectedSubtitleIds.length === 0) return;
    setPendingBulkAction({ type: 'visibility', visible });
  };

  const handleBulkDelete = () => {
    if (validSelectedSubtitleIds.length === 0) return;
    setPendingBulkAction({ type: 'delete' });
  };

  const confirmBulkAction = () => {
    if (!pendingBulkAction || validSelectedSubtitleIds.length === 0) return;
    if (pendingBulkAction.type === 'delete') {
      void onBulkDeleteSubtitles(validSelectedSubtitleIds);
    } else if (pendingBulkAction.type === 'speaker') {
      void onBulkUpdateSpeaker(validSelectedSubtitleIds, pendingBulkAction.speakerId);
    } else {
      void onBulkUpdateVisibility(validSelectedSubtitleIds, pendingBulkAction.visible);
    }
    resetMultiSelectState();
  };

  const cancelBulkAction = () => {
    setPendingBulkAction(null);
  };

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00.00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  };

  const startInlineEdit = (sub: SubtitleItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setInlineEditingId(sub.id);
    setEditForm({ start: sub.start.toFixed(2), end: sub.end.toFixed(2), text: sub.text, speakerId: sub.speakerId, visible: sub.visible !== false });
  };

  const toggleSubtitleVisibility = (sub: SubtitleItem, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onUpdateSubtitle(sub.id, { visible: sub.visible === false });
  };

  const toggleRegionEdit = (sub: SubtitleItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (editingSub?.id === sub.id) {
      if (setEditingSub) setEditingSub(null); // toggle off
    } else {
      if (setEditingSub) setEditingSub({ id: sub.id, start: sub.start, end: sub.end, text: sub.text });
    }
  };

  // const cancelInlineEdit = (e: React.MouseEvent) => {
  //   e.preventDefault();
  //   e.stopPropagation();
  //   setInlineEditingId(null);
  // };

  // const saveInlineEdit = (e: React.MouseEvent, id: string) => {
  //   e.preventDefault();
  //   e.stopPropagation();
  //   
  //   if (inlineEditValue.trim()) {
  //     onUpdateSubtitle(id, { text: inlineEditValue });
  //   }
  //   setInlineEditingId(null);
  // };

  const saveInlineEdit = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const newStart = parseFloat(editForm.start);
    const newEnd = parseFloat(editForm.end);
    
    if (isNaN(newStart) || isNaN(newEnd)) {
      return;
    }

    onUpdateSubtitle(id, {
      start: newStart,
      end: newEnd,
      duration: Number((newEnd - newStart).toFixed(2)),
      text: editForm.text,
      speakerId: editForm.speakerId,
      visible: editForm.visible,
    });
    
    setInlineEditingId(null);
  };

  const insertImageMarkdownIntoEditForm = (markdown: string, textarea: HTMLTextAreaElement | null) => {
    const selectionStart = textarea?.selectionStart ?? editForm.text.length;
    const selectionEnd = textarea?.selectionEnd ?? editForm.text.length;
    const nextText = `${editForm.text.slice(0, selectionStart)}${markdown}${editForm.text.slice(selectionEnd)}`;
    setEditForm((prev) => ({ ...prev, text: nextText }));

    window.requestAnimationFrame(() => {
      const target = editTextareaRef.current;
      if (!target) {
        return;
      }
      const caret = selectionStart + markdown.length;
      target.focus();
      target.setSelectionRange(caret, caret);
    });
  };

  const handleInlineEditorPaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardItems = Array.from(event.clipboardData?.items || []);
    const imageItem = clipboardItems.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
    if (!imageItem) {
      return;
    }

    const file = imageItem.getAsFile();
    if (!file) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    try {
      let imagePath = '';

      if (window.electron) {
        imagePath = window.electron.getDroppedFilePath(file) || '';
      }

      if (!imagePath) {
        if (window.electron) {
          const arrayBuffer = await file.arrayBuffer();
          imagePath = await window.electron.saveClipboardImageToCache({
            bytes: Array.from(new Uint8Array(arrayBuffer)),
            contentType: file.type,
            preferredName: file.name,
          }) || '';
        } else {
          imagePath = URL.createObjectURL(file);
        }
      }

      if (!imagePath) {
        return;
      }

      insertImageMarkdownIntoEditForm(`![img](${imagePath})`, event.currentTarget);
    } catch (error) {
      console.error('Failed to paste clipboard image:', error);
    }
  };

  // Global shortcuts for Region Edit
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && editingSub && !inlineEditingId) {
        e.preventDefault();
        if (setEditingSub) setEditingSub(null);
      }

      if (e.key === 'Escape' && editingSub && !inlineEditingId) {
        e.preventDefault();
        if (setEditingSub) setEditingSub(null);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [editingSub, inlineEditingId, setEditingSub]);

  return (
    <div className="h-full flex flex-col overflow-hidden relative" style={{ backgroundColor: uiTheme.panelBg, borderColor: uiTheme.border, color: uiTheme.textMuted }}>
      <div className="p-4 border-b flex items-center justify-between shrink-0" style={{ backgroundColor: uiTheme.panelBgElevated, borderColor: uiTheme.border, color: uiTheme.text }}>
        <h2 className="font-bold flex items-center gap-2 text-sm">
          <FileText size={16} />
          <span className="inline-flex items-center gap-1">
            {t('subtitle.title')}
            <Tooltip content={t('subtitle.titleTip')} placement="bottom" width={288} backgroundColor={isDarkMode ? 'rgba(17, 24, 39, 0.78)' : 'rgba(255, 255, 255, 0.78)'} borderColor={`${secondaryThemeColor}33`} textColor={uiTheme.text}>
              <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border text-[10px] font-semibold" style={{ borderColor: `${secondaryThemeColor}66`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}14` }}>?</span>
            </Tooltip>
          </span>
          <button type="button" onClick={() => setSearchOpen((v) => !v)} title={t('subtitle.search')}>
            <Search size={14} style={{ color: secondaryThemeColor }} />
          </button>
          <button
            type="button"
            onClick={() => onCompactModeChange(!compactMode)}
            title={compactMode ? t('subtitle.detailedMode') : t('subtitle.compactMode')}
          >
            <List size={14} style={{ color: compactMode ? themeColor : secondaryThemeColor }} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (multiSelectMode) {
                resetMultiSelectState();
                setMultiSelectMode(false);
                return;
              }
              setMultiSelectMode(true);
            }}
            title={multiSelectMode ? t('subtitle.multiSelectClose') : t('subtitle.multiSelectOpen')}
          >
            <CheckSquare size={14} style={{ color: multiSelectMode ? themeColor : secondaryThemeColor }} />
          </button>
        </h2>
        <div className="text-xs opacity-60">{t('subtitle.count', { count: subtitles.length })}</div>
      </div>
      {(searchOpen || multiSelectMode) && <div className="px-3 py-2 border-b flex flex-col gap-2 shrink-0" style={{ backgroundColor: uiTheme.panelBgSubtle, borderColor: uiTheme.border }}>
        {searchOpen && <div className="flex items-center gap-2">
        <input
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSearchIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              jumpToSearchMatch(e.shiftKey ? -1 : 1);
            }
          }}
          placeholder={t('subtitle.searchPlaceholder')}
          className="flex-1 px-2 py-1 rounded text-xs border focus:outline-none"
          style={{ backgroundColor: uiTheme.inputBg, color: uiTheme.text, borderColor: `${secondaryThemeColor}44` }}
        />
        <button
          type="button"
          disabled={searchMatches.length === 0}
          onClick={() => jumpToSearchMatch(-1)}
          className="p-1 rounded border disabled:opacity-40"
          style={{ borderColor: `${secondaryThemeColor}33`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}12` }}
          title={t('subtitle.searchPrev')}
        >
          <ChevronUp size={14} />
        </button>
        <button
          type="button"
          disabled={searchMatches.length === 0}
          onClick={() => jumpToSearchMatch(1)}
          className="p-1 rounded border disabled:opacity-40"
          style={{ borderColor: `${secondaryThemeColor}33`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}12` }}
          title={t('subtitle.searchNext')}
        >
          <ChevronDown size={14} />
        </button>
        <div className="text-[10px] font-mono min-w-[3rem] text-right" style={{ color: secondaryThemeColor }}>
          {searchMatches.length > 0 ? t('subtitle.searchCount', { current: searchIndex + 1, total: searchMatches.length }) : '0/0'}
        </div>
        </div>}
        {multiSelectMode && <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleSelectAll}
            className="px-2 py-1 rounded border text-[10px]"
            style={{ borderColor: `${secondaryThemeColor}33`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}12` }}
          >
            {t('common.selectAll')}
          </button>
          <button
            type="button"
            onClick={handleClearSelection}
            className="px-2 py-1 rounded border text-[10px]"
            style={{ borderColor: `${secondaryThemeColor}33`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}12` }}
          >
            {t('common.selectNone')}
          </button>
          <div className="text-[10px] font-mono min-w-[3.5rem]" style={{ color: secondaryThemeColor }}>
            {t('subtitle.multiSelectCount', { count: validSelectedSubtitleIds.length })}
          </div>
          <button
            type="button"
            disabled={validSelectedSubtitleIds.length === 0}
            onClick={handleBulkDelete}
            className="px-2 py-1 rounded border text-[10px] disabled:opacity-40"
            style={{ borderColor: `${secondaryThemeColor}33`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}12` }}
          >
            {t('subtitle.bulkDelete')}
          </button>
          <button
            type="button"
            disabled={validSelectedSubtitleIds.length === 0}
            onClick={() => handleBulkVisibility(true)}
            className="px-2 py-1 rounded border text-[10px] disabled:opacity-40"
            style={{ borderColor: `${secondaryThemeColor}33`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}12` }}
          >
            {t('subtitle.bulkShow')}
          </button>
          <button
            type="button"
            disabled={validSelectedSubtitleIds.length === 0}
            onClick={() => handleBulkVisibility(false)}
            className="px-2 py-1 rounded border text-[10px] disabled:opacity-40"
            style={{ borderColor: `${secondaryThemeColor}33`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}12` }}
          >
            {t('subtitle.bulkHide')}
          </button>
          <button
            type="button"
            disabled={subtitleSpeakerOptions.length === 0}
            onClick={() => {
              setShowSelectionSpeakerPicker((prev) => !prev);
              setShowBulkSpeakerPicker(false);
            }}
            className="px-2 py-1 rounded border text-[10px] disabled:opacity-40"
            style={{ borderColor: `${secondaryThemeColor}33`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}12` }}
          >
            {t('subtitle.selectSpeaker')}
          </button>
          <button
            type="button"
            disabled={validSelectedSubtitleIds.length === 0 || selectableSpeakers.length === 0}
            onClick={() => {
              setShowBulkSpeakerPicker((prev) => !prev);
              setShowSelectionSpeakerPicker(false);
            }}
            className="px-2 py-1 rounded border text-[10px] disabled:opacity-40"
            style={{ borderColor: `${secondaryThemeColor}33`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}12` }}
          >
            {t('subtitle.bulkChangeSpeaker')}
          </button>
          {showSelectionSpeakerPicker ? (
            <>
              <select
                value={effectiveSelectionSpeakerId}
                onChange={(e) => setSelectionSpeakerId(e.target.value)}
                className="px-2 py-1 rounded border text-[10px] focus:outline-none"
                style={{ backgroundColor: uiTheme.inputBg, borderColor: `${secondaryThemeColor}44`, color: uiTheme.text }}
              >
                {subtitleSpeakerOptions.map(([speakerId, speaker]) => (
                  <option key={speakerId} value={speakerId}>{speaker.name || speakerId}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!effectiveSelectionSpeakerId}
                onClick={handleSelectSpeaker}
                className="px-2 py-1 rounded border text-[10px] disabled:opacity-40"
                style={{ borderColor: `${secondaryThemeColor}33`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}12` }}
              >
                {t('common.confirm')}
              </button>
            </>
          ) : null}
          {showBulkSpeakerPicker ? (
            <>
              <select
                value={effectiveBulkSpeakerId}
                onChange={(e) => setBulkSpeakerId(e.target.value)}
                className="px-2 py-1 rounded border text-[10px] focus:outline-none"
                style={{ backgroundColor: uiTheme.inputBg, borderColor: `${secondaryThemeColor}44`, color: uiTheme.text }}
              >
                {selectableSpeakers.map(([speakerId, speaker]) => (
                  <option key={speakerId} value={speakerId}>{speaker.name || speakerId}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={validSelectedSubtitleIds.length === 0 || !effectiveBulkSpeakerId}
                onClick={handleApplyBulkSpeaker}
                className="px-2 py-1 rounded border text-[10px] disabled:opacity-40"
                style={{ borderColor: `${secondaryThemeColor}33`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}12` }}
              >
                {t('common.confirm')}
              </button>
            </>
          ) : null}
        </div>}
      </div>}
      
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-2">
        {compactMode ? (
          <div
            ref={compactListRef}
            className="h-full overflow-y-auto custom-scrollbar rounded-md border"
            style={{ borderColor: `${secondaryThemeColor}33`, backgroundColor: uiTheme.cardBg }}
            onScroll={(e) => setCompactScrollTop(e.currentTarget.scrollTop)}
          >
            {subtitles.length === 0 ? (
              <div className="p-8 text-center text-xs opacity-50">{t('subtitle.empty')}</div>
            ) : (
              <div style={{ height: `${compactTotalHeight}px`, position: 'relative' }}>
                <div style={{ transform: `translateY(${compactVisibleStart * COMPACT_ROW_HEIGHT}px)` }}>
                  {compactVisibleRows.map((sub) => {
                    const isActive = currentTime >= sub.start && currentTime <= sub.end;
                    const isSearchMatched = currentSearchMatchId === sub.id;
                    const subtitleIndex = subtitleIndexMap.get(sub.id) ?? 0;
                    return (
                      <button
                        key={`compact-${sub.id}`}
                        type="button"
                        onClick={(event) => multiSelectMode ? toggleSelectedSubtitle(sub.id, event.shiftKey) : onSeek(sub.start)}
                        className="w-full text-left px-2 py-1 text-xs border-b transition-colors flex items-center gap-2"
                        style={{
                          height: `${COMPACT_ROW_HEIGHT}px`,
                          borderColor: `${secondaryThemeColor}22`,
                          backgroundColor: isActive
                            ? `${secondaryThemeColor}${isDarkMode ? '20' : '12'}`
                            : isSearchMatched
                              ? `${secondaryThemeColor}${isDarkMode ? '16' : '0E'}`
                              : selectedSubtitleIdSet.has(sub.id)
                                ? `${secondaryThemeColor}${isDarkMode ? '20' : '12'}`
                                : 'transparent',
                          color: uiTheme.text
                        }}
                      >
                        <button
                          type="button"
                          onClick={(event) => toggleSubtitleVisibility(sub, event)}
                          className="shrink-0"
                          title={sub.visible === false ? t('subtitle.showOne') : t('subtitle.hideOne')}
                          style={{ color: sub.visible === false ? uiTheme.textMuted : secondaryThemeColor }}
                        >
                          {sub.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <span className="shrink-0 font-mono text-[10px] opacity-65">
                          {subtitleIndex}
                        </span>
                        {multiSelectMode ? (
                          <span className="shrink-0" style={{ color: selectedSubtitleIdSet.has(sub.id) ? secondaryThemeColor : uiTheme.textMuted }}>
                            {selectedSubtitleIdSet.has(sub.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                          </span>
                        ) : null}
                        <span className="font-mono opacity-70 shrink-0">{formatTime(sub.start)}</span>
                        <span className="px-1 rounded shrink-0" style={{ color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}14` }}>
                          {speakers[sub.speakerId]?.name || sub.actor || sub.style}
                        </span>
                        <span className="truncate opacity-90">{sub.text}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : subtitles.length === 0 ? (
          <div className="p-8 text-center text-xs opacity-50">{t('subtitle.empty')}</div>
        ) : (
          subtitles.map((sub) => {
            const isActive = currentTime >= sub.start && currentTime <= sub.end;
            const isInlineEditing = inlineEditingId === sub.id;
            const isRegionEditing = editingSub?.id === sub.id;
            const subtitleIndex = subtitleIndexMap.get(sub.id) ?? 0;

            return (
              <div 
                key={sub.id}
                id={`sub-${sub.id}`}
                onClick={(e) => {
                  if (isInlineEditing) return;
                  if (multiSelectMode) {
                    toggleSelectedSubtitle(sub.id, e.shiftKey);
                    return;
                  }
                  onSeek(sub.start);
                }}
                onDoubleClick={(e) => {
                  if (!isInlineEditing && !multiSelectMode) startInlineEdit(sub, e);
                }}
                className={`p-3 rounded-lg border text-xs transition-all duration-200 relative group
                  ${isInlineEditing ? (isDarkMode ? 'bg-gray-800' : 'bg-gray-50') : 
                   isRegionEditing ? (isDarkMode ? 'bg-gray-800 border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.2)]' : 'bg-green-50 border-green-400 shadow-sm') :
                    (isActive ? `cursor-pointer` : `${hoverClass} cursor-pointer`)}
                `}
                style={isInlineEditing ? { borderColor: `${themeColor}88`, backgroundColor: `${themeColor}${isDarkMode ? '18' : '10'}` } : currentSearchMatchId === sub.id ? { borderColor: `${secondaryThemeColor}88`, backgroundColor: `${secondaryThemeColor}${isDarkMode ? '18' : '10'}`, boxShadow: `0 6px 18px ${secondaryThemeColor}18`, opacity: sub.visible === false ? 0.62 : 1 } : isActive ? { borderColor: `${themeColor}88`, backgroundColor: `${themeColor}${isDarkMode ? '22' : '14'}`, boxShadow: `0 6px 18px ${secondaryThemeColor}18`, opacity: sub.visible === false ? 0.62 : 1 } : { backgroundColor: uiTheme.cardBg, borderColor: uiTheme.border, opacity: sub.visible === false ? 0.62 : 1 }}
              >
                {!isInlineEditing && (
                  <>
                    <div className="flex justify-between items-center mb-2 opacity-70 relative gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {multiSelectMode ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleSelectedSubtitle(sub.id, e.shiftKey);
                            }}
                            className="shrink-0"
                            title={t('subtitle.multiSelectToggle')}
                            style={{ color: selectedSubtitleIdSet.has(sub.id) ? secondaryThemeColor : uiTheme.textMuted }}
                          >
                            {selectedSubtitleIdSet.has(sub.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                          </button>
                        ) : null}
                        <div className="flex items-center gap-1 font-mono text-[10px] shrink-0">
                        <Clock size={10} />
                        <span>{formatTime(sub.start)} - {formatTime(sub.end)}</span>
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[10px] shrink-0" style={{ backgroundColor: `${secondaryThemeColor}14`, color: secondaryThemeColor }}>
                          {sub.duration}s
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {multiSelectMode ? null : (
                        <button 
                          onClick={(e) => toggleRegionEdit(sub, e)}
                          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          className={`z-20 px-1.5 py-0.5 rounded text-[9px] flex items-center gap-1 transition-all cursor-pointer border
                            ${isRegionEditing 
                              ? `opacity-100 text-white shadow-md`
                              : `opacity-0 group-hover:opacity-100 shadow-sm`
                             }
                           `}
                          style={isRegionEditing ? { backgroundColor: secondaryThemeColor, borderColor: `${secondaryThemeColor}55`, boxShadow: `0 4px 12px ${secondaryThemeColor}24` } : { backgroundColor: `${secondaryThemeColor}12`, color: secondaryThemeColor, borderColor: `${secondaryThemeColor}33` }}
                          title={isRegionEditing ? t('subtitle.adjustDoneTitle') : t('subtitle.adjustTitle')}
                        >
                          {isRegionEditing ? <Check size={10} /> : <MousePointer2 size={10} />}
                          {isRegionEditing ? t('subtitle.adjustDone') : t('subtitle.adjust')}
                        </button>
                        )}

                        {!multiSelectMode && isRegionEditing ? (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (setEditingSub) setEditingSub(null);
                            }}
                            onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          className="z-20 px-1.5 py-0.5 rounded text-[9px] flex items-center gap-1 transition-all cursor-pointer opacity-100 border"
                            style={{ backgroundColor: `${secondaryThemeColor}12`, color: secondaryThemeColor, borderColor: `${secondaryThemeColor}33` }}
                            title={t('subtitle.cancel')}
                          >
                            <X size={10} />
                            {t('subtitle.cancel')}
                          </button>
                        ) : !multiSelectMode ? (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onDeleteSubtitle(sub.id);
                            }}
                            onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            className="z-20 p-1 rounded text-[9px] flex items-center justify-center transition-all cursor-pointer opacity-0 group-hover:opacity-100 border"
                            style={{ backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.14)' : 'rgba(239, 68, 68, 0.10)', color: '#ef4444', borderColor: isDarkMode ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.25)' }}
                            title={t('subtitle.deleteOne')}
                          >
                            <Trash2 size={10} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={(event) => toggleSubtitleVisibility(sub, event)}
                        className="shrink-0 self-start mt-0.5"
                        title={sub.visible === false ? t('subtitle.showOne') : t('subtitle.hideOne')}
                        style={{ color: sub.visible === false ? uiTheme.textMuted : secondaryThemeColor }}
                      >
                        {sub.visible === false ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                      <span
                        className="self-start shrink-0 font-mono text-[10px] leading-5 opacity-65"
                        title={t('subtitle.count', { count: subtitleIndex })}
                      >
                        {subtitleIndex}
                      </span>
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] self-start shrink-0 font-bold"
                        style={speakers[sub.speakerId]?.type === 'annotation' ? { backgroundColor: `${isDarkMode ? '#9ca3af' : '#6b7280'}22`, color: isDarkMode ? '#d1d5db' : '#4b5563', border: `1px solid ${isDarkMode ? '#6b7280' : '#9ca3af'}55` } : { backgroundColor: `${secondaryThemeColor}${isDarkMode ? '22' : '18'}`, color: secondaryThemeColor, border: `1px solid ${secondaryThemeColor}33` }}
                      >
                        {speakers[sub.speakerId]?.name || sub.actor || sub.style}
                      </span>
                      <p className="leading-relaxed line-clamp-3 whitespace-pre-wrap">{sub.text}</p>
                    </div>
                  </>
                )}
                
                {isInlineEditing && (
                  <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 font-mono text-[10px]">
                        <Clock size={10} />
                        <input
                          type="number"
                          step="0.1"
                          value={editForm.start}
                          onChange={(e) => setEditForm({...editForm, start: e.target.value})}
                          className={`w-16 px-1 py-0.5 rounded border text-xs focus:outline-none ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
                          style={{ backgroundColor: uiTheme.inputBg, borderColor: `${themeColor}55`, color: uiTheme.text }}
                        />
                        <span>-</span>
                        <input
                          type="number"
                          step="0.1"
                          value={editForm.end}
                          onChange={(e) => setEditForm({...editForm, end: e.target.value})}
                          className={`w-16 px-1 py-0.5 rounded border text-xs focus:outline-none ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
                          style={{ backgroundColor: uiTheme.inputBg, borderColor: `${themeColor}55`, color: uiTheme.text }}
                        />
                      </div>
                      <select
                        value={editForm.speakerId}
                        onChange={(e) => setEditForm({ ...editForm, speakerId: e.target.value })}
                        className="px-2 py-1 rounded border text-xs focus:outline-none"
                        style={{ backgroundColor: uiTheme.inputBg, borderColor: `${themeColor}55`, color: uiTheme.text }}
                      >
                        {Object.entries(speakers).map(([speakerId, speaker]) => (
                          <option key={speakerId} value={speakerId}>{speaker.name || speakerId}</option>
                        ))}
                      </select>
                    </div>
                    
                    <textarea
                      ref={editTextareaRef}
                      value={editForm.text}
                      onChange={(e) => setEditForm({...editForm, text: e.target.value})}
                      onPaste={(e) => { void handleInlineEditorPaste(e); }}
                      className="w-full p-2 rounded border text-xs min-h-[60px] resize-y focus:outline-none"
                      style={{ backgroundColor: uiTheme.inputBg, borderColor: `${themeColor}55`, color: uiTheme.text }}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          saveInlineEdit(sub.id, e as unknown as React.MouseEvent);
                        } else if (e.key === 'Escape') {
                          setInlineEditingId(null);
                        }
                      }}
                    />
                    <div className="mt-1 text-[10px] leading-4" style={{ color: uiTheme.textMuted }}>
                      {t('subtitle.markdownHint')}
                    </div>
                    
                    <div className="flex justify-end gap-2 mt-1">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setInlineEditingId(null);
                        }}
                        className="px-3 py-1 rounded text-[10px] transition-colors"
                        style={{ backgroundColor: rgba(themeColor, isDarkMode ? 0.16 : 0.08), color: uiTheme.textMuted, border: `1px solid ${rgba(themeColor, isDarkMode ? 0.28 : 0.18)}` }}
                      >
                        {t('subtitle.cancel')}
                      </button>
                      <button
                        onClick={(e) => saveInlineEdit(sub.id, e)}
                        className="px-3 py-1 rounded text-[10px] text-white transition-colors"
                        style={{ backgroundColor: secondaryThemeColor }}
                      >
                        {t('subtitle.save')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {pendingBulkAction && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4" style={{ backgroundColor: isDarkMode ? 'rgba(3, 7, 18, 0.55)' : 'rgba(15, 23, 42, 0.16)' }}>
          <div
            className="w-full max-w-md rounded-xl border shadow-2xl overflow-hidden"
            style={{ backgroundColor: uiTheme.panelBgElevated, borderColor: `${secondaryThemeColor}33`, color: uiTheme.text }}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: uiTheme.border }}>
	              <div className="text-sm font-semibold">
	                {pendingBulkAction.type === 'delete'
	                  ? t('subtitle.bulkDeleteConfirmTitle', { count: validSelectedSubtitleIds.length })
	                  : pendingBulkAction.type === 'speaker'
	                    ? t('subtitle.bulkSpeakerConfirmTitle', { count: validSelectedSubtitleIds.length, speaker: pendingSpeakerName })
	                    : (pendingBulkAction.visible ? t('subtitle.bulkShowConfirmTitle', { count: validSelectedSubtitleIds.length }) : t('subtitle.bulkHideConfirmTitle', { count: validSelectedSubtitleIds.length }))}
	              </div>
              <div className="mt-1 text-xs" style={{ color: uiTheme.textMuted }}>
                {pendingBulkAction.type === 'delete' ? t('subtitle.bulkDeleteConfirmDesc') : pendingBulkAction.type === 'speaker' ? t('subtitle.bulkSpeakerConfirmDesc') : t('subtitle.bulkVisibilityConfirmDesc')}
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto custom-scrollbar p-3 space-y-2" style={{ backgroundColor: uiTheme.panelBgSubtle }}>
              {selectedSubtitles.map((sub) => (
                <div key={`bulk-preview-${sub.id}`} className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.cardBg }}>
                  <div className="flex items-center gap-2 mb-1" style={{ color: uiTheme.textMuted }}>
                    <span className="font-mono">{formatTime(sub.start)} - {formatTime(sub.end)}</span>
                    <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: `${secondaryThemeColor}14`, color: secondaryThemeColor }}>
                      {speakers[sub.speakerId]?.name || sub.actor || sub.style}
                    </span>
                    {pendingBulkAction.type === 'speaker' ? (
                      <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: `${themeColor}14`, color: themeColor }}>
                        {pendingSpeakerName}
                      </span>
                    ) : pendingBulkAction.type === 'visibility' ? (
                      <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: `${themeColor}14`, color: themeColor }}>
                        {pendingBulkAction.visible ? t('common.enabled') : t('common.disabled')}
                      </span>
                    ) : null}
                  </div>
                  <div className="line-clamp-2 whitespace-pre-wrap">{sub.text}</div>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t flex justify-end gap-2" style={{ borderColor: uiTheme.border }}>
              <button
                type="button"
                onClick={cancelBulkAction}
                className="px-3 py-1.5 rounded text-xs border"
                style={{ borderColor: uiTheme.border, color: uiTheme.textMuted, backgroundColor: uiTheme.panelBgSubtle }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={confirmBulkAction}
                className="px-3 py-1.5 rounded text-xs text-white"
                style={{ backgroundColor: secondaryThemeColor }}
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
