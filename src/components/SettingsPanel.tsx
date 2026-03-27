import { useState } from 'react';
import { Settings, Image as ImageIcon, Type, Users, Save, Moon, Sun, Trash2, Plus, X, ArrowLeftRight } from 'lucide-react';

interface SettingsPanelProps {
  config: any;
  onConfigChange: (newConfig: any) => void;
  isDarkMode: boolean;
  onThemeChange: (isDark: boolean) => void;
  settingsPosition: 'left' | 'right';
  onPositionChange: (pos: 'left' | 'right') => void;
  onClose: () => void;
  onSave: () => void;
}

export function SettingsPanel({ 
  config, onConfigChange, 
  isDarkMode, onThemeChange, 
  settingsPosition, onPositionChange,
  onClose, onSave 
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'global' | 'project'>('project');

  const updateConfig = (key: string, value: any) => {
    onConfigChange({ ...config, [key]: value });
  };

  const updateBackground = (key: string, value: any) => {
    onConfigChange({
      ...config,
      background: { ...config.background, [key]: value }
    });
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
        name: `新角色 ${newId}`, 
        avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${newId}`, 
        side: "left", 
        style: { bgColor: "#6b7280", textColor: "#ffffff", borderRadius: 32 }
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

  const bgClass = isDarkMode ? "bg-gray-900 border-gray-800 text-gray-300" : "bg-white border-gray-200 text-gray-700";
  const headerClass = isDarkMode ? "bg-gray-950 border-gray-800 text-white" : "bg-gray-50 border-gray-200 text-gray-900";
  const inputClass = isDarkMode ? "bg-gray-800 border-gray-700 text-white focus:border-blue-500" : "bg-white border-gray-300 text-gray-900 focus:border-blue-500";
  const cardBgClass = isDarkMode ? "bg-gray-800/50 border-gray-800" : "bg-gray-50 border-gray-200";

  return (
    <div className={`h-full flex flex-col overflow-hidden ${bgClass}`}>
      <div className={`p-4 border-b flex items-center justify-between shrink-0 ${headerClass}`}>
        <h2 className="font-bold flex items-center gap-2 text-sm">
          <Settings size={16} /> 设置面板
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={onSave} className={`p-1.5 rounded-md transition-colors ${isDarkMode ? 'hover:bg-gray-800 text-blue-400' : 'hover:bg-gray-200 text-blue-600'}`} title="保存到本地">
            <Save size={16} />
          </button>
          <button onClick={onClose} className={`p-1.5 rounded-md transition-colors ${isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`} title="关闭面板">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className={`flex border-b shrink-0 ${isDarkMode ? 'bg-gray-950/50 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
        <button
          className={`flex-1 py-2 font-medium transition-colors text-sm ${activeTab === 'global' ? (isDarkMode ? 'text-white border-b-2 border-blue-500' : 'text-gray-900 border-b-2 border-blue-500') : (isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700')}`}
          onClick={() => setActiveTab('global')}
        >
          全局设置
        </button>
        <button
          className={`flex-1 py-2 font-medium transition-colors text-sm ${activeTab === 'project' ? (isDarkMode ? 'text-white border-b-2 border-blue-500' : 'text-gray-900 border-b-2 border-blue-500') : (isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700')}`}
          onClick={() => setActiveTab('project')}
        >
          项目设置
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {activeTab === 'global' ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-wider opacity-70">界面主题</label>
              <div className={`flex rounded-lg p-1 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                <button 
                  onClick={() => onThemeChange(false)}
                  className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm transition-colors ${!isDarkMode ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <Sun size={14} /> 日间
                </button>
                <button 
                  onClick={() => onThemeChange(true)}
                  className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm transition-colors ${isDarkMode ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  <Moon size={14} /> 夜间
                </button>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-wider opacity-70">设置面板位置</label>
              <div className={`flex rounded-lg p-1 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                <button 
                  onClick={() => onPositionChange('left')}
                  className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm transition-colors ${settingsPosition === 'left' ? (isDarkMode ? 'bg-gray-700 text-white shadow-sm' : 'bg-white text-blue-600 shadow-sm') : 'text-gray-500'}`}
                >
                  <ArrowLeftRight size={14} /> 居左
                </button>
                <button 
                  onClick={() => onPositionChange('right')}
                  className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm transition-colors ${settingsPosition === 'right' ? (isDarkMode ? 'bg-gray-700 text-white shadow-sm' : 'bg-white text-blue-600 shadow-sm') : 'text-gray-500'}`}
                >
                  <ArrowLeftRight size={14} /> 居右
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-wider opacity-70">默认配置目录</label>
              <input 
                type="text" 
                className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`} 
                defaultValue="/Users/alanwanco/Workspace/podchat/projects"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-3">
              <label className={`flex items-center gap-2 text-sm font-medium border-b pb-1 ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
                <Type size={14} /> 基础信息
              </label>
              <div className="space-y-1.5">
                <span className="text-xs opacity-70">项目标题</span>
                <input 
                  type="text" 
                  value={config.projectTitle}
                  onChange={(e) => updateConfig('projectTitle', e.target.value)}
                  className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none ${inputClass}`} 
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className={`flex items-center gap-2 text-sm font-medium border-b pb-1 ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
                <ImageIcon size={14} /> 背景设置
              </label>
              <div className="space-y-1.5">
                <span className="text-xs opacity-70">背景图 URL / 本地路径</span>
                <input 
                  type="text" 
                  value={config.background?.image || ''}
                  onChange={(e) => updateBackground('image', e.target.value)}
                  className={`w-full border rounded-md px-3 py-2 text-xs focus:outline-none ${inputClass}`} 
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs opacity-70">模糊程度</span>
                  <span className="text-xs text-blue-500 font-mono bg-blue-500/10 px-1.5 py-0.5 rounded">{config.background?.blur || 0}px</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="50" 
                  value={config.background?.blur || 0}
                  onChange={(e) => updateBackground('blur', parseInt(e.target.value))}
                  className="w-full accent-blue-500" 
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className={`flex items-center justify-between border-b pb-1 ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Users size={14} /> 说话人配置
                </label>
                <button 
                  onClick={handleAddSpeaker}
                  className="text-xs text-blue-500 hover:text-blue-400 flex items-center gap-1"
                >
                  <Plus size={12} /> 添加
                </button>
              </div>
              
              <div className="space-y-3">
                {Object.entries(config.speakers).map(([key, speaker]: [string, any]) => (
                  <div key={key} className={`p-3 rounded-lg border space-y-3 ${cardBgClass}`}>
                    <div className="flex justify-between items-center">
                      <span className={`font-bold px-2 py-0.5 rounded text-xs ${isDarkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-800'}`}>{key}</span>
                      
                      <div className="flex items-center gap-2">
                        <input 
                          type="text" 
                          value={speaker.name}
                          className={`bg-transparent border-b focus:border-blue-500 focus:outline-none w-20 text-right text-sm ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}
                          onChange={(e) => {
                            const newSpeakers = { ...config.speakers };
                            newSpeakers[key].name = e.target.value;
                            updateConfig('speakers', newSpeakers);
                          }}
                        />
                        <button 
                          onClick={() => handleRemoveSpeaker(key)}
                          disabled={Object.keys(config.speakers).length <= 1}
                          className={`p-1 rounded ${Object.keys(config.speakers).length <= 1 ? 'opacity-30 cursor-not-allowed' : 'text-red-500 hover:bg-red-500/10'}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase tracking-wider opacity-70">Avatar URL</span>
                      <div className="flex gap-2 items-center">
                        <img src={speaker.avatar} alt="avatar" className={`w-7 h-7 rounded-full border ${isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`} />
                        <input 
                          type="text" 
                          value={speaker.avatar}
                          onChange={(e) => {
                            const newSpeakers = { ...config.speakers };
                            newSpeakers[key].avatar = e.target.value;
                            updateConfig('speakers', newSpeakers);
                          }}
                          className={`flex-1 border rounded px-2 py-1 text-xs focus:outline-none ${inputClass}`}
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <div className="flex-1 space-y-1.5">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">位置 (Side)</span>
                        <select 
                          value={speaker.side}
                          onChange={(e) => {
                            const newSpeakers = { ...config.speakers };
                            newSpeakers[key].side = e.target.value;
                            updateConfig('speakers', newSpeakers);
                          }}
                          className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                        >
                          <option value="left">左侧 (Left)</option>
                          <option value="right">右侧 (Right)</option>
                        </select>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <span className="text-[10px] uppercase tracking-wider opacity-70">圆角 (Radius)</span>
                        <select 
                          value={speaker.style?.borderRadius || 32}
                          onChange={(e) => {
                            const newSpeakers = { ...config.speakers };
                            if (!newSpeakers[key].style) newSpeakers[key].style = {};
                            newSpeakers[key].style.borderRadius = parseInt(e.target.value);
                            updateConfig('speakers', newSpeakers);
                          }}
                          className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputClass}`}
                        >
                          <option value="8">小圆角 (8px)</option>
                          <option value="16">中圆角 (16px)</option>
                          <option value="32">大圆角 (32px)</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-1">
                      <div className="flex items-center gap-2">
                        <input 
                          type="color" 
                          value={speaker.style?.bgColor || '#3b82f6'}
                          onChange={(e) => {
                            const newSpeakers = { ...config.speakers };
                            if (!newSpeakers[key].style) newSpeakers[key].style = {};
                            newSpeakers[key].style.bgColor = e.target.value;
                            updateConfig('speakers', newSpeakers);
                          }}
                          className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                        />
                        <span className="text-[10px] uppercase tracking-wider opacity-70">背景色</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input 
                          type="color" 
                          value={speaker.style?.textColor || '#ffffff'}
                          onChange={(e) => {
                            const newSpeakers = { ...config.speakers };
                            if (!newSpeakers[key].style) newSpeakers[key].style = {};
                            newSpeakers[key].style.textColor = e.target.value;
                            updateConfig('speakers', newSpeakers);
                          }}
                          className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                        />
                        <span className="text-[10px] uppercase tracking-wider opacity-70">文字色</span>
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
