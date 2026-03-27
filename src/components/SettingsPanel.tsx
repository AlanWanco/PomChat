import { useState } from 'react';
import { Settings, Image as ImageIcon, Volume2, Type, Users, Save, Moon, Sun } from 'lucide-react';

interface SettingsPanelProps {
  config: any;
  onConfigChange: (newConfig: any) => void;
}

export function SettingsPanel({ config, onConfigChange }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'global' | 'project'>('project');
  const [darkMode, setDarkMode] = useState(true);

  const updateConfig = (key: string, value: any) => {
    onConfigChange({ ...config, [key]: value });
  };

  const updateBackground = (key: string, value: any) => {
    onConfigChange({
      ...config,
      background: { ...config.background, [key]: value }
    });
  };

  return (
    <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col h-full overflow-hidden text-sm text-gray-300 shadow-xl">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-950">
        <h2 className="font-bold text-white flex items-center gap-2">
          <Settings size={16} /> 设置面板
        </h2>
        <button className="p-1.5 hover:bg-gray-800 rounded-md transition-colors" title="保存配置">
          <Save size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 bg-gray-950/50">
        <button
          className={`flex-1 py-2 font-medium transition-colors ${activeTab === 'global' ? 'text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}
          onClick={() => setActiveTab('global')}
        >
          全局设置
        </button>
        <button
          className={`flex-1 py-2 font-medium transition-colors ${activeTab === 'project' ? 'text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}
          onClick={() => setActiveTab('project')}
        >
          项目设置
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {activeTab === 'global' ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="block text-gray-400 font-medium">界面主题</label>
              <div className="flex bg-gray-800 rounded-lg p-1">
                <button 
                  onClick={() => setDarkMode(false)}
                  className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md transition-colors ${!darkMode ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'}`}
                >
                  <Sun size={14} /> 日间
                </button>
                <button 
                  onClick={() => setDarkMode(true)}
                  className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md transition-colors ${darkMode ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'}`}
                >
                  <Moon size={14} /> 夜间
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-gray-400 font-medium">默认配置目录</label>
              <input 
                type="text" 
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white focus:outline-none focus:border-blue-500" 
                defaultValue="/Users/alanwanco/Workspace/podchat/projects"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Project Info */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-gray-400 font-medium border-b border-gray-800 pb-1">
                <Type size={14} /> 基础信息
              </label>
              <div className="space-y-2">
                <span className="text-xs text-gray-500">项目标题</span>
                <input 
                  type="text" 
                  value={config.projectTitle}
                  onChange={(e) => updateConfig('projectTitle', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white focus:outline-none focus:border-blue-500" 
                />
              </div>
            </div>

            {/* Files */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-gray-400 font-medium border-b border-gray-800 pb-1">
                <Volume2 size={14} /> 文件路径
              </label>
              <div className="space-y-2">
                <span className="text-xs text-gray-500">音频文件</span>
                <input 
                  type="text" 
                  value={config.audioPath}
                  onChange={(e) => updateConfig('audioPath', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-gray-300 text-xs font-mono" 
                />
              </div>
              <div className="space-y-2">
                <span className="text-xs text-gray-500">字幕文件 (ASS)</span>
                <input 
                  type="text" 
                  value={config.assPath}
                  onChange={(e) => updateConfig('assPath', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-gray-300 text-xs font-mono" 
                />
              </div>
            </div>

            {/* Background */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-gray-400 font-medium border-b border-gray-800 pb-1">
                <ImageIcon size={14} /> 背景设置
              </label>
              <div className="space-y-2">
                <span className="text-xs text-gray-500">背景图 URL / 本地路径</span>
                <input 
                  type="text" 
                  value={config.background?.image || ''}
                  onChange={(e) => updateBackground('image', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-gray-300 text-xs" 
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">模糊程度</span>
                  <span className="text-xs text-blue-400">{config.background?.blur || 0}px</span>
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

            {/* Speakers */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-gray-400 font-medium border-b border-gray-800 pb-1">
                <Users size={14} /> 说话人配置
              </label>
              
              {Object.entries(config.speakers).map(([key, speaker]: [string, any]) => (
                <div key={key} className="bg-gray-800/50 p-3 rounded-lg border border-gray-800 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white bg-gray-700 px-2 py-0.5 rounded text-xs">{key}</span>
                    <input 
                      type="text" 
                      value={speaker.name}
                      className="bg-transparent border-b border-gray-600 focus:border-blue-500 focus:outline-none w-24 text-right text-sm"
                      onChange={(e) => {
                        const newSpeakers = { ...config.speakers };
                        newSpeakers[key].name = e.target.value;
                        updateConfig('speakers', newSpeakers);
                      }}
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Avatar URL</span>
                    <div className="flex gap-2">
                      <img src={speaker.avatar} alt="avatar" className="w-6 h-6 rounded-full bg-gray-900 border border-gray-700" />
                      <input 
                        type="text" 
                        value={speaker.avatar}
                        onChange={(e) => {
                          const newSpeakers = { ...config.speakers };
                          newSpeakers[key].avatar = e.target.value;
                          updateConfig('speakers', newSpeakers);
                        }}
                        className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Position</span>
                      <select 
                        value={speaker.side}
                        onChange={(e) => {
                          const newSpeakers = { ...config.speakers };
                          newSpeakers[key].side = e.target.value;
                          updateConfig('speakers', newSpeakers);
                        }}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                      >
                        <option value="left">左侧 (Left)</option>
                        <option value="right">右侧 (Right)</option>
                      </select>
                    </div>
                    <div className="flex-1 space-y-1">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Theme</span>
                      <select 
                        value={speaker.theme}
                        onChange={(e) => {
                          const newSpeakers = { ...config.speakers };
                          newSpeakers[key].theme = e.target.value;
                          updateConfig('speakers', newSpeakers);
                        }}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                      >
                        <option value="light">明亮 (Light)</option>
                        <option value="dark">暗色 (Dark)</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
