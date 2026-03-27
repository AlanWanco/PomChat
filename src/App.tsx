import { useState, useEffect } from 'react';
import { mockData } from './mockData';
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
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Simple timer for previewing timeline playback
  useEffect(() => {
    let timer: number;
    if (isPlaying) {
      timer = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= 10) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 0.1;
        });
      }, 100);
    }
    return () => clearInterval(timer);
  }, [isPlaying]);

  return (
    <div className="w-full min-h-screen bg-gray-900 flex justify-center items-center p-4 font-sans text-white">
      {/* Phone container mockup (1080x1920 scaled down) */}
      <div className="relative w-full max-w-[400px] h-[800px] bg-gray-950 rounded-[40px] shadow-2xl border-8 border-gray-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gray-800/80 backdrop-blur-md p-4 pt-12 text-center shadow-md z-10 sticky top-0">
          <h1 className="text-xl font-bold">{mockData.projectTitle}</h1>
          <p className="text-xs text-gray-400">时间线测试: {currentTime.toFixed(1)}s</p>
        </div>

        {/* Chat Stream */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 pb-20 scroll-smooth">
          {(mockData.content as ContentItem[]).map((item, index) => {
            const speaker = (mockData.speakers as Record<string, Speaker>)[item.speaker];
            const isVisible = currentTime >= item.start;
            const isLeft = speaker.side === "left";

            // Only show messages that have started
            if (!isVisible) return null;

            return (
              <div
                key={index}
                className={`flex w-full ${isLeft ? "justify-start" : "justify-end"} animate-fade-in`}
              >
                <div className={`flex max-w-[80%] gap-3 ${isLeft ? "flex-row" : "flex-row-reverse"}`}>
                  {/* Avatar */}
                  <img
                    src={speaker.avatar}
                    alt={speaker.name}
                    className="w-10 h-10 rounded-full border-2 border-gray-700 bg-gray-800 shrink-0"
                  />
                  
                  {/* Bubble & Name */}
                  <div className={`flex flex-col ${isLeft ? "items-start" : "items-end"}`}>
                    <span className="text-xs text-gray-400 mb-1 px-1">{speaker.name}</span>
                    
                    {/* Content */}
                    <div 
                      className={`
                        p-3 rounded-2xl shadow-sm break-words
                        ${speaker.theme === "dark" 
                          ? "bg-blue-600 text-white" 
                          : "bg-gray-100 text-gray-900"}
                        ${isLeft 
                          ? "rounded-tl-sm" 
                          : "rounded-tr-sm"}
                      `}
                    >
                      {item.type === "text" ? (
                        <p className="text-sm md:text-base leading-relaxed">{item.text}</p>
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

      {/* Editor Controls Overlay */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gray-800/90 backdrop-blur-md p-4 rounded-full flex gap-4 shadow-xl border border-gray-700">
        <button
          onClick={() => {
            setCurrentTime(0);
            setIsPlaying(false);
          }}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-full text-sm font-medium transition-colors"
        >
          重置
        </button>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className={`px-8 py-2 rounded-full text-sm font-bold transition-colors ${
            isPlaying 
              ? "bg-red-500 hover:bg-red-600 text-white" 
              : "bg-blue-500 hover:bg-blue-600 text-white"
          }`}
        >
          {isPlaying ? "暂停预览" : "播放时间轴"}
        </button>
      </div>
    </div>
  );
}

export default App;
