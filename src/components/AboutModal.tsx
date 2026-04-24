import { ExternalLink, GitBranch, RefreshCw, Sparkles, X } from 'lucide-react';
import { translate, type Language } from '../i18n';
import { createThemeTokens } from '../theme';

export type UpdateCheckResult = {
  ok: boolean;
  latestVersion?: string;
  currentVersion?: string;
  htmlUrl?: string;
  publishedAt?: string;
  hasUpdate?: boolean;
  error?: string;
};

interface AboutModalProps {
  isOpen: boolean;
  isDarkMode: boolean;
  language: Language;
  themeColor: string;
  secondaryThemeColor: string;
  onClose: () => void;
  onOpenGithub: () => void;
  onOpenWiki: () => void;
  onOpenReleases: () => void;
  onCheckUpdates: () => void;
  isCheckingUpdates: boolean;
  updateResult: UpdateCheckResult | null;
}

export function AboutModal({
  isOpen,
  isDarkMode,
  language,
  themeColor,
  secondaryThemeColor,
  onClose,
  onOpenGithub,
  onOpenWiki,
  onOpenReleases,
  onCheckUpdates,
  isCheckingUpdates,
  updateResult,
}: AboutModalProps) {
  const t = (key: string) => translate(language, key);
  const uiTheme = createThemeTokens(themeColor, isDarkMode);
  const updateErrorText = updateResult?.error || t('about.updateCheckFailedHint');
  const isGithubUnreachable = /failed to fetch|network|timeout|timed out|enotfound|econnrefused|fetch failed/i.test(updateErrorText);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[min(92vw,640px)] rounded-2xl border shadow-2xl overflow-hidden"
        style={{ backgroundColor: uiTheme.panelBg, borderColor: uiTheme.border, color: uiTheme.text }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b flex items-start justify-between" style={{ borderColor: uiTheme.border, background: `linear-gradient(135deg, ${secondaryThemeColor}18 0%, transparent 58%)` }}>
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded-full border" style={{ borderColor: `${secondaryThemeColor}44`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}10` }}>
              <Sparkles size={12} />
              {t('about.badge')}
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">PomChat Studio</h2>
              <p className="text-sm mt-1" style={{ color: uiTheme.textMuted }}>{t('about.tagline')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-lg border inline-flex items-center justify-center transition-colors"
            style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgElevated, color: uiTheme.textMuted }}
            title={t('settings.close')}
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border p-4" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.cardBg }}>
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: uiTheme.textMuted }}>{t('about.currentVersion')}</div>
              <div className="font-semibold">v{__APP_VERSION__}</div>
            </div>
            <div className="rounded-xl border p-4" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.cardBg }}>
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: uiTheme.textMuted }}>{t('about.platform')}</div>
              <div className="font-semibold">{window.electron ? 'Desktop (Electron)' : 'Web Preview'}</div>
            </div>
          </div>

          <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.cardBg }}>
            <div className="text-sm font-medium">{t('about.descriptionTitle')}</div>
            <p className="text-sm leading-6" style={{ color: uiTheme.textSoft }}>{t('about.description')}</p>
          </div>

          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.cardBg }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{t('about.updatesTitle')}</div>
                <div className="text-xs mt-1" style={{ color: uiTheme.textMuted }}>{t('about.updatesHint')}</div>
              </div>
              <button
                type="button"
                onClick={onCheckUpdates}
                disabled={isCheckingUpdates}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors disabled:opacity-60"
                style={{ borderColor: `${secondaryThemeColor}55`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}12` }}
              >
                <RefreshCw size={14} className={isCheckingUpdates ? 'animate-spin' : ''} />
                {isCheckingUpdates ? t('about.checkingUpdates') : t('about.checkUpdates')}
              </button>
            </div>

            {updateResult ? (
              <div className="rounded-lg border p-3 text-sm" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgElevated }}>
                {updateResult.ok ? (
                  <div className="space-y-1.5">
                    <div className="font-medium" style={{ color: updateResult.hasUpdate ? secondaryThemeColor : uiTheme.text }}>
                      {updateResult.hasUpdate ? t('about.updateAvailable') : t('about.upToDate')}
                    </div>
                    <div style={{ color: uiTheme.textSoft }}>{t('about.latestVersion')}: v{updateResult.latestVersion || __APP_VERSION__}</div>
                    {updateResult.publishedAt ? (
                      <div style={{ color: uiTheme.textMuted }}>{t('about.releaseDate')}: {new Date(updateResult.publishedAt).toLocaleDateString(language === 'zh-CN' ? 'zh-CN' : 'en-US')}</div>
                    ) : null}
                  </div>
                ) : (
                  <div>
                    <div className="font-medium text-red-500">{t('about.updateCheckFailed')}</div>
                    <div className="mt-1" style={{ color: uiTheme.textSoft }}>
                      {isGithubUnreachable ? '哼！哼！哼！啊啊啊啊啊啊啊啊啊啊啊啊连不上GitHub！！' : updateErrorText}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={onOpenGithub} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border transition-colors" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgElevated }}>
              <GitBranch size={16} />
              {t('about.githubRepo')}
            </button>
            <button type="button" onClick={onOpenWiki} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border transition-colors" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgElevated }}>
              <ExternalLink size={16} />
              {t('about.wikiPage')}
            </button>
            <button type="button" onClick={onOpenReleases} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border transition-colors" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgElevated }}>
              <ExternalLink size={16} />
              {t('about.releasePage')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
