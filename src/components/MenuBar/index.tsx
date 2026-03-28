import React, { useState } from 'react';
import { Save, FolderOpen, Plus, Download, ChevronDown, Music, Subtitles, XCircle } from 'lucide-react';
import { translate, type Language } from '../../i18n';
import { createThemeTokens } from '../../theme';

interface MenuBarProps {
  isDarkMode: boolean;
  language: Language;
  themeColor: string;
  secondaryThemeColor: string;
  projectPath: string | null;
  assPath?: string;
  shouldHideSidePanels?: boolean;
  projectName: string;
  onNewProject: () => void;
  onOpenProject: () => void;
  onSaveProject: () => void;
  onSetAudio: () => void;
  onSetSubtitle: () => void;
  onAddSubtitle: () => void;
  onImportPresets: () => void;
  onExportPresets: () => void;
  onSortSubtitles: () => void;
  onCloseProject: () => void;
  onExportVideo: () => void;
  onExportConfig: () => void;
}

export function MenuBar({
  isDarkMode,
  language,
  themeColor,
  secondaryThemeColor,
  projectPath,
  assPath,
  shouldHideSidePanels,
  onNewProject,
  onOpenProject,
  onSaveProject,
  onSetAudio,
  onSetSubtitle,
  onAddSubtitle,
  onImportPresets,
  onExportPresets,
  onSortSubtitles,
  onCloseProject,
  onExportVideo,
  onExportConfig
}: MenuBarProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const t = (key: string) => translate(language, key);
  const uiTheme = createThemeTokens(themeColor, isDarkMode);

  const textClass = isDarkMode ? 'text-gray-300' : 'text-gray-600';
  const hoverClass = isDarkMode ? 'hover:text-white' : 'hover:text-gray-900';
  const activeMenuStyle = { backgroundColor: uiTheme.accentSoft, color: uiTheme.text, border: `1px solid ${uiTheme.accentBorder}` };

  // Handle click outside to close menus
  React.useEffect(() => {
    const handleClickOutside = () => setActiveMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const toggleMenu = (e: React.MouseEvent, menu: string) => {
    e.stopPropagation();
    setActiveMenu(activeMenu === menu ? null : menu);
  };

  const executeAction = (action: () => void) => {
    setActiveMenu(null);
    action();
  };

  return (
    <div className={`h-10 border-b flex items-center justify-between px-2 shrink-0 z-50 relative ${textClass}`} style={{ backgroundColor: uiTheme.toolbarBg, borderColor: uiTheme.border }}>
      <div className="flex items-center gap-1">
        {/* App Title */}
        <div className="font-bold px-3 py-1 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: secondaryThemeColor }}></span>
          PodChat Studio
        </div>

        {/* File Menu */}
        <div className="relative">
          <button 
            onClick={(e) => toggleMenu(e, 'file')}
            className={`px-3 py-1 text-sm rounded transition-colors ${activeMenu === 'file' ? '' : hoverClass}`}
            onMouseEnter={(e) => { if (activeMenu !== 'file') (e.currentTarget.style.backgroundColor = uiTheme.hoverBg); }}
            onMouseLeave={(e) => { if (activeMenu !== 'file') e.currentTarget.style.backgroundColor = 'transparent'; }}
            style={activeMenu === 'file' ? activeMenuStyle : undefined}
          >
            {t('menu.file')}
          </button>
          
          {activeMenu === 'file' && (
            <div className="absolute top-full left-0 mt-1 w-48 rounded shadow-xl border py-1 z-50" style={{ backgroundColor: uiTheme.panelBgElevated, borderColor: uiTheme.border }}>
              <button onClick={() => executeAction(onNewProject)} className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${hoverClass}`}>
                <Plus size={14} /> {t('menu.newProject')}
              </button>
              <button onClick={() => executeAction(onOpenProject)} className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${hoverClass}`}>
                <FolderOpen size={14} /> {t('menu.openProject')}
              </button>
              <div className={`my-1 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}></div>
              <button 
                onClick={() => executeAction(onSetAudio)} 
                disabled={!projectPath}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${hoverClass} ${!projectPath && 'opacity-50 cursor-not-allowed'}`}
              >
                <Music size={14} /> {t('menu.importAudio')}
              </button>
              <button 
                onClick={() => executeAction(onSetSubtitle)} 
                disabled={!projectPath}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${hoverClass} ${!projectPath && 'opacity-50 cursor-not-allowed'}`}
              >
                <Subtitles size={14} /> {t('menu.importSubtitle')}
              </button>
              <div className={`my-1 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}></div>
              <button 
                onClick={() => executeAction(onSaveProject)} 
                disabled={!projectPath}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${hoverClass} ${!projectPath && 'opacity-50 cursor-not-allowed'}`}
              >
                <Save size={14} /> {t('menu.saveProject')}
              </button>
              <button 
                onClick={() => executeAction(onCloseProject)} 
                disabled={!projectPath}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 text-red-500 hover:bg-red-500/10 ${!projectPath && 'opacity-50 cursor-not-allowed'}`}
              >
                <XCircle size={14} /> {t('menu.closeProject')}
              </button>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={(e) => toggleMenu(e, 'subtitle')}
            className={`px-3 py-1 text-sm rounded transition-colors ${activeMenu === 'subtitle' ? '' : hoverClass}`}
            onMouseEnter={(e) => { if (activeMenu !== 'subtitle') (e.currentTarget.style.backgroundColor = uiTheme.hoverBg); }}
            onMouseLeave={(e) => { if (activeMenu !== 'subtitle') e.currentTarget.style.backgroundColor = 'transparent'; }}
            style={activeMenu === 'subtitle' ? activeMenuStyle : undefined}
          >
            {t('menu.subtitle')}
          </button>

          {activeMenu === 'subtitle' && (
            <div className="absolute top-full left-0 mt-1 w-56 rounded shadow-xl border py-1 z-50" style={{ backgroundColor: uiTheme.panelBgElevated, borderColor: uiTheme.border }}>
              <button
                onClick={() => executeAction(onAddSubtitle)}
                disabled={!projectPath}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${hoverClass} ${!projectPath && 'opacity-50 cursor-not-allowed'}`}
              >
                <Plus size={14} /> {t('menu.addSubtitle')}
              </button>
              <button
                onClick={() => executeAction(onImportPresets)}
                disabled={!projectPath}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${hoverClass} ${!projectPath && 'opacity-50 cursor-not-allowed'}`}
              >
                <FolderOpen size={14} /> {t('menu.importPresets')}
              </button>
              <button
                onClick={() => executeAction(onExportPresets)}
                disabled={!projectPath}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${hoverClass} ${!projectPath && 'opacity-50 cursor-not-allowed'}`}
              >
                <Download size={14} /> {t('menu.exportPresets')}
              </button>
              <button
                onClick={() => executeAction(onSortSubtitles)}
                disabled={!projectPath}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${hoverClass} ${!projectPath && 'opacity-50 cursor-not-allowed'}`}
              >
                <Subtitles size={14} /> {t('menu.sortSubtitles')}
              </button>
            </div>
          )}
        </div>

        {/* Export Menu */}
        <div className="relative">
          <button 
            onClick={(e) => toggleMenu(e, 'export')}
            className={`px-3 py-1 text-sm rounded transition-colors flex items-center gap-1 ${activeMenu === 'export' ? '' : hoverClass}`}
            onMouseEnter={(e) => { if (activeMenu !== 'export') (e.currentTarget.style.backgroundColor = uiTheme.hoverBg); }}
            onMouseLeave={(e) => { if (activeMenu !== 'export') e.currentTarget.style.backgroundColor = 'transparent'; }}
            style={activeMenu === 'export' ? activeMenuStyle : undefined}
          >
            {t('menu.export')} <ChevronDown size={12} />
          </button>
          
          {activeMenu === 'export' && (
            <div className="absolute top-full left-0 mt-1 w-48 rounded shadow-xl border py-1 z-50" style={{ backgroundColor: uiTheme.panelBgElevated, borderColor: uiTheme.border }}>
              <button onClick={() => executeAction(onExportConfig)} className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${hoverClass}`}>
                <Download size={14} /> {t('menu.exportConfig')}
              </button>
              <button onClick={() => executeAction(onExportVideo)} className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${hoverClass}`} style={{ color: secondaryThemeColor }}>
                <Download size={14} /> <span>{t('menu.exportVideo')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Center Display - Project Path */}
      {!shouldHideSidePanels && (assPath || projectPath) && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-w-[40%] px-4 pointer-events-none">
          <div 
            className="text-xs truncate text-center"
            style={{ color: secondaryThemeColor }}
            title={assPath || projectPath || ''}
          >
            {assPath || projectPath}
          </div>
        </div>
      )}
    </div>
  );
}
