import { FileText, Clock, MousePointer2, Check, Trash2, Search, ChevronUp, ChevronDown } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import type { SubtitleItem } from '../hooks/useAssSubtitle';
import { translate, type Language } from '../i18n';
import { createThemeTokens, rgba } from '../theme';
import { Tooltip } from './ui/Tooltip';

interface SubtitlePanelProps {
  subtitles: SubtitleItem[];
  speakers: Record<string, any>;
  currentTime: number;
  isDarkMode: boolean;
  language: Language;
  themeColor: string;
  secondaryThemeColor: string;
  onSeek: (time: number) => void;
  onUpdateSubtitle: (id: string, updates: Partial<SubtitleItem>) => void;
  onDeleteSubtitle: (id: string) => void | Promise<void>;
  editingSub?: { id: string, start: number, end: number, text: string } | null;
  setEditingSub?: (sub: { id: string, start: number, end: number, text: string } | null) => void;
}

export function SubtitlePanel({ subtitles, speakers, currentTime, isDarkMode, language, themeColor, secondaryThemeColor, onSeek, onUpdateSubtitle, onDeleteSubtitle, editingSub, setEditingSub }: SubtitlePanelProps) {
  const t = (key: string, vars?: Record<string, string | number>) => translate(language, key, vars);
  const uiTheme = createThemeTokens(themeColor, isDarkMode);
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ start: string; end: string; text: string; speakerId: string }>({ start: '', end: '', text: '', speakerId: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchMatches = subtitles.filter((sub) => sub.text.toLowerCase().includes(searchQuery.trim().toLowerCase()));
  const currentSearchMatchId = searchMatches.length > 0 ? searchMatches[searchIndex % searchMatches.length]?.id : undefined;

  const scrollToSubtitle = (subtitleId: string) => {
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
    setSearchIndex(0);
  }, [searchQuery]);

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

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const startInlineEdit = (sub: SubtitleItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setInlineEditingId(sub.id);
    setEditForm({ start: sub.start.toString(), end: sub.end.toString(), text: sub.text, speakerId: sub.speakerId });
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
      speakerId: editForm.speakerId
    });
    
    setInlineEditingId(null);
  };

  // Global shortcut to finish Region Edit with Enter
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && editingSub && !inlineEditingId) {
        e.preventDefault();
        if (setEditingSub) setEditingSub(null);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [editingSub, inlineEditingId, setEditingSub]);

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: uiTheme.panelBg, borderColor: uiTheme.border, color: uiTheme.textMuted }}>
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
        </h2>
        <div className="text-xs opacity-60">{t('subtitle.count', { count: subtitles.length })}</div>
      </div>
      {searchOpen && <div className="px-3 py-2 border-b flex items-center gap-2 shrink-0" style={{ backgroundColor: uiTheme.panelBgSubtle, borderColor: uiTheme.border }}>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
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
      
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-2">
        {subtitles.length === 0 ? (
          <div className="p-8 text-center text-xs opacity-50">{t('subtitle.empty')}</div>
        ) : (
          subtitles.map((sub) => {
            const isActive = currentTime >= sub.start && currentTime <= sub.end;
            const isInlineEditing = inlineEditingId === sub.id;
            const isRegionEditing = editingSub?.id === sub.id;

            return (
              <div 
                key={sub.id}
                id={`sub-${sub.id}`}
                onClick={() => !isInlineEditing && onSeek(sub.start)}
                onDoubleClick={(e) => {
                  if (!isInlineEditing) startInlineEdit(sub, e);
                }}
                className={`p-3 rounded-lg border text-xs transition-all duration-200 relative group
                  ${isInlineEditing ? (isDarkMode ? 'bg-gray-800' : 'bg-gray-50') : 
                   isRegionEditing ? (isDarkMode ? 'bg-gray-800 border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.2)]' : 'bg-green-50 border-green-400 shadow-sm') :
                    (isActive ? `cursor-pointer` : `${hoverClass} cursor-pointer`)}
                `}
                style={isInlineEditing ? { borderColor: `${themeColor}88`, backgroundColor: `${themeColor}${isDarkMode ? '18' : '10'}` } : currentSearchMatchId === sub.id ? { borderColor: `${secondaryThemeColor}88`, backgroundColor: `${secondaryThemeColor}${isDarkMode ? '18' : '10'}`, boxShadow: `0 6px 18px ${secondaryThemeColor}18` } : isActive ? { borderColor: `${themeColor}88`, backgroundColor: `${themeColor}${isDarkMode ? '22' : '14'}`, boxShadow: `0 6px 18px ${secondaryThemeColor}18` } : { backgroundColor: uiTheme.cardBg, borderColor: uiTheme.border }}
              >
                {!isInlineEditing && (
                  <>
                    <div className="flex justify-between items-center mb-2 opacity-70 relative">
                      <div className="flex items-center gap-1 font-mono text-[10px]">
                        <Clock size={10} />
                        <span>{formatTime(sub.start)} - {formatTime(sub.end)}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: `${secondaryThemeColor}14`, color: secondaryThemeColor }}>
                          {sub.duration}s
                        </span>
                        
                        <button 
                          onClick={(e) => toggleRegionEdit(sub, e)}
                          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          className={`z-20 px-2 py-0.5 rounded text-[10px] flex items-center gap-1 transition-all cursor-pointer
                            ${isRegionEditing 
                              ? `opacity-100 text-white shadow-md`
                              : `opacity-0 group-hover:opacity-100 ${isDarkMode ? 'text-gray-300' : 'text-gray-600 shadow-sm border border-gray-200'}`
                             }
                           `}
                          style={isRegionEditing ? { backgroundColor: themeColor, boxShadow: `0 4px 12px ${themeColor}24` } : { backgroundColor: `${themeColor}12`, borderColor: `${themeColor}33` }}
                          title={isRegionEditing ? t('subtitle.adjustDoneTitle') : t('subtitle.adjustTitle')}
                        >
                          {isRegionEditing ? <Check size={10} /> : <MousePointer2 size={10} />}
                          {isRegionEditing ? t('subtitle.adjustDone') : t('subtitle.adjust')}
                        </button>

                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDeleteSubtitle(sub.id);
                          }}
                          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          className={`z-20 px-2 py-0.5 rounded text-[10px] flex items-center gap-1 transition-all cursor-pointer opacity-0 group-hover:opacity-100 border`}
                          style={{ backgroundColor: `${secondaryThemeColor}12`, color: secondaryThemeColor, borderColor: `${secondaryThemeColor}33` }}
                          title={t('subtitle.deleteOne')}
                        >
                          <Trash2 size={10} />
                          {t('subtitle.delete')}
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
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
                      value={editForm.text}
                      onChange={(e) => setEditForm({...editForm, text: e.target.value})}
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
    </div>
  );
}
