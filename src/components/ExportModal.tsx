import { useEffect, useMemo, useState } from 'react';
import { Download, FolderOpen, Sparkles, Timer, Trash2, X } from 'lucide-react';
import { translate, type Language } from '../i18n';
import { createThemeTokens, rgba } from '../theme';
import { Tooltip } from './ui/Tooltip';

interface ExportProgressState {
  progress: number;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  stage: string;
}

const copyToClipboard = async (text: string) => {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  } catch (_error) {
    return false;
  }
};

interface ExportModalProps {
  isOpen: boolean;
  isDarkMode: boolean;
  language: Language;
  themeColor: string;
  secondaryThemeColor: string;
  outputPath: string;
  quickSaveDir: string;
  rangeStart: number;
  rangeEnd: number;
  defaultRangeStart: number;
  defaultRangeEnd: number;
  isExporting: boolean;
  exportSucceeded: boolean;
  progress: ExportProgressState | null;
  statusMessage: string | null;
  renderCacheInfo?: {
    remoteAssets: { path: string; files: number; bytes: number };
    remotionTemp: { path: string; entries: string[]; files: number; bytes: number };
  } | null;
  exportQuality?: 'fast' | 'balance' | 'high';
  exportHardware?: 'auto' | 'gpu' | 'cpu';
  exportParallelSegments?: boolean;
  exportFormat?: 'mp4' | 'mov-alpha' | 'webm-alpha';
  exportLogEnabled?: boolean;
   filenameTemplate?: 'default' | 'timestamp' | 'unix' | 'custom';
   customFilename?: string;
   onClose: () => void;
  onOutputPathChange: (value: string) => void;
  onChoosePath: () => void | Promise<void>;
  onQuickSave: () => void;
  onRangeChange: (next: { start?: number; end?: number }) => void;
  onStartExport: () => void | Promise<void>;
  onRevealOutput: () => void | Promise<void>;
  onClearRenderCache?: (type: 'remote-assets' | 'remotion-temp') => void | Promise<void>;
  onQualityChange?: (quality: 'fast' | 'balance' | 'high') => void;
  onHardwareChange?: (mode: 'auto' | 'gpu' | 'cpu') => void;
  onExportParallelSegmentsChange?: (enabled: boolean) => void;
  onExportFormatChange?: (format: 'mp4' | 'mov-alpha' | 'webm-alpha') => void;
  onExportLogEnabledChange?: (enabled: boolean) => void;
  onFilenameTemplateChange?: (template: 'default' | 'timestamp' | 'unix' | 'custom') => void;
  onCustomFilenameChange?: (filename: string) => void;
}

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

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.0';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ds = Math.floor((seconds % 1) * 10);

  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ds}`;
  }

  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ds}`;
};

const formatDuration = (ms: number | null) => {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '--:--';
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
};

export function ExportModal({
  isOpen,
  isDarkMode,
  language,
  themeColor,
  secondaryThemeColor,
  outputPath,
  quickSaveDir,
  rangeStart,
  rangeEnd,
  defaultRangeStart,
  defaultRangeEnd,
  isExporting,
  exportSucceeded,
  progress,
  statusMessage,
  renderCacheInfo,
  exportQuality = 'balance',
  exportHardware = 'auto',
  exportParallelSegments = false,
  exportFormat = 'mp4',
  exportLogEnabled = false,
  filenameTemplate = 'default',
  customFilename = '',
  onClose,
  onOutputPathChange,
  onChoosePath,
  onQuickSave,
  onRangeChange,
  onStartExport,
  onRevealOutput,
  onClearRenderCache,
  onQualityChange,
  onHardwareChange,
  onExportParallelSegmentsChange,
  onExportFormatChange,
  onExportLogEnabledChange,
  onFilenameTemplateChange,
  onCustomFilenameChange
}: ExportModalProps) {
  const t = (key: string, vars?: Record<string, string | number>) => translate(language, key, vars);
  const uiTheme = createThemeTokens(themeColor, isDarkMode);
  const [startInput, setStartInput] = useState(formatTime(rangeStart));
  const [endInput, setEndInput] = useState(formatTime(rangeEnd));
  const [localCustomFilename, setLocalCustomFilename] = useState(customFilename);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => setStartInput(formatTime(rangeStart)), 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, rangeStart]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => setEndInput(formatTime(rangeEnd)), 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, rangeEnd]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => setLocalCustomFilename(customFilename), 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, customFilename]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isExporting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExporting, isOpen, onClose]);

  const progressPercent = Math.max(0, Math.min(100, Math.round((progress?.progress || 0) * 100)));
  const exportSpan = useMemo(() => Math.max(0, rangeEnd - rangeStart), [rangeEnd, rangeStart]);
  const isErrorStatus = Boolean(statusMessage && /error|failed|超时|失败|异常/i.test(statusMessage));

  const commitRangeInput = (field: 'start' | 'end', value: string) => {
    const next = parseFlexibleTime(value);
    if (next === null) {
      setStartInput(formatTime(rangeStart));
      setEndInput(formatTime(rangeEnd));
      return;
    }
    onRangeChange(field === 'start' ? { start: next } : { end: next });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[160] flex items-start justify-center bg-black/55 backdrop-blur-sm px-4 py-4 overflow-y-auto">
      <div
        className="w-full max-w-3xl max-h-[calc(100dvh-2rem)] overflow-hidden rounded-[28px] border shadow-2xl [&_.text-xs]:text-sm flex flex-col"
        style={{
          background: `linear-gradient(180deg, ${uiTheme.panelBgElevated} 0%, ${uiTheme.panelBg} 68%, ${rgba(secondaryThemeColor, isDarkMode ? 0.12 : 0.08)} 100%)`,
          borderColor: rgba(secondaryThemeColor, isDarkMode ? 0.32 : 0.26),
          color: uiTheme.text,
          boxShadow: `0 26px 80px ${rgba(secondaryThemeColor, 0.18)}`
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b px-6 py-5" style={{ borderColor: uiTheme.border, backgroundColor: rgba(themeColor, isDarkMode ? 0.1 : 0.06) }}>
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: rgba(secondaryThemeColor, 0.14), color: secondaryThemeColor, border: `1px solid ${rgba(secondaryThemeColor, 0.24)}` }}>
              <Sparkles size={12} />
              {t('export.badge')}
            </div>
            <h3 className="text-xl font-semibold">{t('export.title')}</h3>
            <p className="mt-1 text-sm" style={{ color: uiTheme.textMuted }}>{t('export.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="rounded-full p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: rgba(themeColor, isDarkMode ? 0.16 : 0.08) }}
            title={t('common.cancel')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-5 px-6 py-6 md:grid-cols-[1.2fr_0.8fr] overflow-y-auto">
          <div className="space-y-5">
              <section className="rounded-2xl border p-4" style={{ borderColor: uiTheme.border, backgroundColor: rgba(themeColor, isDarkMode ? 0.08 : 0.04) }}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{t('export.path')}</div>
                  <div className="text-xs mt-1" style={{ color: uiTheme.textMuted }}>{t('export.pathHint')}</div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
                  <button
                    type="button"
                    onClick={() => void onChoosePath()}
                    disabled={isExporting}
                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ backgroundColor: rgba(themeColor, isDarkMode ? 0.16 : 0.08), border: `1px solid ${uiTheme.border}` }}
                  >
                    <FolderOpen size={13} />
                    {t('export.choosePath')}
                  </button>
                  <button
                    type="button"
                    onClick={onQuickSave}
                    disabled={isExporting}
                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-xs font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ backgroundColor: secondaryThemeColor, boxShadow: `0 10px 20px ${rgba(secondaryThemeColor, 0.24)}` }}
                  >
                    <Download size={13} />
                    {t('export.quickSave')}
                  </button>
                </div>
              </div>
              <input
                value={outputPath}
                onChange={(event) => onOutputPathChange(event.target.value)}
                disabled={isExporting}
                className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundColor: uiTheme.inputBg, borderColor: rgba(secondaryThemeColor, 0.22), color: uiTheme.text }}
                placeholder={t('export.pathPlaceholder')}
              />
              <div className="mt-3 text-xs" style={{ color: uiTheme.textMuted }}>
                {t('export.quickSaveHint')}: <span style={{ color: secondaryThemeColor }}>{quickSaveDir || '--'}</span>
              </div>
            </section>

            <section className="rounded-2xl border p-4" style={{ borderColor: uiTheme.border, backgroundColor: rgba(secondaryThemeColor, isDarkMode ? 0.08 : 0.05) }}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{t('export.range')}</div>
                  <div className="text-xs mt-1" style={{ color: uiTheme.textMuted }}>{t('export.rangeHint')}</div>
                </div>
                <div className="rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: rgba(themeColor, isDarkMode ? 0.18 : 0.09), color: themeColor }}>
                  {t('export.rangeDuration', { duration: formatTime(exportSpan) })}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                 <div className="rounded-2xl border p-3" style={{ borderColor: rgba(themeColor, 0.18), backgroundColor: rgba(themeColor, isDarkMode ? 0.08 : 0.05) }}>
                   <div className="mb-2 flex items-center justify-between gap-1">
                     <span className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: themeColor }}>{t('export.start')}</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => onRangeChange({ start: defaultRangeStart })}
                          disabled={isExporting}
                          className="rounded-full px-2.5 py-1 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                          style={{ backgroundColor: rgba(themeColor, 0.12), color: themeColor }}
                          title={t('export.useEarliest')}
                        >
                          {t('export.useEarliest')}
                        </button>
                      </div>
                   </div>
                  <input
                    value={startInput}
                    onChange={(event) => setStartInput(event.target.value)}
                    onBlur={() => commitRangeInput('start', startInput)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitRangeInput('start', startInput);
                      if (event.key === 'Escape') setStartInput(formatTime(rangeStart));
                    }}
                    disabled={isExporting}
                    className="w-full rounded-xl border px-3 py-2 text-sm font-mono outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ backgroundColor: uiTheme.inputBg, borderColor: rgba(themeColor, 0.24), color: uiTheme.text }}
                  />
                </div>

                 <div className="rounded-2xl border p-3" style={{ borderColor: rgba(secondaryThemeColor, 0.18), backgroundColor: rgba(secondaryThemeColor, isDarkMode ? 0.08 : 0.05) }}>
                   <div className="mb-2 flex items-center justify-between gap-1">
                     <span className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: secondaryThemeColor }}>{t('export.end')}</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => onRangeChange({ end: defaultRangeEnd })}
                          disabled={isExporting}
                          className="rounded-full px-2.5 py-1 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                          style={{ backgroundColor: rgba(secondaryThemeColor, 0.12), color: secondaryThemeColor }}
                          title={t('export.useLatest')}
                        >
                          {t('export.useLatest')}
                        </button>
                      </div>
                   </div>
                  <input
                    value={endInput}
                    onChange={(event) => setEndInput(event.target.value)}
                    onBlur={() => commitRangeInput('end', endInput)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitRangeInput('end', endInput);
                      if (event.key === 'Escape') setEndInput(formatTime(rangeEnd));
                    }}
                    disabled={isExporting}
                    className="w-full rounded-xl border px-3 py-2 text-sm font-mono outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ backgroundColor: uiTheme.inputBg, borderColor: rgba(secondaryThemeColor, 0.24), color: uiTheme.text }}
                  />
                </div>
              </div>
            </section>

             <section className="rounded-2xl border p-4" style={{ borderColor: uiTheme.border, backgroundColor: rgba(themeColor, isDarkMode ? 0.08 : 0.04) }}>
               <div className="mb-4 flex items-center justify-between gap-3">
                 <div>
                   <div className="text-sm font-medium">{t('export.quality')}</div>
                   <div className="text-xs mt-1" style={{ color: uiTheme.textMuted }}>{t('export.qualityHint')}</div>
                 </div>
                 <div className="rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: rgba(secondaryThemeColor, isDarkMode ? 0.18 : 0.09), color: secondaryThemeColor }}>
                   {exportQuality}
                 </div>
               </div>

                <div className="flex gap-2">
                  {(['fast', 'balance', 'high'] as const).map((quality) => (
                   <button
                     key={quality}
                     type="button"
                     onClick={() => onQualityChange?.(quality)}
                     disabled={isExporting}
                     className="flex-1 rounded-xl px-3 py-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                     style={{
                       backgroundColor: exportQuality === quality ? rgba(secondaryThemeColor, 0.18) : rgba(themeColor, isDarkMode ? 0.08 : 0.04),
                       color: exportQuality === quality ? secondaryThemeColor : uiTheme.text,
                       border: `1px solid ${exportQuality === quality ? rgba(secondaryThemeColor, 0.24) : uiTheme.border}`
                     }}
                   >
                     {t(`export.quality${quality.charAt(0).toUpperCase()}${quality.slice(1)}`)}
                   </button>
                  ))}
                 </div>

                  <div className="mt-3">
                    <div className="text-xs font-medium mb-1" style={{ color: uiTheme.text }}>{t('export.hardware')}</div>
                   <div className="grid grid-cols-3 gap-2">
                     {(['auto', 'gpu', 'cpu'] as const).map((mode) => (
                       <button
                         key={mode}
                         type="button"
                         onClick={() => onHardwareChange?.(mode)}
                         disabled={isExporting}
                         className="rounded-xl px-2.5 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                         style={{
                           backgroundColor: exportHardware === mode ? rgba(secondaryThemeColor, 0.18) : rgba(themeColor, isDarkMode ? 0.08 : 0.04),
                           color: exportHardware === mode ? secondaryThemeColor : uiTheme.text,
                           border: `1px solid ${exportHardware === mode ? rgba(secondaryThemeColor, 0.24) : uiTheme.border}`
                         }}
                       >
                         {t(`export.hardware.${mode}`)}
                       </button>
                     ))}
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: uiTheme.textMuted }}>{t('export.hardwareHint')}</div>
                  </div>

                  <div className="mt-3 rounded-2xl border px-3 py-3" style={{ borderColor: uiTheme.border, backgroundColor: rgba(themeColor, isDarkMode ? 0.06 : 0.03) }}>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportParallelSegments}
                        onChange={(event) => onExportParallelSegmentsChange?.(event.target.checked)}
                        disabled={isExporting}
                        className="mt-0.5 h-4 w-4 rounded border"
                        style={{ accentColor: secondaryThemeColor }}
                      />
                      <div>
                        <div className="text-xs font-medium" style={{ color: uiTheme.text }}>{t('export.parallelSegments')}</div>
                        <div className="text-[11px] mt-1" style={{ color: uiTheme.textMuted }}>{t('export.parallelSegmentsHint')}</div>
                      </div>
                    </label>
                  </div>

                  <div className="mt-3">
                    <div className="text-xs font-medium mb-1" style={{ color: uiTheme.text }}>{t('export.format')}</div>
                    <div className="grid grid-cols-3 gap-2">
                      {(['mp4', 'webm-alpha', 'mov-alpha'] as const).map((format) => {
                        const tooltipKey = format === 'mov-alpha'
                          ? 'export.format.mov-alpha.tip'
                          : format === 'webm-alpha'
                            ? 'export.format.webm-alpha.tip'
                            : 'export.format.mp4.tip';
                        return (
                          <Tooltip
                            key={format}
                            content={t(tooltipKey)}
                            placement="top"
                            width={260}
                            backgroundColor={isDarkMode ? 'rgba(17, 24, 39, 0.82)' : 'rgba(255, 255, 255, 0.9)'}
                            borderColor={rgba(secondaryThemeColor, 0.24)}
                            textColor={uiTheme.text}
                            className="block"
                          >
                            <button
                              type="button"
                              onClick={() => onExportFormatChange?.(format)}
                              disabled={isExporting}
                              className="w-full rounded-xl px-2.5 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                              style={{
                                backgroundColor: exportFormat === format ? rgba(secondaryThemeColor, 0.18) : rgba(themeColor, isDarkMode ? 0.08 : 0.04),
                                color: exportFormat === format ? secondaryThemeColor : uiTheme.text,
                                border: `1px solid ${exportFormat === format ? rgba(secondaryThemeColor, 0.24) : uiTheme.border}`
                              }}
                            >
                              {t(`export.format.${format}`)}
                            </button>
                          </Tooltip>
                        );
                      })}
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: uiTheme.textMuted }}>{t('export.formatHint')}</div>
                  </div>

                  <div className="mt-3 rounded-2xl border px-3 py-3" style={{ borderColor: uiTheme.border, backgroundColor: rgba(themeColor, isDarkMode ? 0.06 : 0.03) }}>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportLogEnabled}
                        onChange={(event) => onExportLogEnabledChange?.(event.target.checked)}
                        disabled={isExporting}
                        className="mt-0.5 h-4 w-4 rounded border"
                        style={{ accentColor: secondaryThemeColor }}
                      />
                      <div>
                        <div className="text-xs font-medium" style={{ color: uiTheme.text }}>{t('export.logEnabled')}</div>
                        <div className="text-[11px] mt-1" style={{ color: uiTheme.textMuted }}>{t('export.logEnabledHint')}</div>
                        <div className="text-[11px] mt-1 font-mono break-all" style={{ color: secondaryThemeColor }}>
                          {t('export.logPath')}: `~/.config/pomchat/export-logs/`
                        </div>
                      </div>
                    </label>
                  </div>
                </section>

              {window.electron && renderCacheInfo ? (
                <section className="rounded-2xl border p-4" style={{ borderColor: rgba(secondaryThemeColor, 0.2), backgroundColor: rgba(secondaryThemeColor, isDarkMode ? 0.08 : 0.04) }}>
                  <div className="mb-2 text-sm font-medium" style={{ color: uiTheme.text }}>{t('export.cacheSectionTitle')}</div>
                  <div className="space-y-2 text-xs" style={{ color: uiTheme.textMuted }}>
                    <div className="rounded-xl border p-2" style={{ borderColor: uiTheme.border }}>
                      <div className="font-medium" style={{ color: uiTheme.text }}>{t('export.cacheRemoteAssets')}</div>
                      <div className="font-mono break-all mt-1">{renderCacheInfo.remoteAssets.path}</div>
                      <div className="mt-1">{t('export.cacheStats', { files: renderCacheInfo.remoteAssets.files, size: formatBytes(renderCacheInfo.remoteAssets.bytes) })}</div>
                      <button
                        type="button"
                        disabled={isExporting}
                        onClick={() => void onClearRenderCache?.('remote-assets')}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs border disabled:opacity-50"
                        style={{ borderColor: `${secondaryThemeColor}55`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}12` }}
                      >
                        <Trash2 size={12} />
                        {t('export.clearRemoteAssetsCache')}
                      </button>
                    </div>

                    <div className="rounded-xl border p-2" style={{ borderColor: uiTheme.border }}>
                      <div className="font-medium" style={{ color: uiTheme.text }}>{t('export.cacheRemotionTemp')}</div>
                      <div className="font-mono break-all mt-1">{renderCacheInfo.remotionTemp.path}</div>
                      <div className="mt-1">{t('export.cacheStats', { files: renderCacheInfo.remotionTemp.files, size: formatBytes(renderCacheInfo.remotionTemp.bytes) })}</div>
                      <button
                        type="button"
                        disabled={isExporting}
                        onClick={() => void onClearRenderCache?.('remotion-temp')}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs border disabled:opacity-50"
                        style={{ borderColor: `${secondaryThemeColor}55`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}12` }}
                      >
                        <Trash2 size={12} />
                        {t('export.clearRemotionTempCache')}
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>

           <section className="rounded-[24px] border p-4 flex flex-col" style={{ borderColor: uiTheme.border, background: `linear-gradient(180deg, ${rgba(secondaryThemeColor, isDarkMode ? 0.14 : 0.08)} 0%, ${uiTheme.panelBgSubtle} 100%)` }}>
             {/* Filename Template Section - at the top */}
             <div className="mb-5 rounded-2xl border p-4" style={{ borderColor: uiTheme.border, backgroundColor: rgba(secondaryThemeColor, isDarkMode ? 0.08 : 0.05) }}>
               <div className="mb-4 flex items-center justify-between gap-3">
                 <div>
                   <div className="text-sm font-medium">{t('export.filenameTemplate')}</div>
                   <div className="text-xs mt-1" style={{ color: uiTheme.textMuted }}>{t('export.filenameTemplateHint')}</div>
                 </div>
                 <div className="rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: rgba(themeColor, isDarkMode ? 0.18 : 0.09), color: themeColor }}>
                   {filenameTemplate}
                 </div>
               </div>

                <div className="grid gap-2 md:grid-cols-2">
                  {(['default', 'timestamp', 'unix', 'custom'] as const).map((template) => {
                    const filenameExamples: Record<string, string> = {
                      default: exportFormat === 'mov-alpha' ? 'pomchat.mov' : exportFormat === 'webm-alpha' ? 'pomchat.webm' : 'pomchat.mp4',
                      timestamp: exportFormat === 'mov-alpha' ? 'pomchat_2026-03-28_12-07-03.mov' : exportFormat === 'webm-alpha' ? 'pomchat_2026-03-28_12-07-03.webm' : 'pomchat_2026-03-28_12-07-03.mp4',
                      unix: exportFormat === 'mov-alpha' ? 'pomchat_1743192423.mov' : exportFormat === 'webm-alpha' ? 'pomchat_1743192423.webm' : 'pomchat_1743192423.mp4',
                      custom: ''
                    };
                    const templateButton = (
                      <button
                        type="button"
                        onClick={() => onFilenameTemplateChange?.(template)}
                        disabled={isExporting}
                        className="relative w-full rounded-xl px-3 py-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                          backgroundColor: filenameTemplate === template ? rgba(themeColor, 0.18) : rgba(secondaryThemeColor, isDarkMode ? 0.08 : 0.04),
                          color: filenameTemplate === template ? themeColor : uiTheme.text,
                          border: `1px solid ${filenameTemplate === template ? rgba(themeColor, 0.24) : uiTheme.border}`
                        }}
                      >
                        {t(`export.filenameTemplate${template.charAt(0).toUpperCase()}${template.slice(1)}`)}
                      </button>
                    );

                    if (template === 'custom') {
                      return (
                        <div key={template}>
                          {templateButton}
                        </div>
                      );
                    }

                    return (
                      <Tooltip key={template} content={filenameExamples[template]} placement="top" width={220} backgroundColor={isDarkMode ? 'rgba(17, 24, 39, 0.78)' : 'rgba(255, 255, 255, 0.78)'} borderColor={rgba(secondaryThemeColor, 0.24)} textColor={uiTheme.text} className="block">
                        {templateButton}
                      </Tooltip>
                    );
                  })}
                </div>

               {filenameTemplate === 'custom' && (
                 <div className="mt-3">
                   <input
                     value={localCustomFilename}
                     onChange={(event) => {
                       setLocalCustomFilename(event.target.value);
                       onCustomFilenameChange?.(event.target.value);
                     }}
                     disabled={isExporting}
                     className="w-full rounded-xl border px-3 py-2 text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                     style={{ backgroundColor: uiTheme.inputBg, borderColor: rgba(themeColor, 0.24), color: uiTheme.text }}
                     placeholder={t('export.customFilenamePlaceholder')}
                   />
                 </div>
               )}
             </div>

             {/* Progress Section */}
             <div className="flex-1 flex flex-col">
               <div className="mb-4 flex items-center gap-2">
                 <Timer size={16} style={{ color: secondaryThemeColor }} />
                 <div className="text-sm font-medium">{t('export.progress')}</div>
               </div>

               <div className="rounded-2xl border p-3" style={{ borderColor: rgba(secondaryThemeColor, 0.18), backgroundColor: rgba(themeColor, isDarkMode ? 0.08 : 0.04) }}>
                 <div className="mb-2 flex items-center justify-between text-xs" style={{ color: uiTheme.textMuted }}>
                   <span>{progress?.stage || t('export.waiting')}</span>
                   <span style={{ color: secondaryThemeColor }}>{progressPercent}%</span>
                 </div>
                 <div className="h-3 overflow-hidden rounded-full" style={{ backgroundColor: rgba(themeColor, isDarkMode ? 0.2 : 0.1) }}>
                   <div
                     className="h-full rounded-full transition-all duration-300"
                     style={{ width: `${progressPercent}%`, background: `linear-gradient(90deg, ${themeColor} 0%, ${secondaryThemeColor} 100%)`, boxShadow: `0 0 18px ${rgba(secondaryThemeColor, 0.28)}` }}
                   />
                 </div>
                 <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                   <div className="rounded-xl border px-3 py-2" style={{ borderColor: uiTheme.border, backgroundColor: rgba(themeColor, isDarkMode ? 0.08 : 0.04) }}>
                     <div style={{ color: uiTheme.textMuted }}>{t('export.elapsed')}</div>
                     <div className="mt-1 font-mono text-sm">{formatDuration(progress?.elapsedMs || 0)}</div>
                   </div>
                   <div className="rounded-xl border px-3 py-2" style={{ borderColor: uiTheme.border, backgroundColor: rgba(secondaryThemeColor, isDarkMode ? 0.08 : 0.04) }}>
                     <div style={{ color: uiTheme.textMuted }}>{t('export.remaining')}</div>
                     <div className="mt-1 font-mono text-sm">{formatDuration(progress?.estimatedRemainingMs ?? null)}</div>
                   </div>
                 </div>
               </div>

                <div className="mt-4 min-w-0 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: rgba(secondaryThemeColor, 0.18), backgroundColor: rgba(secondaryThemeColor, isDarkMode ? 0.09 : 0.05), color: statusMessage ? uiTheme.text : uiTheme.textMuted }}>
                  <div className="max-h-36 overflow-auto whitespace-pre-wrap break-all pr-1">
                    {statusMessage || t('export.statusIdle')}
                  </div>
                  {isErrorStatus && (
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await copyToClipboard(statusMessage || '');
                          setCopySuccess(ok);
                          if (ok) {
                            window.setTimeout(() => setCopySuccess(false), 1200);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs border"
                        style={{ borderColor: `${secondaryThemeColor}55`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}12` }}
                      >
                        {copySuccess ? `${t('common.copy')} ✓` : t('common.copy')}
                      </button>
                    </div>
                  )}
                </div>

                 <div className="mt-3 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: rgba(themeColor, 0.16), backgroundColor: rgba(themeColor, isDarkMode ? 0.08 : 0.04), color: uiTheme.textMuted }}>
                   {t('export.previewDiffNotice')}
                 </div>

                {exportSucceeded && !isExporting && outputPath ? (
                 <button
                   type="button"
                   onClick={() => void onRevealOutput()}
                   className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-colors"
                   style={{ backgroundColor: rgba(secondaryThemeColor, 0.14), color: secondaryThemeColor, border: `1px solid ${rgba(secondaryThemeColor, 0.22)}` }}
                 >
                   <FolderOpen size={15} />
                   {t('export.openFolder')}
                 </button>
               ) : null}

               <div className="mt-5 flex gap-2">
                 <button
                   type="button"
                   onClick={onClose}
                   disabled={isExporting}
                   className="flex-1 rounded-2xl px-4 py-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                   style={{ backgroundColor: rgba(themeColor, isDarkMode ? 0.16 : 0.08), color: uiTheme.text, border: `1px solid ${uiTheme.border}` }}
                 >
                   {t('common.cancel')}
                 </button>
                 <button
                   type="button"
                   onClick={() => void onStartExport()}
                   disabled={isExporting}
                   className="flex-1 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition-transform disabled:cursor-not-allowed disabled:opacity-70"
                   style={{ background: `linear-gradient(135deg, ${themeColor} 0%, ${secondaryThemeColor} 100%)`, boxShadow: `0 16px 30px ${rgba(secondaryThemeColor, 0.25)}` }}
                 >
                   {isExporting ? t('export.exporting') : t('export.startButton')}
                 </button>
               </div>
             </div>
           </section>
        </div>
      </div>
    </div>
  );
}
