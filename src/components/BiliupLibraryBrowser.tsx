import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { createThemeTokens } from '../theme';
import type { BiliupApi, BiliupCapabilities, BiliupSeasonContents, BiliupVideoParts } from '../biliup';
import { unwrapBiliup } from './BiliupContext';

interface Props {
  api: BiliupApi;
  directory: string;
  accountId: string;
  capabilities: BiliupCapabilities | null;
  isDarkMode: boolean;
  themeColor: string;
  secondaryThemeColor: string;
  t: (key: string) => string;
  selectedSectionId: string;
  onSelectedSectionIdChange: (value: string) => void;
  onSelectedSectionLabelChange: (value: string) => void;
  mode?: 'new' | 'append';
  onTargetVideoChange?: (id: string, status: 'loading' | 'valid' | 'invalid' | 'empty') => void;
}

export function BiliupLibraryBrowser({ api, directory, accountId, capabilities, isDarkMode, themeColor, secondaryThemeColor, t, selectedSectionId, onSelectedSectionIdChange, onSelectedSectionLabelChange, mode = 'new', onTargetVideoChange }: Props) {
  const theme = createThemeTokens(themeColor, isDarkMode);
  const [videoId, setVideoId] = useState('');
  const [videoParts, setVideoParts] = useState<BiliupVideoParts | null>(null);
  const [seasons, setSeasons] = useState<Array<{ id: number; title: string; sections: Array<{ id: number; title: string }> }>>([]);
  const [seasonsLoaded, setSeasonsLoaded] = useState(false);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [seasonContents, setSeasonContents] = useState<BiliupSeasonContents | null>(null);
  const [contentsExpanded, setContentsExpanded] = useState(false);
  const [busy, setBusy] = useState<'parts' | 'seasons' | 'contents' | null>(null);
  const contentsOpen = contentsExpanded && Boolean(seasonContents && String(seasonContents.id) === selectedSeasonId);
  const [error, setError] = useState('');
  const onSelectedSectionLabelChangeRef = useRef(onSelectedSectionLabelChange);
  useEffect(() => { onSelectedSectionLabelChangeRef.current = onSelectedSectionLabelChange; }, [onSelectedSectionLabelChange]);
  const supported = capabilities?.seasonsSupported === true;
  const selectedSection = seasons.flatMap((season) => season.sections.map((section) => ({ season, section })))
    .find(({ section }) => String(section.id) === selectedSectionId)?.section;
  const selectedSeason = seasons.find((season) => season.sections.some((section) => String(section.id) === selectedSectionId));
  const surface = { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text, colorScheme: isDarkMode ? 'dark' as const : 'light' as const };
  const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40';
  const buttonStyle = { backgroundColor: `${secondaryThemeColor}18`, borderColor: `${secondaryThemeColor}55`, color: secondaryThemeColor };
  useEffect(() => {
    setSeasons([]);
    setSeasonsLoaded(false);
    setSelectedSeasonId('');
    setSeasonContents(null);
    setContentsExpanded(false);
    onSelectedSectionLabelChangeRef.current('');
  }, [directory, accountId, capabilities?.version]);
  const call = async <T,>(kind: 'parts' | 'seasons' | 'contents', action: () => Promise<{ ok: boolean; value?: T; error?: string }>, receive: (value: T) => void) => {
    setBusy(kind);
    setError('');
    try { receive(unwrapBiliup(await action())); }
    catch (failure) {
      const code = failure instanceof Error && /^[a-z]+$/.test(failure.message) ? failure.message : 'input';
      setError(t(`biliup.error.${code}`));
      if (kind === 'parts') onTargetVideoChange?.('', 'invalid');
    } finally { setBusy(null); }
  };
  const findParts = () => {
    const id = videoId.trim();
    if (!id || busy) return;
    onTargetVideoChange?.('', 'loading');
    setVideoParts(null);
    void call('parts', () => api.videoParts(id), (result) => { setVideoParts(result); onTargetVideoChange?.(result.bvid || `av${result.aid}`, 'valid'); });
  };
  const loadSeasons = () => {
    if (busy || !directory.trim() || !supported) return;
    void call('seasons', () => api.seasons(directory), (result) => {
      setSeasonsLoaded(true);
      setSeasons(result);
      setSeasonContents(null);
      setContentsExpanded(false);
      if (!result.some((season) => String(season.id) === selectedSeasonId)) setSelectedSeasonId(result[0] ? String(result[0].id) : '');
      const selectedSection = result.flatMap((season) => season.sections.map((section) => ({ season, section })))
        .find(({ section }) => String(section.id) === selectedSectionId);
      if (selectedSection) {
        onSelectedSectionLabelChangeRef.current(`${selectedSection.season.title || t('biliup.library.untitledSeason')} / ${selectedSection.section.title || t('biliup.library.untitledSection')}`);
      } else if (selectedSectionId) {
        onSelectedSectionIdChange('');
        onSelectedSectionLabelChangeRef.current('');
      }
    });
  };
  const toggleContents = () => {
    if (busy) return;
    if (contentsOpen) {
      setContentsExpanded(false);
      return;
    }
    if (seasonContents && String(seasonContents.id) === selectedSeasonId) {
      setContentsExpanded(true);
      return;
    }
    const id = Number(selectedSeasonId);
    if (Number.isSafeInteger(id) && id > 0 && supported) {
      void call('contents', () => api.seasonContents(directory, id), (result) => {
        setSeasonContents(result);
        setContentsExpanded(true);
      });
    }
  };
  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  };

  return <section data-testid={mode === 'new' ? 'biliup-library' : 'biliup-append-library'} className="space-y-3 rounded-2xl border p-4" style={{ borderColor: `${secondaryThemeColor}33`, backgroundColor: `${secondaryThemeColor}${isDarkMode ? '0c' : '06'}` }}>
    <div>
      <h3 className="text-sm font-semibold">{t(mode === 'new' ? 'biliup.library.title' : 'biliup.library.appendTitle')}</h3>
      <p className="mt-1 text-xs opacity-70">{t(mode === 'new' ? 'biliup.library.hint' : 'biliup.library.appendBrowserHint')}</p>
    </div>
    {mode === 'append' && <div className="space-y-2 rounded-xl border p-3" style={{ borderColor: theme.border, backgroundColor: theme.panelBg }}>
      <label className="block space-y-1 text-xs">
        <span>{t(mode === 'append' ? 'biliup.library.appendVideoId' : 'biliup.library.videoId')}</span>
        <span className="flex gap-2">
          <input aria-label={t(mode === 'append' ? 'biliup.library.appendVideoId' : 'biliup.library.videoId')} className="my-[3px] min-w-0 flex-1 rounded-md border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2" style={surface} value={videoId} placeholder="BV... / av..." disabled={busy !== null} onChange={(event) => { setVideoId(event.target.value); setVideoParts(null); onTargetVideoChange?.('', 'empty'); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); findParts(); } }} />
          <button type="button" className={buttonClass} style={buttonStyle} disabled={busy !== null || !videoId.trim()} onClick={findParts}><Search size={14} />{busy === 'parts' ? t('biliup.library.loading') : t(mode === 'append' ? 'biliup.library.findAppendTarget' : 'biliup.library.viewParts')}</button>
        </span>
      </label>
      {videoParts && <div className="space-y-2" data-testid="biliup-video-parts">
        <p className="text-xs font-medium break-words">{videoParts.title} · {videoParts.bvid || `av${videoParts.aid}`}</p>
        {videoParts.pages.map((page) => <div key={page.cid} className="flex min-w-0 items-start justify-between gap-3 rounded-md border px-2.5 py-2 text-xs" style={{ borderColor: theme.border }}>
          <span className="min-w-0 break-words"><span className="mr-1 opacity-60">P{page.page}</span>{page.part || videoParts.title}</span><span className="shrink-0 font-mono opacity-70">{formatDuration(page.duration)}</span>
        </div>)}
      </div>}
    </div>}
    {mode === 'new' && <div className="space-y-2 rounded-xl border p-3" style={{ borderColor: theme.border, backgroundColor: theme.panelBg }}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium">{t('biliup.library.seasons')}</h4>
        <button type="button" className={`${buttonClass} h-9 shrink-0 self-auto`} style={buttonStyle} disabled={!directory.trim() || !supported || busy !== null} title={!supported ? t('biliup.library.minimumVersion') : undefined} aria-busy={busy === 'seasons'} onClick={loadSeasons}>{busy === 'seasons' ? t('biliup.library.loading') : t('biliup.library.loadSeasons')}</button>
      </div>
      <p className="-mt-1 text-[0.6875rem] opacity-70">{capabilities?.version ? t('biliup.library.version').replace('{version}', capabilities.version) : t('biliup.library.versionUnknown')}</p>
      {!supported && <p className="text-xs opacity-70">{t('biliup.library.minimumVersion')}</p>}
      {supported && seasonsLoaded && seasons.length === 0 && <p role="status" className="rounded-lg border px-3 py-2 text-xs opacity-80" style={{ borderColor: theme.border }}>{t('biliup.library.noSeasons')}</p>}
      {supported && seasonsLoaded && seasons.length > 0 && seasons.every((season) => season.sections.length === 0) && <p role="status" className="rounded-lg border px-3 py-2 text-xs opacity-80" style={{ borderColor: theme.border }}>{t('biliup.library.noSections')}</p>}
      <div className="flex min-w-0 items-center gap-2">
        <select aria-label={t('biliup.library.seasons')} className="h-9 min-w-0 flex-1 rounded-md border px-3 text-sm focus-visible:outline focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50" style={surface} disabled={!supported || busy !== null || seasons.length === 0} value={selectedSeasonId} onChange={(event) => { setSelectedSeasonId(event.target.value); setSeasonContents(null); setContentsExpanded(false); }}>
          <option value="">{t('biliup.library.chooseSeason')}</option>
          {seasons.map((season) => <option key={season.id} value={season.id}>{season.title || t('biliup.library.untitledSeason')} · {season.id}</option>)}
        </select>
        <button type="button" className={`${buttonClass} h-9 shrink-0 self-auto`} style={buttonStyle} disabled={!supported || busy !== null || !selectedSeasonId} aria-expanded={contentsOpen} aria-controls="biliup-season-contents" onClick={toggleContents}>{contentsOpen ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}{busy === 'contents' ? t('biliup.library.loading') : t(contentsOpen ? 'biliup.library.collapseContents' : 'biliup.library.viewContents')}</button>
      </div>
      {seasonsLoaded && seasons.some((season) => season.sections.length > 0) && <label className="block space-y-1 text-xs">
        <span>{t('biliup.library.uploadDestination')}</span>
        <select aria-label={t('biliup.library.uploadDestination')} className="h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50" style={surface} disabled={!supported || busy !== null || seasons.length === 0} value={selectedSectionId} onChange={(event) => {
          const sectionId = event.target.value;
          onSelectedSectionIdChange(sectionId);
          onSelectedSectionLabelChangeRef.current(event.target.selectedOptions[0]?.textContent || '');
        }}>
          <option value="">{t('biliup.library.noDestination')}</option>
          {selectedSectionId && !seasons.some((season) => season.sections.some((section) => String(section.id) === selectedSectionId)) && <option value={selectedSectionId}>{t('biliup.library.savedDestination').replace('{id}', selectedSectionId)}</option>}
          {seasons.map((season) => season.sections.map((section) => <option key={section.id} value={section.id}>{season.title} / {section.title || t('biliup.library.untitledSection')}</option>))}
        </select>
        {selectedSectionId && selectedSeason && selectedSection && <span className="block font-medium" data-testid="biliup-selected-destination" role="status">{t('biliup.library.selectedDestination')}: {selectedSeason.title || t('biliup.library.untitledSeason')} / {selectedSection.title || t('biliup.library.untitledSection')}</span>}
        <span className="block opacity-70">{t('biliup.library.uploadDestinationHint')}</span>
        {!supported && selectedSectionId && <button type="button" className="mt-1 rounded border px-2.5 py-1.5 text-xs transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2" style={buttonStyle} onClick={() => onSelectedSectionIdChange('')}>{t('biliup.library.clearDestination')}</button>}
      </label>}
      {contentsOpen && seasonContents && <div id="biliup-season-contents" className="max-h-80 space-y-3 overflow-y-auto pr-1" data-testid="biliup-season-contents">
        <p className="text-xs font-medium break-words">{seasonContents.title}</p>
        {seasonContents.sections.map((section) => <div key={section.id} className="space-y-1.5">
          <h5 className="text-xs font-medium">{section.title || t('biliup.library.untitledSection')} <span className="font-normal opacity-60">· {section.episodes.length}</span></h5>
          {section.episodes.length ? section.episodes.map((episode, index) => <div key={episode.id} className="flex min-w-0 items-start justify-between gap-3 rounded-md border px-2.5 py-2 text-xs" style={{ borderColor: theme.border }}>
            <span className="min-w-0 break-words"><span className="mr-1 opacity-60">{index + 1}.</span>{episode.title || `av${episode.aid}`}</span><span className="shrink-0 font-mono opacity-70">av{episode.aid}</span>
          </div>) : <p className="text-xs opacity-60">{t('biliup.library.emptySection')}</p>}
        </div>)}
      </div>}
    </div>}
    {mode === 'append' && videoParts && <p className="text-xs opacity-70">{t('biliup.library.appendModeResult')}</p>}
    {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
  </section>;
}
