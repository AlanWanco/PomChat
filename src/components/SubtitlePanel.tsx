import { FileText, Clock } from 'lucide-react';
import type { SubtitleItem } from '../hooks/useAssSubtitle';

interface SubtitlePanelProps {
  subtitles: SubtitleItem[];
  currentTime: number;
  isDarkMode: boolean;
  onSeek: (time: number) => void;
}

export function SubtitlePanel({ subtitles, currentTime, isDarkMode, onSeek }: SubtitlePanelProps) {
  const bgClass = isDarkMode ? "bg-gray-900 border-gray-800 text-gray-300" : "bg-white border-gray-200 text-gray-700";
  const headerClass = isDarkMode ? "bg-gray-950 border-gray-800 text-white" : "bg-gray-50 border-gray-200 text-gray-900";
  const activeClass = isDarkMode ? "bg-blue-900/40 border-blue-500/50" : "bg-blue-50 border-blue-300";
  const hoverClass = isDarkMode ? "hover:bg-gray-800" : "hover:bg-gray-100";
  const cardBg = isDarkMode ? "bg-gray-800/50 border-gray-800/50" : "bg-white border-gray-200";

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`h-full flex flex-col overflow-hidden ${bgClass}`}>
      <div className={`p-4 border-b flex items-center justify-between shrink-0 ${headerClass}`}>
        <h2 className="font-bold flex items-center gap-2 text-sm">
          <FileText size={16} /> 实时字幕序列
        </h2>
        <div className="text-xs opacity-60">共 {subtitles.length} 条</div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-2">
        {subtitles.length === 0 ? (
          <div className="p-8 text-center text-xs opacity-50">加载中或无数据...</div>
        ) : (
          subtitles.map((sub) => {
            const isActive = currentTime >= sub.start && currentTime <= sub.end;
            return (
              <div 
                key={sub.id}
                onClick={() => onSeek(sub.start)}
                className={`p-3 rounded-lg border text-xs cursor-pointer transition-colors duration-200 ${isActive ? activeClass : `${cardBg} ${hoverClass}`}`}
              >
                <div className="flex justify-between items-center mb-2 opacity-70">
                  <div className="flex items-center gap-1 font-mono text-[10px]">
                    <Clock size={10} />
                    <span>{formatTime(sub.start)} - {formatTime(sub.end)}</span>
                  </div>
                  <span className="bg-gray-500/20 px-1.5 py-0.5 rounded text-[10px]">
                    {sub.duration}s
                  </span>
                </div>
                
                <div className="flex gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] self-start shrink-0 font-bold ${isDarkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-800'}`}>
                    {sub.actor || sub.style}
                  </span>
                  <p className="leading-relaxed line-clamp-2">{sub.text}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
