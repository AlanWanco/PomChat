import { useEffect, useMemo, useState } from 'react';
import { Download, FolderOpen, Sparkles, Timer, X } from 'lucide-react';
import { translate, type Language } from '../i18n';
import { createThemeTokens, rgba } from '../theme';

interface ExportProgressState {
  progress: number;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  stage: string;
}

interface ExportModalProps {
  isOpen: boolean;
  isDarkMode: boolean;
  language: Language;
  themeColor: string;
  secondaryThemeColor: string;
  outputPath: string;
  runtimeDir: string;
  rangeStart: number;
  rangeEnd: number;
  defaultRangeStart: number;
  defaultRangeEnd: number;
  isExporting: boolean;
  progress: ExportProgressState | null;
  statusMessage: string | null;
  onClose: () => void;
  onOutputPathChange: (value: string) => void;
  onChoosePath: () => void | Promise<void>;
  onQuickSave: () => void;
  onRangeChange: (next: { start?: number; end?: number }) => void;
  onStartExport: () => void | Promise<void>;
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

export function ExportModal({
  isOpen,
  isDarkMode,
  language,
  themeColor,
  secondaryThemeColor,
  outputPath,
  runtimeDir,
  rangeStart,
  rangeEnd,
  defaultRangeStart,
  defaultRangeEnd,
  isExporting,
  progress,
  statusMessage,
  onClose,
  onOutputPathChange,
  onChoosePath,
  onQuickSave,
  onRangeChange,
  onStartExport
}: ExportModalProps) {
  const t = (key: string, vars?: Record<string, string | number>) => translate(language, key, vars);
  const uiTheme = createThemeTokens(themeColor, isDarkMode);
  const [startInput, setStartInput] = useState(formatTime(rangeStart));
  const [endInput, setEndInput] = useState(formatTime(rangeEnd));

  useEffect(() => {
    if (!isOpen) return;
    setStartInput(formatTime(rangeStart));
  }, [isOpen, rangeStart]);

  useEffect(() => {
    if (!isOpen) return;
    setEndInput(formatTime(rangeEnd));
  }, [isOpen, rangeEnd]);

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
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/55 backdrop-blur-sm px-4">
      <div
        className="w-full max-w-2xl overflow-hidden rounded-[28px] border shadow-2xl"
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

        <div className="grid gap-5 px-6 py-6 md:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <section className="rounded-2xl border p-4" style={{ borderColor: uiTheme.border, backgroundColor: rgba(themeColor, isDarkMode ? 0.08 : 0.04) }}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{t('export.path')}</div>
                  <div className="text-xs mt-1" style={{ color: uiTheme.textMuted }}>{t('export.pathHint')}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onChoosePath()}
                    disabled={isExporting}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ backgroundColor: rgba(themeColor, isDarkMode ? 0.16 : 0.08), border: `1px solid ${uiTheme.border}` }}
                  >
                    <FolderOpen size={13} />
                    {t('export.choosePath')}
                  </button>
                  <button
                    type="button"
                    onClick={onQuickSave}
                    disabled={isExporting}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
                {t('export.quickSaveHint')}: <span style={{ color: secondaryThemeColor }}>{runtimeDir || '--'}</span>
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
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: themeColor }}>{t('export.start')}</span>
                    <button
                      type="button"
                      onClick={() => onRangeChange({ start: defaultRangeStart })}
                      disabled={isExporting}
                      className="rounded-full px-2.5 py-1 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ backgroundColor: rgba(themeColor, 0.12), color: themeColor }}
                    >
                      {t('export.useEarliest')}
                    </button>
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
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: secondaryThemeColor }}>{t('export.end')}</span>
                    <button
                      type="button"
                      onClick={() => onRangeChange({ end: defaultRangeEnd })}
                      disabled={isExporting}
                      className="rounded-full px-2.5 py-1 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ backgroundColor: rgba(secondaryThemeColor, 0.12), color: secondaryThemeColor }}
                    >
                      {t('export.useLatest')}
                    </button>
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
          </div>

          <section className="rounded-[24px] border p-4" style={{ borderColor: uiTheme.border, background: `linear-gradient(180deg, ${rgba(secondaryThemeColor, isDarkMode ? 0.14 : 0.08)} 0%, ${uiTheme.panelBgSubtle} 100%)` }}>
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

            <div className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: rgba(secondaryThemeColor, 0.18), backgroundColor: rgba(secondaryThemeColor, isDarkMode ? 0.09 : 0.05), color: statusMessage ? uiTheme.text : uiTheme.textMuted }}>
              {statusMessage || t('export.statusIdle')}
            </div>

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
          </section>
        </div>
      </div>
    </div>
  );
}
