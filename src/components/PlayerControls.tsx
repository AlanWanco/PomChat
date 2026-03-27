import { Play, Pause, SquareSquare, RotateCcw, Volume1, Repeat, Settings2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface PlayerControlsProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  loop: boolean;
  playbackRate: number;
  onPlayPause: () => void;
  onReset: () => void;
  onSeek: (time: number) => void;
  onLoopChange: (loop: boolean) => void;
  onRateChange: (rate: number) => void;
  isDarkMode: boolean;
}

export function PlayerControls({ 
  currentTime, 
  duration, 
  isPlaying, 
  loop,
  playbackRate,
  onPlayPause, 
  onReset, 
  onSeek,
  onLoopChange,
  onRateChange,
  isDarkMode
}: PlayerControlsProps) {
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const speedMenuRef = useRef<HTMLDivElement>(null);
  
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds)) return "00:00.0";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  const rates = [0.5, 1.0, 1.25, 1.5, 2.0];

  // Close speed menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(event.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const bgClass = isDarkMode ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const textClass = isDarkMode ? "text-gray-400" : "text-gray-600";
  const trackBg = isDarkMode ? "bg-gray-800" : "bg-gray-200";
  const tickClass = isDarkMode ? "bg-gray-500" : "bg-gray-300";

  return (
    <div className={`h-24 ${bgClass} border-t flex flex-col px-6 py-2 shrink-0 z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] transition-colors duration-300`}>
      
      {/* Timeline Track */}
      <div className="flex-1 flex items-center group relative cursor-pointer" onClick={(e) => {
        const bounds = e.currentTarget.getBoundingClientRect();
        const percent = (e.clientX - bounds.left) / bounds.width;
        onSeek(Math.max(0, Math.min(percent * duration, duration)));
      }}>
        {/* Background Track */}
        <div className={`w-full h-2 ${trackBg} rounded-full overflow-hidden flex relative`}>
          <div className="absolute inset-0 flex items-center justify-between px-1 opacity-20">
            {Array.from({length: 20}).map((_, i) => (
              <div key={i} className={`h-full w-0.5 ${tickClass}`}></div>
            ))}
          </div>
          {/* Progress Fill */}
          <div 
            className="h-full bg-blue-500 transition-all duration-75 ease-linear"
            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
          />
        </div>
        
        {/* Playhead thumb */}
        <div 
          className={`absolute h-4 w-1.5 ${isDarkMode ? 'bg-white' : 'bg-gray-800'} rounded-sm shadow-md transition-all duration-75 ease-linear`}
          style={{ left: `calc(${duration > 0 ? (currentTime / duration) * 100 : 0}% - 3px)` }}
        />
      </div>

      {/* Controls Row */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-4 w-1/3">
          <span className={`text-xl font-mono font-medium tracking-wider w-24 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            {formatTime(currentTime)}
          </span>
          <span className={`text-xs font-mono ${textClass}`}>/ {formatTime(duration)}</span>
        </div>

        <div className="flex items-center gap-3 w-1/3 justify-center">
          <button 
            onClick={onReset}
            className={`p-2 rounded-full transition-colors ${isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
            title="重新开始"
          >
            <RotateCcw size={18} />
          </button>
          <button 
            onClick={onPlayPause}
            className={`w-12 h-12 flex items-center justify-center rounded-full transition-transform hover:scale-105 ${isPlaying ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'}`}
          >
            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
          </button>
          <button 
            className={`p-2 rounded-full transition-colors ${isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
            title="停止"
            onClick={() => {
              if (isPlaying) onPlayPause();
              onReset();
            }}
          >
            <SquareSquare size={18} />
          </button>
        </div>

        <div className={`flex items-center justify-end gap-4 w-1/3 ${textClass}`}>
          
          {/* Loop Toggle */}
          <button 
            onClick={() => onLoopChange(!loop)}
            className={`p-1.5 rounded transition-colors ${loop ? 'text-blue-500 bg-blue-500/10' : (isDarkMode ? 'hover:text-white hover:bg-gray-800' : 'hover:text-gray-900 hover:bg-gray-100')}`}
            title="循环播放"
          >
            <Repeat size={16} />
          </button>

          {/* Speed Control */}
          <div className="relative flex items-center" ref={speedMenuRef}>
            <button 
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className={`flex items-center gap-1 p-1.5 text-xs font-mono font-bold rounded transition-colors ${isDarkMode ? 'hover:text-white hover:bg-gray-800' : 'hover:text-gray-900 hover:bg-gray-100'} ${showSpeedMenu ? (isDarkMode ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900') : ''}`}
            >
              <Settings2 size={14} />
              {playbackRate.toFixed(1)}x
            </button>
            
            {showSpeedMenu && (
              <div className={`absolute bottom-full right-0 mb-2 flex flex-col border rounded shadow-xl overflow-hidden z-50 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                {rates.map(r => (
                  <button 
                    key={r}
                    onClick={() => {
                      onRateChange(r);
                      setShowSpeedMenu(false);
                    }}
                    className={`px-4 py-2 text-xs font-mono text-left transition-colors ${
                      playbackRate === r 
                        ? (isDarkMode ? 'text-blue-400 bg-gray-900' : 'text-blue-600 bg-gray-50') 
                        : (isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100')
                    }`}
                  >
                    {r.toFixed(1)}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Volume Control - Mock for now */}
          <div className="flex items-center gap-2">
            <Volume1 size={16} />
            <input type="range" className={`w-20 h-1 ${isDarkMode ? 'accent-gray-400' : 'accent-gray-600'}`} defaultValue={80} />
          </div>
        </div>
      </div>

    </div>
  );
}
