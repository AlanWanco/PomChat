import { FolderOpen, Plus, Clock, Settings, X } from 'lucide-react';
import { useState } from 'react';
import { translate, type Language } from '../../i18n';
import { createThemeTokens } from '../../theme';
import pomchatIconWhite from '../../../pomchat-icon-white.svg';

type CSSVarStyle = React.CSSProperties & {
  ['--pomchat-scrollbar-thumb']?: string;
  ['--pomchat-scrollbar-thumb-hover']?: string;
};

interface WelcomeScreenProps {
  onNewProject: () => void;
  onOpenProject: () => void;
  onOpenRecent?: (path: string) => void;
  onRemoveRecent?: (path: string) => void;
  onOpenSettings?: () => void;
  recentProject?: string | null;
  recentProjects?: string[];
  isDarkMode: boolean;
  language: Language;
  themeColor: string;
  secondaryThemeColor: string;
}

export function WelcomeScreen({ onNewProject, onOpenProject, onOpenRecent, onRemoveRecent, onOpenSettings, recentProject, recentProjects = [], isDarkMode, language, themeColor, secondaryThemeColor }: WelcomeScreenProps) {
  const t = (key: string) => translate(language, key);
  const uiTheme = createThemeTokens(themeColor, isDarkMode);
  const [hoveredCard, setHoveredCard] = useState<'new' | 'open' | null>(null);
  const [hoverLogo, setHoverLogo] = useState(false);
  const [logoShakeKey, setLogoShakeKey] = useState(0);

  return (
    <div
      className="w-full h-screen flex flex-col items-center justify-center overflow-y-auto px-6 py-16"
      style={{
        backgroundColor: isDarkMode ? uiTheme.appBg : uiTheme.panelBg,
        backgroundImage: `linear-gradient(180deg, transparent 0%, transparent 74%, ${secondaryThemeColor}${isDarkMode ? '14' : '0A'} 100%)`,
        color: uiTheme.text,
        ['--pomchat-scrollbar-thumb']: `${secondaryThemeColor}44`,
        ['--pomchat-scrollbar-thumb-hover']: `${secondaryThemeColor}66`
      } as CSSVarStyle}
    >
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          className="absolute top-6 right-6 flex items-center gap-2 px-4 py-2 rounded-full border transition-colors"
          style={{ borderColor: `${secondaryThemeColor}66`, color: secondaryThemeColor, backgroundColor: uiTheme.panelBg }}
        >
          <Settings size={16} />
          {translate(language, 'menu.settings')}
        </button>
      )}
      <div className="mb-12 mt-6 flex flex-col items-center">
        <button
          type="button"
          className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 transition-colors cursor-pointer"
          onMouseEnter={() => setHoverLogo(true)}
          onMouseLeave={() => setHoverLogo(false)}
          onClick={() => setLogoShakeKey((prev) => prev + 1)}
          style={{ backgroundColor: hoverLogo ? secondaryThemeColor : themeColor, boxShadow: '0 8px 18px rgba(0,0,0,0.12)' }}
        >
          <img
            key={logoShakeKey}
            src={pomchatIconWhite}
            alt="PomChat logo"
            className="w-10 h-10 object-contain"
            style={{ animation: 'pomchat-logo-wiggle 560ms cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        </button>
        <h1 className="text-4xl font-bold mb-3 tracking-tight">PomChat Studio</h1>
        <div className="mb-2 text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: `${secondaryThemeColor}44`, color: uiTheme.textMuted, backgroundColor: `${secondaryThemeColor}${isDarkMode ? '12' : '0E'}` }}>
          v{__APP_VERSION__}
        </div>
        <p className={`text-lg ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          {t('welcome.tagline')}
        </p>
      </div>

      <div className="flex flex-col gap-6 max-w-2xl w-full px-8 shrink-0">
        <div className="flex gap-6 w-full">
          <button 
            onClick={onNewProject}
            onMouseEnter={() => setHoveredCard('new')}
            onMouseLeave={() => setHoveredCard(null)}
            className="flex-1 flex flex-col items-center p-8 rounded-2xl border-2 transition-all duration-300 group shadow-lg"
            style={hoveredCard === 'new'
              ? { borderColor: `${secondaryThemeColor}66`, backgroundColor: `${secondaryThemeColor}${isDarkMode ? '12' : '10'}`, boxShadow: `0 6px 16px ${secondaryThemeColor}22` }
              : { borderColor: uiTheme.border, backgroundColor: uiTheme.cardBg, boxShadow: `0 4px 12px ${secondaryThemeColor}18` }}
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6 transition-transform group-hover:scale-110" style={hoveredCard === 'new' ? { color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}${isDarkMode ? '1A' : '16'}` } : { color: themeColor, backgroundColor: uiTheme.panelBgSubtle }}>
              <Plus size={28} />
            </div>
            <h2 className="text-xl font-semibold mb-2">{t('welcome.new')}</h2>
            <p className={`text-sm text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('welcome.newDesc')}
            </p>
          </button>

          <button 
            onClick={onOpenProject}
            onMouseEnter={() => setHoveredCard('open')}
            onMouseLeave={() => setHoveredCard(null)}
            className="flex-1 flex flex-col items-center p-8 rounded-2xl border-2 transition-all duration-300 group shadow-lg"
            style={hoveredCard === 'open'
              ? { borderColor: `${secondaryThemeColor}66`, backgroundColor: `${secondaryThemeColor}${isDarkMode ? '12' : '10'}`, boxShadow: `0 6px 16px ${secondaryThemeColor}22` }
              : { borderColor: uiTheme.border, backgroundColor: uiTheme.cardBg, boxShadow: `0 4px 12px ${secondaryThemeColor}18` }}
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6 transition-transform group-hover:scale-110" style={hoveredCard === 'open' ? { color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}${isDarkMode ? '1A' : '16'}` } : { color: themeColor, backgroundColor: uiTheme.panelBgSubtle }}>
              <FolderOpen size={28} />
            </div>
            <h2 className="text-xl font-semibold mb-2">{t('welcome.open')}</h2>
            <p className={`text-sm text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('welcome.openDesc')}
            </p>
          </button>
        </div>

        {(recentProjects.length > 0 || recentProject) && onOpenRecent && (
          <div className="mt-4 min-h-0">
            <h3 className={`text-sm font-medium mb-3 ml-2`} style={{ color: uiTheme.textMuted }}>{t('welcome.recent')}</h3>
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {(recentProjects.length > 0 ? recentProjects : recentProject ? [recentProject] : []).slice(0, 10).map((path, index) => (
                <button 
                  key={`${path}-${index}`}
                  onClick={() => onOpenRecent(path)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 group shadow-sm hover:-translate-y-0.5"
                  style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgElevated, boxShadow: `0 4px 12px ${secondaryThemeColor}14` }}
                >
                  <div className="p-2 rounded-lg" style={{ backgroundColor: uiTheme.panelBgSubtle }}>
                    <Clock size={20} style={{ color: secondaryThemeColor }} />
                  </div>
                  <div className="flex flex-col items-start overflow-hidden flex-1">
                    <span className="font-medium text-sm">{index === 0 ? t('welcome.resume') : t('welcome.open')}</span>
                    <span style={{ color: uiTheme.textSoft }} className="text-xs truncate w-full text-left mt-0.5" title={path}>
                      {path}
                    </span>
                  </div>
                  {onRemoveRecent && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveRecent(path);
                      }}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md"
                      style={{ color: uiTheme.textMuted, backgroundColor: uiTheme.panelBgSubtle }}
                      title={translate(language, 'common.close')}
                    >
                      <X size={14} />
                    </button>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {!window.electron && (
        <div className="mt-12 max-w-2xl px-4 py-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl text-sm flex items-start gap-3">
          <span className="mt-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
          <div className="space-y-1">
            <div className="font-semibold">PomChat Web Preview</div>
            <div>{t('welcome.webMode')}</div>
          </div>
        </div>
      )}
    </div>
  );
}
