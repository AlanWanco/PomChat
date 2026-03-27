import { useState, useEffect, useRef } from 'react';
import { demoConfig as initialConfig } from './projects/demo/config';
import { SettingsPanel } from './components/SettingsPanel';
import { PlayerControls } from './components/PlayerControls';
import './App.css';

interface Speaker {
  name: string;
  avatar: string;
  side: "left" | "right";
  theme: "light" | "dark";
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
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Ref for auto-scrolling
  const scrollRef = useRef<HTMLDivElement>(null);
  const duration = 10; // Mock duration for the demo

  // Simple timer for previewing timeline playback
  useEffect(() => {
    let timer: number;
    if (isPlaying) {
      timer = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            setIsPlaying(false);
            return duration;
          }
          return prev + 0.1;
        });
      }, 100);
    }
    return () => clearInterval(timer);
  }, [isPlaying]);

  // Auto-scroll logic
  useEffect(() => {
    if (scrollRef.current && isPlaying) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [currentTime, isPlaying]);

  return (
    <div className="w-full h-screen bg-[#0a0a0a] flex font-sans text-white overflow-hidden">
      
      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Toolbar (Simple) */}
        <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center px-4 justify-between shrink-0">
          <div className="font-bold text-gray-300">PodChat Studio <span className="text-gray-600 font-normal ml-2">| {config.projectTitle}</span></div>
          <div className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">1920x1080 (16:9) @ {config.fps}FPS</div>
        </div>

        {/* Canvas Area (Preview) */}
        <div className="flex-1 overflow-hidden flex items-center justify-center bg-[#111] p-8 relative">
          {/* Desktop container mockup (1920x1080 scaled down via aspect-ratio container) */}
          <div 
            className="relative w-full max-w-[1280px] aspect-video bg-gray-950 rounded-lg shadow-2xl overflow-hidden flex flex-col border border-gray-800"
          >
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
            
            {/* Safe Area overlay for debugging (optional) */}
            <div className="absolute inset-0 border-[40px] border-black/20 pointer-events-none z-10 hidden" />

            {/* Chat Stream */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-12 flex flex-col gap-6 pb-32 scroll-smooth z-10 custom-scrollbar relative"
            >
              {(config.content as ContentItem[]).map((item, index) => {
                const speaker = (config.speakers as Record<string, Speaker>)[item.speaker];
                const isVisible = currentTime >= item.start;
                const isLeft = speaker.side === "left";

                if (!isVisible) return null;

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
                        className="w-16 h-16 rounded-full border-4 border-gray-800 bg-gray-900 shrink-0 shadow-lg object-cover"
                      />
                      
                      {/* Bubble & Name */}
                      <div className={`flex flex-col ${isLeft ? "items-start" : "items-end"}`}>
                        <span className="text-sm font-bold text-white/80 mb-1 drop-shadow-md">{speaker.name}</span>
                        
                        {/* Content */}
                        <div 
                          className={`
                            px-6 py-4 rounded-[2rem] shadow-xl text-xl break-words
                            ${speaker.theme === "dark" 
                              ? "bg-blue-600/90 text-white backdrop-blur-sm" 
                              : "bg-white/90 text-gray-900 backdrop-blur-sm"}
                            ${isLeft 
                              ? "rounded-tl-md" 
                              : "rounded-tr-md"}
                          `}
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

        {/* Bottom Timeline & Controls */}
        <PlayerControls 
          currentTime={currentTime} 
          duration={duration}
          isPlaying={isPlaying}
          onPlayPause={() => setIsPlaying(!isPlaying)}
          onReset={() => {
            setCurrentTime(0);
            setIsPlaying(false);
          }}
          onSeek={(time) => setCurrentTime(time)}
        />

      </div>

      {/* Right Sidebar - Settings */}
      <SettingsPanel config={config} onConfigChange={setConfig} />

    </div>
  );
}

export default App;
