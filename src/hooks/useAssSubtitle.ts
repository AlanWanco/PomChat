import { useState, useEffect } from 'react';
import { parse } from 'ass-compiler';

export interface SubtitleItem {
  id: string;
  start: number;
  end: number;
  duration: number;
  style: string;
  actor: string;
  text: string;
  speakerId: string; // Mapped to our config
}

export function useAssSubtitle(assPath: string, speakerConfig: any) {
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assPath) return;
    
    setLoading(true);
    fetch(assPath)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load ASS file');
        return res.text();
      })
      .then(text => {
        const parsed = parse(text);
        const dialogues = parsed.events.dialogue;
        
        // Very basic mapping: find a speaker key by name, or fallback to 'A'
        const mapActorToSpeaker = (actorName: string) => {
          const keys = Object.keys(speakerConfig);
          // Try to match by actor name first
          for (const key of keys) {
            if (speakerConfig[key].name === actorName) return key;
          }
          // If no match, let's alternate based on some logic, or just return first key
          return keys[0] || 'A';
        };

        const items: SubtitleItem[] = dialogues.map((d: any, index: number) => ({
          id: `sub-${index}`,
          start: d.Start,
          end: d.End,
          duration: Number((d.End - d.Start).toFixed(2)),
          style: d.Style,
          actor: d.Name || d.Style,
          text: d.Text.combined.replace(/\\N/g, '\n'), // Handle newlines
          speakerId: mapActorToSpeaker(d.Name)
        }));

        setSubtitles(items);
        setError(null);
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [assPath, speakerConfig]);

  return { subtitles, loading, error };
}
