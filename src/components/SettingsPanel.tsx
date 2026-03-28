import { useState, useEffect } from 'react';
import { Settings, Image as ImageIcon, Users, Save, Moon, Sun, Trash2, Plus, X, ArrowLeftRight, LayoutTemplate, Type, Box, Layout, FolderOpen } from 'lucide-react';
import { translate, type Language } from '../i18n';
import { createThemeTokens } from '../theme';

const SYSTEM_FONT_OPTIONS = [
  'system-ui',
  '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  'ui-sans-serif, system-ui, sans-serif',
  '"SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif',
  '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
  '"Helvetica Neue", Helvetica, Arial, sans-serif',
  'Arial, sans-serif',
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  '"Noto Sans SC", "PingFang SC", sans-serif',
  'Georgia, serif',
  '"Times New Roman", Times, serif',
  'ui-serif, Georgia, serif',
  'ui-monospace, "SFMono-Regular", Menlo, monospace',
  '"JetBrains Mono", "SFMono-Regular", Menlo, monospace'
];

interface SettingsPanelProps {
  config: any;
  onConfigChange: (newConfig: any) => void;
  isDarkMode: boolean;
  language: Language;
  themeColor: string;
  secondaryThemeColor: string;
  onThemeColorChange: (color: string) => void;
  onSecondaryThemeColorChange: (color: string) => void;
  onLanguageChange: (language: Language) => void;
  onThemeChange: (isDark: boolean) => void;
  settingsPosition: 'left' | 'right';
  onPositionChange: (pos: 'left' | 'right') => void;
  onClose: () => void;
  onSave: () => void;
  showToast: (msg: string) => void;
  activeTab: 'global' | 'project' | 'speakers' | 'annotation';
  setActiveTab: (tab: 'global' | 'project' | 'speakers' | 'annotation') => void;
  onSelectImage?: () => Promise<string | null>;
}

export function SettingsPanel({ 
  config, onConfigChange, 
  isDarkMode, language, themeColor, secondaryThemeColor, onThemeColorChange, onSecondaryThemeColorChange, onLanguageChange, onThemeChange, 
  settingsPosition, onPositionChange,
  onClose, onSave, showToast, activeTab, setActiveTab,
  onSelectImage
}: SettingsPanelProps) {
  const t = (key: string, vars?: Record<string, string | number>) => translate(language, key, vars);
  const uiTheme = createThemeTokens(themeColor, isDarkMode);
  const resolveLocalPreviewPath = (path: string | undefined) => {
    if (!path) return path;
    if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
    if (path.startsWith('file://')) return `/@fs${path.replace(/^file:\/\/?/, '/')}`;
    if (/^[a-zA-Z]:[\\/]/.test(path)) return `/@fs/${path.replace(/\\/g, '/')}`;
    if (path.startsWith('/') && !path.startsWith('/projects/') && !path.startsWith('/assets/')) return `/@fs${path}`;
    return path.startsWith('/') ? path : `/${path}`;
  };
  const [presets, setPresets] = useState<Record<string, any>>(() => {
    const saved = localStorage.getItem('podchat_presets');
    return saved ? JSON.parse(saved) : {};
  });
  const [presetPromptKey, setPresetPromptKey] = useState<string | null>(null);
  const [presetNameInput, setPresetNameInput] = useState("");
  const [activeSpeakerTab, setActiveSpeakerTab] = useState<string | null>(null);

  useEffect(() => {
    if (config.speakers) {
      const keys = Object.keys(config.speakers).filter((key) => config.speakers[key]?.type !== 'annotation');
      if (keys.length > 0 && (!activeSpeakerTab || !keys.includes(activeSpeakerTab))) {
        setActiveSpeakerTab(keys[0]);
      }
    }
  }, [config.speakers, activeSpeakerTab]);

  useEffect(() => {
    const handlePresetsUpdate = () => {
      const saved = localStorage.getItem('podchat_presets');
      if (saved) setPresets(JSON.parse(saved));
    };
    window.addEventListener('podchat_presets_updated', handlePresetsUpdate);
    return () => window.removeEventListener('podchat_presets_updated', handlePresetsUpdate);
  }, []);


  const updateConfig = (key: string, value: any) => {
    onConfigChange({ ...config, [key]: value });
  };

  const updateBackground = (key: string, value: any) => {
    onConfigChange({
      ...config,
      background: { ...config.background, [key]: value }
    });
  };

  const updateChatLayout = (key: string, value: any) => {
    onConfigChange({
      ...config,
      chatLayout: { ...config.chatLayout, [key]: value }
    });
  };

  const updateSpeakerStyle = (speakerKey: string, styleKey: string, value: any) => {
    const newSpeakers = { ...config.speakers };
    newSpeakers[speakerKey] = { ...newSpeakers[speakerKey] };
    newSpeakers[speakerKey].style = { ...(newSpeakers[speakerKey].style || {}) };
    newSpeakers[speakerKey].style[styleKey] = value;
    updateConfig('speakers', newSpeakers);
  };

  const updateSpeaker = (speakerKey: string, updater: (speaker: any) => any) => {
    const newSpeakers = { ...config.speakers };
    const currentSpeaker = newSpeakers[speakerKey];
    if (!currentSpeaker) return;

    newSpeakers[speakerKey] = updater({
      ...currentSpeaker,
      style: { ...(currentSpeaker.style || {}) }
    });

    updateConfig('speakers', newSpeakers);
  };

  const applyAvatarBorderColorToAll = (value: string) => {
    const newSpeakers = { ...config.speakers };
    Object.keys(newSpeakers).forEach((speakerKey) => {
      newSpeakers[speakerKey] = { ...newSpeakers[speakerKey] };
      newSpeakers[speakerKey].style = { ...(newSpeakers[speakerKey].style || {}) };
      newSpeakers[speakerKey].style.avatarBorderColor = value;
    });
    updateConfig('speakers', newSpeakers);
  };

  const handleAddSpeaker = () => {
    const keys = Object.keys(config.speakers);
    const nextId = String.fromCharCode(65 + keys.length);
    let newId = nextId;
    let counter = 1;
    while(config.speakers[newId]) {
      newId = `${nextId}${counter}`;
      counter++;
    }
    const newSpeakers = { 
      ...config.speakers, 
      [newId]: { 
        name: `${t('speakers.add')} ${newId}`, 
        avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${newId}`, 
        side: "left", 
        style: { bgColor: "#6b7280", textColor: "#ffffff", nameColor: "#ffffff", borderRadius: 28, opacity: 0.9, borderWidth: 0, avatarBorderColor: "#ffffff", borderColor: "#ffffff", borderOpacity: 1.0, margin: 14, paddingX: 20, paddingY: 12, shadowSize: 7, fontFamily: 'system-ui', fontSize: 30, fontWeight: 'normal' }
      } 
    };
    updateConfig('speakers', newSpeakers);
  };

  const handleRemoveSpeaker = (key: string) => {
    if (Object.keys(config.speakers).length <= 1) return;
    const newSpeakers = { ...config.speakers };
    delete newSpeakers[key];
    updateConfig('speakers', newSpeakers);
  };

  const normalizePresetPayload = (preset: any) => {
    if (preset && typeof preset === 'object' && 'style' in preset) {
      return preset;
    }

    return {
      style: preset || {},
      avatar: '',
      side: 'left'
    };
  };

  const buildPresetPayload = (speaker: any) => ({
    style: JSON.parse(JSON.stringify(speaker.style || {})),
    avatar: speaker.avatar || '',
    side: speaker.side || 'left'
  });

  const handleRemovePreset = (presetName: string) => {
    if (!presetName) return;
    const existingStr = localStorage.getItem('podchat_presets');
    if (!existingStr) return;
    
    const existing = JSON.parse(existingStr);
    delete existing[presetName];
    localStorage.setItem('podchat_presets', JSON.stringify(existing));
    
    // Auto unbind from speakers using this preset
    const newSpeakers = { ...config.speakers };
    let changed = false;
    Object.keys(newSpeakers).forEach(k => {
      if (newSpeakers[k].preset === presetName) {
        newSpeakers[k].preset = "";
        changed = true;
      }
    });
    if (changed) updateConfig('speakers', newSpeakers);
    
    window.dispatchEvent(new Event('podchat_presets_updated'));
    showToast(`Preset "${presetName}" removed`);
  };

  const bgClass = 'text-gray-700';
  const headerClass = '';
  const inputClass = 'text-sm focus:outline-none';
  const themedRangeStyle = { accentColor: themeColor } as React.CSSProperties;
  const inputSurfaceStyle = { backgroundColor: uiTheme.inputBg, borderColor: uiTheme.border, color: uiTheme.text } as React.CSSProperties;
  const THEME_COLOR_OPTIONS = [
    ['#545454', t('themeColor.pianoBlack')],
    ['#ed7e96', t('themeColor.lightPink')],
    ['#e7d600', t('themeColor.pastelYellow')],
    ['#01b7ee', t('themeColor.lightBlue')],
    ['#485ec6', t('themeColor.royalBlue')],
    ['#ff5800', t('themeColor.superOrange')],
    ['#a764a1', t('themeColor.sumirePurple')],
    ['#d71c30', t('themeColor.scarletRed')],
    ['#83c36e', t('themeColor.lightGreen')],
    ['#9ca4b8', t('themeColor.paperWhite')],
    ['#36b583', t('themeColor.jadeGreen')],
    ['#aaa898', t('themeColor.platinumSilver')],
    ['#f8c9c4', t('themeColor.pinkGold')]
  ] as const;

  const renderColorInput = (value: string, onChange: (value: string) => void) => (
    <div className="flex items-center gap-2 rounded px-2 py-1.5" style={{ backgroundColor: uiTheme.panelBgSubtle }}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent shrink-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-md shadow-sm"
      />
      <input
        type="text"
        value={value.toUpperCase()}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(next)) {
            onChange(next.toUpperCase());
          }
        }}
        placeholder="#RRGGBB"
        className={`w-full rounded border px-2 py-1 text-[11px] font-mono focus:outline-none ${inputClass}`}
      />
    </div>
  );

  return (
    <div className={`h-full flex flex-col overflow-hidden ${bgClass}`} style={{ backgroundColor: uiTheme.panelBg, color: uiTheme.textMuted, borderColor: uiTheme.border }}>
      <div className={`p-4 border-b flex items-center justify-between shrink-0 ${headerClass}`} style={{ backgroundColor: uiTheme.panelBgElevated, borderColor: uiTheme.border, color: uiTheme.text }}>
        <h2 className="font-bold flex items-center gap-2 text-sm">
          <Settings size={16} /> {t('settings.title')}
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={onSave} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors text-sm font-medium" style={{ color: '#fff', backgroundColor: secondaryThemeColor, boxShadow: '0 4px 10px rgba(0,0,0,0.12)' }} title={t('settings.save')}>
            <Save size={15} />
            {t('settings.save')}
          </button>
          <button onClick={onClose} className="p-1.5 rounded-md transition-colors" style={{ color: uiTheme.textMuted }} title={t('settings.close')}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex border-b shrink-0" style={{ backgroundColor: uiTheme.panelBgSubtle, borderColor: uiTheme.border }}>
        <button
          className={`flex-1 py-2 font-medium transition-colors text-sm ${activeTab === 'global' ? 'border-b-2' : ''}`}
          style={activeTab === 'global' ? { borderColor: themeColor, color: uiTheme.text } : { color: uiTheme.textSoft }}
          onClick={() => setActiveTab('global')}
        >
          {t('tab.global')}
        </button>
        <button
          className={`flex-1 py-2 font-medium transition-colors text-sm ${activeTab === 'project' ? 'border-b-2' : ''}`}
          style={activeTab === 'project' ? { borderColor: themeColor, color: uiTheme.text } : { color: uiTheme.textSoft }}
          onClick={() => setActiveTab('project')}
        >
          {t('tab.project')}
        </button>
        <button 
          className={`flex-1 py-2 font-medium transition-colors text-sm ${activeTab === 'speakers' ? 'border-b-2' : ''}`}
          style={activeTab === 'speakers' ? { borderColor: themeColor, color: uiTheme.text } : { color: uiTheme.textSoft }}
          onClick={() => setActiveTab('speakers')}
        >
          {t('tab.speakers')}
        </button>
        <button 
          className={`flex-1 py-2 font-medium transition-colors text-sm ${activeTab === 'annotation' ? 'border-b-2' : ''}`}
          style={activeTab === 'annotation' ? { borderColor: secondaryThemeColor, color: uiTheme.text } : { color: uiTheme.textSoft }}
          onClick={() => setActiveTab('annotation')}
        >
          {t('tab.annotation')}
        </button>
      </div>

      <div className={`flex-1 overflow-y-auto custom-scrollbar ${activeTab === 'speakers' ? 'px-4 pb-4 pt-0' : 'p-4'}`}>
        {activeTab === 'global' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-wider opacity-70">{t('global.language')}</label>
              <select
                value={language}
                onChange={(e) => onLanguageChange(e.target.value as Language)}
                className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`}
                style={inputSurfaceStyle}
              >
                <option value="zh-CN">{t('language.zh-CN')}</option>
                <option value="en">{t('language.en')}</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-wider opacity-70">{t('global.theme')}</label>
              <div className="flex rounded-lg p-1" style={{ backgroundColor: uiTheme.panelBgSubtle }}>
                <button 
                  onClick={() => onThemeChange(false)}
                  className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm transition-colors"
                  style={!isDarkMode ? { color: themeColor, backgroundColor: uiTheme.panelBg, boxShadow: `0 4px 10px ${uiTheme.shadow}` } : { color: uiTheme.textSoft }}
                >
                  <Sun size={14} /> {t('theme.light')}
                </button>
                <button 
                  onClick={() => onThemeChange(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm transition-colors"
                  style={isDarkMode ? { backgroundColor: uiTheme.panelBg, color: uiTheme.text, boxShadow: `0 4px 10px ${uiTheme.shadow}` } : { color: uiTheme.textSoft }}
                >
                  <Moon size={14} /> {t('theme.dark')}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-wider opacity-70">{t('global.themeColor')}</label>
              <select
                value={themeColor}
                onChange={(e) => onThemeColorChange(e.target.value)}
                className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`}
                style={inputSurfaceStyle}
              >
                {THEME_COLOR_OPTIONS.map(([color, label]) => (
                  <option key={color} value={color}>{label}</option>
                ))}
              </select>
              <div className="flex items-center gap-2 text-xs opacity-70">
                <span className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: themeColor }} />
                <span className="font-mono">{themeColor.toUpperCase()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-wider opacity-70">{t('global.secondaryThemeColor')}</label>
              <select
                value={secondaryThemeColor}
                onChange={(e) => onSecondaryThemeColorChange(e.target.value)}
                className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`}
                style={inputSurfaceStyle}
              >
                {THEME_COLOR_OPTIONS.map(([color, label]) => (
                  <option key={color} value={color}>{label}</option>
                ))}
              </select>
              <div className="flex items-center gap-2 text-xs opacity-70">
                <span className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: secondaryThemeColor }} />
                <span className="font-mono">{secondaryThemeColor.toUpperCase()}</span>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const nextPrimary = secondaryThemeColor;
                    const nextSecondary = themeColor;
                    onThemeColorChange(nextPrimary);
                    onSecondaryThemeColorChange(nextSecondary);
                  }}
                  className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                  style={{ backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.text, border: `1px solid ${uiTheme.border}` }}
                >
                  {t('global.swapThemeColors')}
                </button>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-wider opacity-70">{t('global.position')}</label>
              <div className="flex rounded-lg p-1" style={{ backgroundColor: uiTheme.panelBgSubtle }}>
                <button 
                  onClick={() => onPositionChange('left')}
                  className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm transition-colors"
                  style={settingsPosition === 'left' ? { backgroundColor: uiTheme.panelBg, color: isDarkMode ? uiTheme.text : themeColor, boxShadow: `0 4px 10px ${uiTheme.shadow}` } : { color: uiTheme.textSoft }}
                >
                  <ArrowLeftRight size={14} /> {t('global.position.left')}
                </button>
                <button 
                  onClick={() => onPositionChange('right')}
                  className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm transition-colors"
                  style={settingsPosition === 'right' ? { backgroundColor: uiTheme.panelBg, color: isDarkMode ? uiTheme.text : themeColor, boxShadow: `0 4px 10px ${uiTheme.shadow}` } : { color: uiTheme.textSoft }}
                >
                  <ArrowLeftRight size={14} /> {t('global.position.right')}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'project' && (
          <div className="space-y-6">
            
            {/* Resolution/Layout */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium border-b pb-1" style={{ borderColor: uiTheme.border, color: uiTheme.text }}>
                <LayoutTemplate size={14} /> {t('project.layout')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5 col-span-2">
                  <span className="text-xs opacity-70">{t('project.fps')}</span>
                  <input 
                    type="number" 
                    value={config.fps || 60}
                    onChange={(e) => updateConfig('fps', parseInt(e.target.value))}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`} 
                    style={inputSurfaceStyle}
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs opacity-70">{t('project.width')}</span>
                  <input 
                    type="number" 
                    value={config.dimensions?.width || 1920}
                    onChange={(e) => updateConfig('dimensions', { ...config.dimensions, width: parseInt(e.target.value) })}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`} 
                    style={inputSurfaceStyle}
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs opacity-70">{t('project.height')}</span>
                  <input 
                    type="number" 
                    value={config.dimensions?.height || 1080}
                    onChange={(e) => updateConfig('dimensions', { ...config.dimensions, height: parseInt(e.target.value) })}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`} 
                    style={inputSurfaceStyle}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <span className="text-xs opacity-70">{t('project.topLimit')}</span>
                  <input 
                    type="number" 
                    value={config.chatLayout?.paddingTop || 48}
                    onChange={(e) => updateChatLayout('paddingTop', parseInt(e.target.value))}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`} 
                    style={inputSurfaceStyle}
                    title={t('project.topLimit.title')}
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs opacity-70">{t('project.bottomPosition')}</span>
                  <input 
                    type="number" 
                    value={config.chatLayout?.paddingBottom ?? 80}
                    onChange={(e) => updateChatLayout('paddingBottom', parseInt(e.target.value))}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`} 
                    style={inputSurfaceStyle}
                    title={t('project.bottomPosition.title')}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <span className="text-xs opacity-70">{t('project.paddingLeft')}</span>
                  <input
                    type="number"
                    value={config.chatLayout?.paddingLeft ?? config.chatLayout?.paddingX ?? 48}
                    onChange={(e) => updateChatLayout('paddingLeft', parseInt(e.target.value))}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`}
                    style={inputSurfaceStyle}
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs opacity-70">{t('project.paddingRight')}</span>
                  <input
                    type="number"
                    value={config.chatLayout?.paddingRight ?? config.chatLayout?.paddingX ?? 48}
                    onChange={(e) => updateChatLayout('paddingRight', parseInt(e.target.value))}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`}
                    style={inputSurfaceStyle}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const left = config.chatLayout?.paddingLeft ?? config.chatLayout?.paddingX ?? 48;
                    const right = config.chatLayout?.paddingRight ?? config.chatLayout?.paddingX ?? 48;
                    const centered = Math.round((left + right) / 2);
                    onConfigChange({
                      ...config,
                      chatLayout: {
                        ...config.chatLayout,
                        paddingLeft: centered,
                        paddingRight: centered
                      }
                    });
                  }}
                  className="px-3 py-1.5 text-xs rounded-md border transition-colors"
                  style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.textMuted }}
                >
                  {t('project.centerPadding')}
                </button>
              </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs opacity-70">{t('project.bubbleScale')}</span>
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: themeColor, backgroundColor: `${themeColor}18` }}>{(config.chatLayout?.bubbleScale ?? 1.5).toFixed(2)}x</span>
                </div>
                <input 
                  type="range" min="0.5" max="5" step="0.05"
                  value={config.chatLayout?.bubbleScale ?? 1.5}
                  onChange={(e) => updateChatLayout('bubbleScale', parseFloat(e.target.value))}
                  className="w-full" style={themedRangeStyle}
                  title={t('project.bubbleScale.title')}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="text-xs opacity-70">{t('project.avatarSize')}</span>
                  <input
                    type="number"
                    value={config.chatLayout?.avatarSize ?? 80}
                    onChange={(e) => updateChatLayout('avatarSize', parseInt(e.target.value))}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`}
                    style={inputSurfaceStyle}
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs opacity-70">{t('project.speakerNameSize')}</span>
                  <input
                    type="number"
                    value={config.chatLayout?.speakerNameSize ?? 22}
                    onChange={(e) => updateChatLayout('speakerNameSize', parseInt(e.target.value))}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`}
                    style={inputSurfaceStyle}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="text-xs opacity-70">{t('project.animationStyle')}</span>
                  <select
                    value={config.chatLayout?.animationStyle || 'rise'}
                    onChange={(e) => updateChatLayout('animationStyle', e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`}
                    style={inputSurfaceStyle}
                  >
                    <option value="none">{t('anim.none')}</option>
                    <option value="fade">{t('anim.fade')}</option>
                    <option value="rise">{t('anim.rise')}</option>
                    <option value="pop">{t('anim.pop')}</option>
                    <option value="slide">{t('anim.slide')}</option>
                    <option value="blur">{t('anim.blur')}</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs opacity-70">{t('project.animationSpeed')}</span>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: themeColor, backgroundColor: `${themeColor}18` }}>{(config.chatLayout?.animationDuration ?? 0.25).toFixed(2)}s</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="1.2" step="0.05"
                    value={config.chatLayout?.animationDuration ?? 0.25}
                    onChange={(e) => updateChatLayout('animationDuration', parseFloat(e.target.value))}
                    className="w-full" style={themedRangeStyle}
                  />
                </div>
              </div>
            </div>

            {/* Background */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium border-b pb-1" style={{ borderColor: uiTheme.border, color: uiTheme.text }}>
                <ImageIcon size={14} /> {t('project.background')}
              </label>
              <div className="space-y-1.5">
                <span className="text-xs opacity-70">{t('project.backgroundPath')}</span>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={config.background?.image || ''}
                    onChange={(e) => updateBackground('image', e.target.value)}
                    className={`flex-1 w-full border rounded-md px-3 py-2 text-xs focus:outline-none ${inputClass}`} 
                    style={inputSurfaceStyle}
                  />
                  {onSelectImage && (
                    <button 
                      onClick={async () => {
                        const path = await onSelectImage();
                        if (path) updateBackground('image', path);
                      }}
                      className="px-3 border rounded-md flex items-center justify-center transition-colors"
                      style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgSubtle }}
                      title={t('project.selectLocalImage')}
                    >
                      <FolderOpen size={16} style={{ color: uiTheme.textMuted }} />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="text-xs opacity-70">{t('project.assPath')}</span>
                <input
                  type="text"
                  value={config.assPath || ''}
                  readOnly
                  className={`w-full border rounded-md px-3 py-2 text-xs focus:outline-none ${inputClass}`}
                  style={inputSurfaceStyle}
                />
              </div>
              <div className="space-y-1.5">
                <span className="text-xs opacity-70">{t('project.applyAvatarBorderColor')}</span>
                {renderColorInput((Object.values(config.speakers || {})[0] as any)?.style?.avatarBorderColor || '#FFFFFF', applyAvatarBorderColorToAll)}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs opacity-70">{t('project.blur')}</span>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: themeColor, backgroundColor: `${themeColor}18` }}>{config.background?.blur || 0}px</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" max="50" 
                    value={config.background?.blur || 0}
                    onChange={(e) => updateBackground('blur', parseInt(e.target.value))}
                    className="w-full" style={themedRangeStyle}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs opacity-70">{t('project.brightness')}</span>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: themeColor, backgroundColor: `${themeColor}18` }}>{Math.round((config.background?.brightness ?? 1) * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.1" max="2.0" step="0.1"
                    value={config.background?.brightness ?? 1.0}
                    onChange={(e) => updateBackground('brightness', parseFloat(e.target.value))}
                    className="w-full" style={themedRangeStyle}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'speakers' && (
          <div className="space-y-4">
            {/* Speakers */}
            <div className="space-y-2">
              <div className="sticky top-0 z-20 pb-2 pt-2 px-0.5 space-y-2 border-b" style={{ backgroundColor: uiTheme.panelBg, borderColor: uiTheme.border, boxShadow: `0 8px 20px ${uiTheme.shadow}` }}>
              <div className="flex items-center justify-between border-b pb-1" style={{ borderColor: uiTheme.border }}>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Users size={14} /> {t('speakers.title')}
                </label>
                <button 
                  onClick={handleAddSpeaker}
                  className="text-xs flex items-center gap-1"
                  style={{ color: themeColor }}
                >
                  <Plus size={12} /> {t('speakers.add')}
                </button>
              </div>
              
              <div className="space-y-3">
                {/* Tabs */}
                <div className="flex overflow-x-auto custom-scrollbar pb-2 gap-2 border-b" style={{ borderColor: uiTheme.border }}>
                  {Object.keys(config.speakers).filter((key) => config.speakers[key]?.type !== 'annotation').map((key) => (
                    <button
                      key={key}
                      onClick={() => setActiveSpeakerTab(key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border ${
                        activeSpeakerTab === key 
                          ? 'text-white'
                          : ''
                      }`}
                      style={activeSpeakerTab === key ? { backgroundColor: themeColor, borderColor: themeColor } : { backgroundColor: uiTheme.panelBg, borderColor: uiTheme.border, color: uiTheme.textMuted }}
                    >
                      {config.speakers[key].name || key}
                    </button>
                  ))}
                </div>
              </div>
              </div>

              <div className="space-y-3">

                {activeSpeakerTab && config.speakers[activeSpeakerTab] && (() => {
                  const key = activeSpeakerTab;
                  const speaker = config.speakers[key];
                  return (
                    <div key={key} className="p-4 rounded-xl border space-y-4 shadow-sm" style={{ backgroundColor: uiTheme.cardBg, borderColor: uiTheme.border, boxShadow: `0 6px 18px ${uiTheme.shadow}` }}>
                      
                      {/* Header & Base Settings */}
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-center">
                        <span className="font-bold px-2 py-0.5 rounded text-xs" style={{ backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.text }}>{key} ({t('speakers.role')})</span>
                        <div className="flex items-center gap-2">
                          <input 
                            type="text" 
                            value={speaker.name}
                            className={`bg-transparent border-b focus:outline-none w-20 text-right text-sm ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}
                            style={{ borderColor: `${themeColor}66` }}
                            onChange={(e) => {
                              updateSpeaker(key, (currentSpeaker) => ({
                                ...currentSpeaker,
                                name: e.target.value
                              }));
                            }}
                          />
                          <button 
                            onClick={() => handleRemoveSpeaker(key)}
                            disabled={Object.keys(config.speakers).length <= 1}
                            className={`p-1 rounded ${Object.keys(config.speakers).length <= 1 ? 'opacity-30 cursor-not-allowed' : 'text-red-500 hover:bg-red-500/10'}`}
                            title={t('speakers.delete')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 items-center">
                        <img 
                          src={resolveLocalPreviewPath(speaker.avatar)} 
                          alt="avatar" 
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded-full border shadow-sm object-cover shrink-0"
                          style={{ backgroundColor: uiTheme.panelBgSubtle, borderColor: speaker.style?.avatarBorderColor || uiTheme.border }}
                          onError={(e) => {
                            e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${speaker.name}`;
                          }}
                        />
                        <div className="flex-1 space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70 block">{t('speakers.avatar')}</span>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              value={speaker.avatar}
                              onChange={(e) => {
                                updateSpeaker(key, (currentSpeaker) => ({
                                  ...currentSpeaker,
                                  avatar: e.target.value
                                }));
                              }}
                              className={`flex-1 w-full border rounded px-2 py-1 text-xs focus:outline-none ${inputClass}`}
                              style={inputSurfaceStyle}
                            />
                            {onSelectImage && (
                              <button 
                                onClick={async () => {
                                  const path = await onSelectImage();
                                  if (path) {
                                    updateSpeaker(key, (currentSpeaker) => ({
                                      ...currentSpeaker,
                                      avatar: path
                                    }));
                                  }
                                }}
                                className="px-2 border rounded flex items-center justify-center transition-colors"
                                style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgSubtle }}
                                title={t('project.selectLocalImage')}
                              >
                                <FolderOpen size={14} style={{ color: uiTheme.textMuted }} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-1 gap-2">
                        <div className="flex-1 flex items-center gap-1">
                          <select 
                            value={speaker.preset || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateSpeaker(key, (currentSpeaker) => {
                                const nextSpeaker = { ...currentSpeaker, style: { ...(currentSpeaker.style || {}) } };
                                if (val) {
                                  const presetData = normalizePresetPayload(presets[val]);
                                  if (presetData?.style) {
                                    nextSpeaker.style = { ...nextSpeaker.style, ...presetData.style };
                                  }
                                  if (presetData?.avatar) {
                                    nextSpeaker.avatar = presetData.avatar;
                                  }
                                  if (presetData?.side) {
                                    nextSpeaker.side = presetData.side;
                                  }
                                }
                                nextSpeaker.preset = val;
                                return nextSpeaker;
                              });
                            }}
                            className={`flex-1 border rounded px-1 py-1 text-xs focus:outline-none w-full ${inputClass}`}
                            style={inputSurfaceStyle}
                          >
                              <option value="">{speaker.preset ? t('speakers.custom') : t('speakers.applyPreset')}</option>
                            {Object.keys(presets).map(p => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                          {speaker.preset && presets[speaker.preset] && (
                            <button
                              onClick={() => {
                                if (window.confirm(`确定要删除预设 "${speaker.preset}" 吗？这不会影响已经应用该预设的角色，但预设列表里将不再有它。`)) {
                                  handleRemovePreset(speaker.preset);
                                }
                              }}
                              className={`p-1 rounded text-red-500 hover:bg-red-500/10 transition-colors shrink-0`}
                              title={t('speakers.deletePreset')}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                        <button 
                          onClick={() => {
                            if (speaker.preset) {
                              const existingStr = localStorage.getItem('podchat_presets');
                              const existing = existingStr ? JSON.parse(existingStr) : {};
                              existing[speaker.preset] = buildPresetPayload(speaker);
                              localStorage.setItem('podchat_presets', JSON.stringify(existing));
                              window.dispatchEvent(new Event('podchat_presets_updated'));
                              showToast(`预设 "${speaker.preset}" 已更新`);
                              return;
                            }

                            setPresetPromptKey(key);
                            setPresetNameInput(`${key} preset`);
                          }}
                          className="text-xs px-2 py-1 rounded transition-colors shrink-0"
                          style={{ backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.text }}
                        >
                          {speaker.preset ? t('speakers.updatePreset') : t('speakers.savePreset')}
                        </button>
                      </div>
                      {presetPromptKey === key && (
                        <div className="mt-2 p-2 rounded border flex gap-2 items-center" style={{ backgroundColor: uiTheme.panelBgSubtle, borderColor: uiTheme.border }}>
                          <input 
                            type="text" 
                            value={presetNameInput}
                            onChange={(e) => setPresetNameInput(e.target.value)}
                            placeholder={t('speakers.presetName')}
                            className="flex-1 text-xs px-2 py-1 rounded focus:outline-none"
                            style={{ backgroundColor: uiTheme.inputBg, color: uiTheme.text }}
                            autoFocus
                          />
                          <button 
                            onClick={() => {
                              if (!presetNameInput.trim()) return;
                              const existingStr = localStorage.getItem('podchat_presets');
                              const existing = existingStr ? JSON.parse(existingStr) : {};
                              existing[presetNameInput.trim()] = buildPresetPayload(speaker);
                              localStorage.setItem('podchat_presets', JSON.stringify(existing));
                              window.dispatchEvent(new Event('podchat_presets_updated'));
                              showToast(`预设 "${presetNameInput.trim()}" 已保存`);
                              setPresetPromptKey(null);
                            }}
                            className="text-xs px-2 py-1 rounded text-white"
                            style={{ backgroundColor: secondaryThemeColor }}
                          >
                            {t('common.confirm')}
                          </button>
                          <button 
                            onClick={() => setPresetPromptKey(null)}
                            className="text-xs px-2 py-1 rounded"
                            style={{ backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.text }}
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      )}
                    </div>

                    <hr style={{ borderColor: uiTheme.border }} />

                    {/* Font Settings */}
                    <div className="space-y-2">
                      <span className="text-xs font-semibold flex items-center gap-1 opacity-80"><Type size={12} /> {t('speakers.typography')}</span>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.font')}</span>
                          <input 
                            type="text" 
                            list="podchat-font-options"
                            placeholder={t('speakers.fontPlaceholder')}
                            value={speaker.style?.fontFamily || ''}
                            onChange={(e) => updateSpeakerStyle(key, 'fontFamily', e.target.value)}
                            title={t('speakers.fontTitle')}
                            className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                            style={inputSurfaceStyle}
                          />
                          <datalist id="podchat-font-options">
                            {SYSTEM_FONT_OPTIONS.map((font) => (
                              <option key={font} value={font} />
                            ))}
                          </datalist>
                          <div
                            className="text-[10px] opacity-55 leading-relaxed"
                            title={t('speakers.fontHelpTitle')}
                          >
                            {t('speakers.fontHelp')}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.fontSize')}</span>
                          <input 
                            type="number" 
                            value={speaker.style?.fontSize ?? 30}
                            onChange={(e) => updateSpeakerStyle(key, 'fontSize', parseInt(e.target.value))}
                            className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                            style={inputSurfaceStyle}
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.fontWeight')}</span>
                          <select 
                            value={speaker.style?.fontWeight || 'normal'}
                            onChange={(e) => updateSpeakerStyle(key, 'fontWeight', e.target.value)}
                            className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                            style={inputSurfaceStyle}
                          >
                            <option value="normal">常规 (Normal)</option>
                            <option value="bold">加粗 (Bold)</option>
                            <option value="bolder">更粗 (Bolder)</option>
                            <option value="lighter">较细 (Lighter)</option>
                            <option value="100">100</option>
                            <option value="300">300</option>
                            <option value="500">500</option>
                            <option value="700">700</option>
                            <option value="900">900</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.side')}</span>
                          <select 
                            value={speaker.side}
                            onChange={(e) => {
                              updateSpeaker(key, (currentSpeaker) => ({
                                ...currentSpeaker,
                                side: e.target.value
                              }));
                            }}
                            className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                            style={inputSurfaceStyle}
                          >
                            <option value="left">{t('speakers.side.left')}</option>
                            <option value="right">{t('speakers.side.right')}</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <hr style={{ borderColor: uiTheme.border }} />

                    {/* Colors & Background */}
                    <div className="space-y-2">
                      <span className="text-xs font-semibold flex items-center gap-1 opacity-80"><div className="w-3 h-3 rounded-full flex items-center justify-center border shadow-sm" style={{ backgroundColor: themeColor }}></div> {t('speakers.colors')}</span>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider font-mono">{t('speakers.nameColor')}</span>
                          {renderColorInput(speaker.style?.nameColor || '#FFFFFF', (value) => updateSpeakerStyle(key, 'nameColor', value))}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider font-mono">{t('speakers.bg')}</span>
                          {renderColorInput(speaker.style?.bgColor || '#3B82F6', (value) => updateSpeakerStyle(key, 'bgColor', value))}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider font-mono">{t('speakers.text')}</span>
                          {renderColorInput(speaker.style?.textColor || '#FFFFFF', (value) => updateSpeakerStyle(key, 'textColor', value))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-1">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.opacity')}</span>
                          <div className="flex items-center gap-2">
                            <input 
                              type="range" min="0" max="1" step="0.05"
                              value={speaker.style?.opacity ?? 0.9}
                              onChange={(e) => updateSpeakerStyle(key, 'opacity', parseFloat(e.target.value))}
                              className="w-full" style={themedRangeStyle}
                            />
                            <span className="text-[10px] w-6 text-right font-mono">{speaker.style?.opacity ?? 0.9}</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">-</span>
                          <div className="text-[10px] opacity-40 pt-2">{t('speakers.blurRemoved')}</div>
                        </div>
                      </div>
                    </div>

                    <hr style={{ borderColor: uiTheme.border }} />

                    {/* Borders */}
                    <div className="space-y-2">
                      <span className="text-xs font-semibold flex items-center gap-1 opacity-80"><Box size={12} /> {t('speakers.border')}</span>

                      <div className="space-y-1 mb-2">
                        <span className="text-[10px] uppercase tracking-wider font-mono">{t('speakers.avatarBorderColor')}</span>
                        {renderColorInput(speaker.style?.avatarBorderColor || '#FFFFFF', (value) => updateSpeakerStyle(key, 'avatarBorderColor', value))}
                      </div>
                       
                      <div className="space-y-1 mb-2">
                        <span className="text-[10px] uppercase tracking-wider font-mono">{t('speakers.borderColor')}</span>
                        {renderColorInput(speaker.style?.borderColor || '#FFFFFF', (value) => updateSpeakerStyle(key, 'borderColor', value))}
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.borderWidth')}</span>
                          <input 
                            type="number" min="0" max="10"
                            value={speaker.style?.borderWidth ?? 0}
                            onChange={(e) => updateSpeakerStyle(key, 'borderWidth', parseInt(e.target.value))}
                            className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                            style={inputSurfaceStyle}
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.borderRadius')}</span>
                          <input 
                            type="number" min="0" max="64"
                            value={speaker.style?.borderRadius ?? 28}
                            onChange={(e) => updateSpeakerStyle(key, 'borderRadius', parseInt(e.target.value))}
                            className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                            style={inputSurfaceStyle}
                          />
                        </div>
                        <div className="space-y-1 col-span-2">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.borderOpacity')}</span>
                          <div className="flex items-center gap-2">
                            <input 
                              type="range" min="0" max="1" step="0.05"
                              value={speaker.style?.borderOpacity ?? 1.0}
                              onChange={(e) => updateSpeakerStyle(key, 'borderOpacity', parseFloat(e.target.value))}
                              className="w-full" style={themedRangeStyle}
                            />
                            <span className="text-[10px] w-6 text-right font-mono">{speaker.style?.borderOpacity ?? 1.0}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <hr style={{ borderColor: uiTheme.border }} />

                    {/* Layout */}
                     <div className="space-y-2">
                       <span className="text-xs font-semibold flex items-center gap-1 opacity-80"><Layout size={12} /> {t('speakers.layout')}</span>
                       
                       <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.paddingX')}</span>
                          <input 
                            type="number" 
                            value={speaker.style?.paddingX ?? 20}
                            onChange={(e) => updateSpeakerStyle(key, 'paddingX', parseInt(e.target.value))}
                            className={`w-full border rounded px-2 py-1 text-xs focus:outline-none ${inputClass}`}
                            style={inputSurfaceStyle}
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.paddingY')}</span>
                          <input 
                            type="number" 
                            value={speaker.style?.paddingY ?? 12}
                            onChange={(e) => updateSpeakerStyle(key, 'paddingY', parseInt(e.target.value))}
                            className={`w-full border rounded px-2 py-1 text-xs focus:outline-none ${inputClass}`}
                            style={inputSurfaceStyle}
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.margin')}</span>
                          <input 
                            type="number" 
                            value={speaker.style?.margin ?? 14}
                            onChange={(e) => updateSpeakerStyle(key, 'margin', parseInt(e.target.value))}
                            className={`w-full border rounded px-2 py-1 text-xs focus:outline-none ${inputClass}`}
                            style={inputSurfaceStyle}
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.shadow')}</span>
                          <input 
                            type="number" min="0" max="64"
                            value={speaker.style?.shadowSize ?? 7}
                            onChange={(e) => updateSpeakerStyle(key, 'shadowSize', parseInt(e.target.value))}
                            className={`w-full border rounded px-2 py-1 text-xs focus:outline-none ${inputClass}`}
                            style={inputSurfaceStyle}
                          />
                        </div>
                      </div>
                    </div>

                  </div>
                  );
                })()}
              </div>
            </div>

          </div>
        )}

        {activeTab === 'annotation' && config.speakers?.ANNOTATION && (
          <div className="space-y-4">
            {(() => {
              const annotation = config.speakers.ANNOTATION;
              return (
                <div className="p-4 rounded-xl border space-y-4 shadow-sm" style={{ backgroundColor: uiTheme.cardBg, borderColor: uiTheme.border, boxShadow: `0 6px 18px ${uiTheme.shadow}` }}>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium border-b pb-1" style={{ borderColor: uiTheme.border, color: uiTheme.text }}>
                      <Box size={14} /> {t('annotation.title')}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('annotation.position')}</span>
                        <select
                          value={annotation.style?.annotationPosition || 'bottom'}
                          onChange={(e) => updateSpeakerStyle('ANNOTATION', 'annotationPosition', e.target.value)}
                          className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                          style={inputSurfaceStyle}
                        >
                          <option value="top">{t('annotation.position.top')}</option>
                          <option value="bottom">{t('annotation.position.bottom')}</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.fontSize')}</span>
                        <input
                          type="number"
                          value={annotation.style?.fontSize ?? 24}
                          onChange={(e) => updateSpeakerStyle('ANNOTATION', 'fontSize', parseInt(e.target.value))}
                          className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                          style={inputSurfaceStyle}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.font')}</span>
                        <input
                          type="text"
                          list="podchat-font-options"
                          value={annotation.style?.fontFamily || ''}
                          onChange={(e) => updateSpeakerStyle('ANNOTATION', 'fontFamily', e.target.value)}
                          className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                          style={inputSurfaceStyle}
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.shadow')}</span>
                        <input
                          type="number"
                          value={annotation.style?.shadowSize ?? 7}
                          onChange={(e) => updateSpeakerStyle('ANNOTATION', 'shadowSize', parseInt(e.target.value))}
                          className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                          style={inputSurfaceStyle}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider opacity-70">{t('annotation.maxWidth')}</span>
                      <input
                        type="number"
                        value={annotation.style?.maxWidth ?? 720}
                        onChange={(e) => updateSpeakerStyle('ANNOTATION', 'maxWidth', parseInt(e.target.value))}
                        className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                        style={inputSurfaceStyle}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider font-mono">{t('speakers.bg')}</span>
                        {renderColorInput(annotation.style?.bgColor || '#111827', (value) => updateSpeakerStyle('ANNOTATION', 'bgColor', value))}
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider font-mono">{t('speakers.text')}</span>
                        {renderColorInput(annotation.style?.textColor || '#FFFFFF', (value) => updateSpeakerStyle('ANNOTATION', 'textColor', value))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.paddingX')}</span>
                        <input
                          type="number"
                          value={annotation.style?.paddingX ?? 18}
                          onChange={(e) => updateSpeakerStyle('ANNOTATION', 'paddingX', parseInt(e.target.value))}
                          className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                          style={inputSurfaceStyle}
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.paddingY')}</span>
                        <input
                          type="number"
                          value={annotation.style?.paddingY ?? 10}
                          onChange={(e) => updateSpeakerStyle('ANNOTATION', 'paddingY', parseInt(e.target.value))}
                          className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                          style={inputSurfaceStyle}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.margin')}</span>
                        <input
                          type="number"
                          value={annotation.style?.margin ?? 12}
                          onChange={(e) => updateSpeakerStyle('ANNOTATION', 'margin', parseInt(e.target.value))}
                          className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                          style={inputSurfaceStyle}
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">{t('speakers.opacity')}</span>
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          value={annotation.style?.opacity ?? 0.9}
                          onChange={(e) => updateSpeakerStyle('ANNOTATION', 'opacity', parseFloat(e.target.value))}
                          className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                          style={inputSurfaceStyle}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
