import { useState, useEffect, useRef } from 'react';
import { demoConfig as initialConfig } from './projects/demo/config';
import { SettingsPanel } from './components/SettingsPanel';
import { PlayerControls } from './components/PlayerControls';
import { Download, PanelRightClose, PanelRightOpen } from 'lucide-react';
import './App.css';

interface Speaker {
  name: string;
  avatar: string;
  side: "left" | "right";
  theme?: "light" | "dark"; // legacy
  style?: {
    bgColor: string;
    textColor: string;
    borderRadius: number;
  };
}

interface ContentItem {
  start: number;
  end: number;
  speaker: string;
  type: "text" | "image";
  text?: string;
  url?: string;
}

function App() {
  const [config, setConfig] = useState(initialConfig);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showSettings, setShowSettings] = useState(true);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

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

  const handleAudioEnded = () => {
    if (!loop) setIsPlaying(false);
  };

  const handleSeek = (time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  useEffect(() => {
    if (scrollRef.current && isPlaying) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [currentTime, isPlaying]);

  const exportConfig = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "podchat_project.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    alert("已下载配置 JSON。\n\n提示：当前前端界面仅用于预览和编辑参数。真正的视频压制（MP4硬解导出）需要通过后端的 Remotion 引擎读取此 JSON 来执行！");
  };

  // Theme classes
  const appBg = isDarkMode ? "bg-[#0a0a0a]" : "bg-gray-100";
  const textClass = isDarkMode ? "text-white" : "text-gray-900";
  const toolbarBg = isDarkMode ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const canvasBg = isDarkMode ? "bg-[#111]" : "bg-gray-200/50";
  const mockupBg = isDarkMode ? "bg-gray-950 border-gray-800" : "bg-white border-gray-300";

  return (
    <div className={`w-full h-screen ${appBg} flex font-sans ${textClass} overflow-hidden transition-colors duration-300`}>
      
      <audio 
        ref={audioRef}
        src={config.audioPath}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleAudioEnded}
        preload="metadata"
      />

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 relative">
        
        {/* Top Toolbar */}
        <div className={`h-12 ${toolbarBg} border-b flex items-center px-4 justify-between shrink-0 transition-colors duration-300 z-30 shadow-sm`}>
          <div className="font-bold flex items-center gap-2">
            PodChat Studio 
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
              title={showSettings ? "隐藏设置面板" : "显示设置面板"}
            >
              {showSettings ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
            </button>
          </div>
        </div>

        {/* Canvas Area (Preview) */}
        <div className={`flex-1 overflow-hidden flex items-center justify-center ${canvasBg} p-8 relative transition-colors duration-300 z-10`}>
          <div className={`relative w-full max-w-[1280px] aspect-video ${mockupBg} rounded-lg shadow-2xl overflow-hidden flex flex-col border transition-colors duration-300`}>
            
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
              {(config.content as ContentItem[]).map((item, index) => {
                const speaker = (config.speakers as Record<string, Speaker>)[item.speaker];
                if (!speaker) return null;

                const isVisible = currentTime >= item.start;
                const isLeft = speaker.side === "left";

                if (!isVisible) return null;

                // Fallback to old theme if style is missing
                const fallbackBg = speaker.theme === 'dark' ? '#2563eb' : '#ffffff';
                const fallbackText = speaker.theme === 'dark' ? '#ffffff' : '#111827';
                
                const bgColor = speaker.style?.bgColor || fallbackBg;
                const textColor = speaker.style?.textColor || fallbackText;
                const radius = speaker.style?.borderRadius || 32;

                return (
                  <div
                    key={index}
                    className={`flex w-full ${isLeft ? "justify-start" : "justify-end"} animate-fade-in`}
                  >
                    <div className={`flex max-w-[70%] gap-4 ${isLeft ? "flex-row" : "flex-row-reverse"}`}>
                      {/* Avatar */}
                      <img
                        src={speaker.avatar}
                        alt={speaker.name}
                        className={`w-16 h-16 rounded-full border-4 shrink-0 shadow-lg object-cover ${isDarkMode ? 'border-gray-800 bg-gray-900' : 'border-white bg-gray-200'}`}
                      />
                      
                      {/* Bubble & Name */}
                      <div className={`flex flex-col ${isLeft ? "items-start" : "items-end"}`}>
                        <span className="text-sm font-bold text-white/90 mb-1 drop-shadow-md mix-blend-difference">{speaker.name}</span>
                        
                        {/* Content Bubble */}
                        <div 
                          className="px-6 py-4 shadow-xl text-xl break-words backdrop-blur-sm"
                          style={{
                            backgroundColor: `${bgColor}E6`, // 90% opacity
                            color: textColor,
                            borderRadius: `${radius}px`,
                            borderTopLeftRadius: isLeft ? '4px' : `${radius}px`,
                            borderTopRightRadius: !isLeft ? '4px' : `${radius}px`,
                          }}
                        >
                          {item.type === "text" ? (
                            <p className="leading-relaxed whitespace-pre-wrap">{item.text}</p>
                          ) : (
                            <img 
                              src={item.url} 
                              alt="media" 
                              className="w-full rounded-xl object-cover"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
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

      {/* Right Sidebar - Settings */}
      {showSettings && (
        <SettingsPanel 
          config={config} 
          onConfigChange={setConfig} 
          isDarkMode={isDarkMode}
          onThemeChange={setIsDarkMode}
          onClose={() => setShowSettings(false)}
        />
      )}

    </div>
  );
}

export default App;
