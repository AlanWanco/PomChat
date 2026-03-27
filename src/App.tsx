import { useState, useEffect, useRef, useCallback } from 'react';
import { demoConfig as initialConfig } from './projects/demo/config';
import { SettingsPanel } from './components/SettingsPanel';
import { PlayerControls } from './components/PlayerControls';
import { SubtitlePanel } from './components/SubtitlePanel';
import { useAssSubtitle } from './hooks/useAssSubtitle';
import { Download, PanelRightClose, PanelRightOpen, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import './App.css';

// Local Storage Keys
const STORAGE_KEY = 'podchat_demo_config';
const SETTINGS_POS_KEY = 'podchat_settings_pos';
const THEME_KEY = 'podchat_theme';

function App() {
  // Load initial from localStorage if available
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : initialConfig;
  });

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem(THEME_KEY) !== 'light');
  const [showSettings, setShowSettings] = useState(true);
  const [showSubtitlePanel, setShowSubtitlePanel] = useState(true);
  
  const [settingsPosition, setSettingsPosition] = useState<'left'|'right'>(() => {
    return (localStorage.getItem(SETTINGS_POS_KEY) as 'left'|'right') || 'right';
  });

  // Panel Widths
  const [subtitleWidth, setSubtitleWidth] = useState(320);
  const [settingsWidth, setSettingsWidth] = useState(320);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Fetch ASS Data
  const { subtitles, loading: subtitlesLoading } = useAssSubtitle(config.assPath, config.speakers);

  // Save config explicitly
  const handleSaveConfig = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    alert('配置已保存到浏览器缓存！');
  };

  useEffect(() => {
    localStorage.setItem(THEME_KEY, isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_POS_KEY, settingsPosition);
  }, [settingsPosition]);

  // Audio Sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.play().catch((err) => {
        console.error("Audio playback failed:", err);
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.loop = loop;
  }, [loop]);

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };

  const handleSeek = useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  // Auto-scroll log (Only scroll to active subtitle in the chat view)
  useEffect(() => {
    if (scrollRef.current && isPlaying) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [currentTime, isPlaying]);

  const exportConfig = () => {
    // Inject the real parsed subtitles when exporting
    const finalConfig = {
      ...config,
      content: subtitles.map(s => ({
        start: s.start,
        end: s.end,
        speaker: s.speakerId,
        type: 'text',
        text: s.text
      }))
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(finalConfig, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "podchat_project.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  // Drag Resizing Logic
  const startResizing = (e: React.MouseEvent, type: 'subtitle' | 'settings') => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = type === 'subtitle' ? subtitleWidth : settingsWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      let delta = moveEvent.clientX - startX;
      
      // Determine direction based on position
      if (type === 'subtitle') {
        // Subtitle is ALWAYS on the left
        const newWidth = Math.max(200, Math.min(600, startWidth + delta));
        setSubtitleWidth(newWidth);
      } else {
        // Settings could be left or right
        if (settingsPosition === 'left') {
           // It's on the left, but after Subtitle if both are left
           // Actually, if settings is left, it's on the left side of the main workspace
           const newWidth = Math.max(250, Math.min(600, startWidth + delta));
           setSettingsWidth(newWidth);
        } else {
           // Settings on the right
           const newWidth = Math.max(250, Math.min(600, startWidth - delta));
           setSettingsWidth(newWidth);
        }
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  const appBg = isDarkMode ? "bg-[#0a0a0a]" : "bg-gray-100";
  const textClass = isDarkMode ? "text-white" : "text-gray-900";
  const toolbarBg = isDarkMode ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const canvasBg = isDarkMode ? "bg-[#111]" : "bg-gray-200/50";
  const mockupBg = isDarkMode ? "bg-gray-950 border-gray-800" : "bg-white border-gray-300";
  const dividerClass = isDarkMode ? "bg-gray-800 hover:bg-blue-500" : "bg-gray-300 hover:bg-blue-400";

  return (
    <div className={`w-full h-screen ${appBg} flex font-sans ${textClass} overflow-hidden transition-colors duration-300`}>
      
      <audio 
        ref={audioRef}
        src={config.audioPath}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => !loop && setIsPlaying(false)}
        preload="metadata"
      />

      {/* LEFT PANELS */}
      <div className="flex h-full shrink-0 z-20">
        {showSubtitlePanel && (
          <div style={{ width: subtitleWidth }} className="h-full border-r border-gray-800 shrink-0">
            <SubtitlePanel 
              subtitles={subtitles} 
              currentTime={currentTime} 
              isDarkMode={isDarkMode} 
              onSeek={handleSeek} 
            />
          </div>
        )}
        {showSubtitlePanel && (
          <div 
            className={`w-1 cursor-col-resize shrink-0 transition-colors ${dividerClass}`}
            onMouseDown={(e) => startResizing(e, 'subtitle')}
          />
        )}
        
        {settingsPosition === 'left' && showSettings && (
          <div style={{ width: settingsWidth }} className="h-full shrink-0">
            <SettingsPanel 
              config={config} 
              onConfigChange={setConfig} 
              isDarkMode={isDarkMode}
              onThemeChange={setIsDarkMode}
              settingsPosition={settingsPosition}
              onPositionChange={setSettingsPosition}
              onClose={() => setShowSettings(false)}
              onSave={handleSaveConfig}
            />
          </div>
        )}
        {settingsPosition === 'left' && showSettings && (
          <div 
            className={`w-1 cursor-col-resize shrink-0 transition-colors ${dividerClass}`}
            onMouseDown={(e) => startResizing(e, 'settings')}
          />
        )}
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        
        {/* Top Toolbar */}
        <div className={`h-12 ${toolbarBg} border-b flex items-center px-4 justify-between shrink-0 z-30 shadow-sm`}>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowSubtitlePanel(!showSubtitlePanel)}
              className={`p-1.5 rounded transition-colors mr-2 ${isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}
              title="切换字幕列表"
            >
              {showSubtitlePanel ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
            <span className="font-bold">PodChat Studio</span>
            <span className={`text-xs font-normal px-2 py-0.5 rounded ${isDarkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
              {config.projectTitle}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className={`text-xs px-2 py-1 rounded ${isDarkMode ? 'text-gray-500 bg-gray-800' : 'text-gray-600 bg-gray-100'}`}>
              1920x1080 (16:9) @ {config.fps}FPS
            </div>
            <button 
              onClick={exportConfig}
              className="flex items-center gap-2 text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded transition-colors shadow-sm"
            >
              <Download size={14} />
              导出配置
            </button>
            <div className={`w-px h-6 mx-1 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-300'}`}></div>
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}
              title="切换设置面板"
            >
              {showSettings ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
            </button>
          </div>
        </div>

        {/* Canvas Area (Preview) */}
        <div className={`flex-1 overflow-hidden flex items-center justify-center ${canvasBg} p-8 relative z-10`}>
          <div className={`relative w-full max-w-[1280px] aspect-video ${mockupBg} rounded-lg shadow-2xl overflow-hidden flex flex-col border`}>
            
            {/* Background Image */}
            {config.background?.image && (
              <div 
                className="absolute inset-0 bg-cover bg-center z-0 scale-105"
                style={{ 
                  backgroundImage: `url(${config.background.image})`,
                  filter: `blur(${config.background.blur || 0}px)`,
                  opacity: 0.5
                }}
              />
            )}

            {/* Chat Stream */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-12 flex flex-col gap-6 pb-32 scroll-smooth z-10 custom-scrollbar relative"
            >
              {subtitlesLoading ? (
                <div className="text-center opacity-50 my-auto">正在加载字幕文件...</div>
              ) : (
                subtitles.map((item) => {
                  const speaker = config.speakers[item.speakerId];
                  if (!speaker) return null;

                  const isVisible = currentTime >= item.start;
                  const isLeft = speaker.side === "left";

                  if (!isVisible) return null;

                  const fallbackBg = speaker.theme === 'dark' ? '#2563eb' : '#ffffff';
                  const fallbackText = speaker.theme === 'dark' ? '#ffffff' : '#111827';
                  
                  const bgColor = speaker.style?.bgColor || fallbackBg;
                  const textColor = speaker.style?.textColor || fallbackText;
                  const radius = speaker.style?.borderRadius || 32;

                  return (
                    <div
                      key={item.id}
                      className={`flex w-full ${isLeft ? "justify-start" : "justify-end"} animate-fade-in`}
                    >
                      <div className={`flex max-w-[70%] gap-4 ${isLeft ? "flex-row" : "flex-row-reverse"}`}>
                        <img
                          src={speaker.avatar}
                          alt={speaker.name}
                          className={`w-16 h-16 rounded-full border-4 shrink-0 shadow-lg object-cover ${isDarkMode ? 'border-gray-800 bg-gray-900' : 'border-white bg-gray-200'}`}
                        />
                        <div className={`flex flex-col ${isLeft ? "items-start" : "items-end"}`}>
                          <span className="text-sm font-bold text-white/90 mb-1 drop-shadow-md mix-blend-difference">
                            {speaker.name}
                          </span>
                          <div 
                            className="px-6 py-4 shadow-xl text-xl break-words backdrop-blur-sm"
                            style={{
                              backgroundColor: `${bgColor}E6`, 
                              color: textColor,
                              borderRadius: `${radius}px`,
                              borderTopLeftRadius: isLeft ? '4px' : `${radius}px`,
                              borderTopRightRadius: !isLeft ? '4px' : `${radius}px`,
                            }}
                          >
                            <p className="leading-relaxed whitespace-pre-wrap">{item.text}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <PlayerControls 
          currentTime={currentTime} 
          duration={duration}
          isPlaying={isPlaying}
          loop={loop}
          playbackRate={playbackRate}
          onPlayPause={() => setIsPlaying(!isPlaying)}
          onReset={() => {
            handleSeek(0);
            setIsPlaying(false);
          }}
          onSeek={handleSeek}
          onLoopChange={setLoop}
          onRateChange={setPlaybackRate}
          isDarkMode={isDarkMode}
        />

      </div>

      {/* RIGHT PANELS */}
      {settingsPosition === 'right' && showSettings && (
        <div className="flex h-full shrink-0 z-20">
          <div 
            className={`w-1 cursor-col-resize shrink-0 transition-colors ${dividerClass}`}
            onMouseDown={(e) => startResizing(e, 'settings')}
          />
          <div style={{ width: settingsWidth }} className="h-full shrink-0">
            <SettingsPanel 
              config={config} 
              onConfigChange={setConfig} 
              isDarkMode={isDarkMode}
              onThemeChange={setIsDarkMode}
              settingsPosition={settingsPosition}
              onPositionChange={setSettingsPosition}
              onClose={() => setShowSettings(false)}
              onSave={handleSaveConfig}
            />
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
