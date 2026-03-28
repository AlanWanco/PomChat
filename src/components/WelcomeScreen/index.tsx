import { FolderOpen, Plus, FileVideo, Clock, Settings } from 'lucide-react';
import { useState } from 'react';
import { translate, type Language } from '../../i18n';
import { createThemeTokens } from '../../theme';

interface WelcomeScreenProps {
  onNewProject: () => void;
  onOpenProject: () => void;
  onOpenRecent?: () => void;
  onOpenSettings?: () => void;
  recentProject?: string | null;
  isDarkMode: boolean;
  language: Language;
  themeColor: string;
  secondaryThemeColor: string;
}

export function WelcomeScreen({ onNewProject, onOpenProject, onOpenRecent, onOpenSettings, recentProject, isDarkMode, language, themeColor, secondaryThemeColor }: WelcomeScreenProps) {
  const t = (key: string) => translate(language, key);
  const uiTheme = createThemeTokens(themeColor, isDarkMode);
  const [hoveredCard, setHoveredCard] = useState<'new' | 'open' | null>(null);
  const [hoverLogo, setHoverLogo] = useState(false);

  return (
    <div
      className="w-full h-screen flex flex-col items-center justify-center"
      style={{
        backgroundColor: isDarkMode ? uiTheme.appBg : uiTheme.panelBg,
        backgroundImage: `linear-gradient(180deg, transparent 0%, transparent 74%, ${secondaryThemeColor}${isDarkMode ? '14' : '0A'} 100%)`,
        color: uiTheme.text,
        ['--podchat-scrollbar-thumb' as any]: `${secondaryThemeColor}44`,
        ['--podchat-scrollbar-thumb-hover' as any]: `${secondaryThemeColor}66`
      }}
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
      <div className="mb-12 flex flex-col items-center">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 transition-colors" onMouseEnter={() => setHoverLogo(true)} onMouseLeave={() => setHoverLogo(false)} style={{ backgroundColor: hoverLogo ? secondaryThemeColor : themeColor, boxShadow: '0 8px 18px rgba(0,0,0,0.12)' }}>
          <FileVideo size={40} className="text-white" />
        </div>
        <h1 className="text-4xl font-bold mb-3 tracking-tight">PodChat Studio</h1>
        <p className={`text-lg ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          {t('welcome.tagline')}
        </p>
      </div>

      <div className="flex flex-col gap-6 max-w-2xl w-full px-8">
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

        {recentProject && onOpenRecent && (
          <div className="mt-4">
            <h3 className={`text-sm font-medium mb-3 ml-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('welcome.recent')}</h3>
             <button 
               onClick={onOpenRecent}
               className="w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 group shadow-sm hover:-translate-y-0.5"
               style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgElevated, boxShadow: `0 4px 12px ${secondaryThemeColor}14` }}
              >
              <div className="p-2 rounded-lg" style={{ backgroundColor: uiTheme.panelBgSubtle }}>
                <Clock size={20} style={{ color: secondaryThemeColor }} />
              </div>
              <div className="flex flex-col items-start overflow-hidden flex-1">
                <span className="font-medium text-sm">{t('welcome.resume')}</span>
                <span className={`text-xs truncate w-full text-left mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} title={recentProject}>
                  {recentProject}
                </span>
              </div>
            </button>
          </div>
        )}
      </div>
      
      {!window.electron && (
        <div className="mt-12 px-4 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-lg text-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
          {t('welcome.webMode')}
        </div>
      )}
    </div>
  );
}
