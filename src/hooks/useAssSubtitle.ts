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
  speakerId: string;
  sourceLineIndex: number;
}

const extractDialogueLineIndexes = (content: string) => {
  return content
    .split(/\r?\n/)
    .map((line, index) => (line.startsWith('Dialogue:') ? index : -1))
    .filter((index) => index !== -1);
};

const normalizeSubtitleText = (value: string) => value.replace(/\\N/g, '\n').trim();

export function useAssSubtitle(assPath: string, speakerConfig: any) {
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assPath || !window.electron) {
      setSubtitles([]);
      return;
    }
    
    setLoading(true);
    window.electron.readFile(assPath)
      .then((text: string) => {
        const parsed = parse(text);
        const dialogues = parsed.events.dialogue;
        const dialogueLineIndexes = extractDialogueLineIndexes(text);
        
        const mapActorToSpeaker = (actorName: string, styleName: string) => {
          const keys = Object.keys(speakerConfig);
          for (const key of keys) {
            if (speakerConfig[key].name === actorName) return key;
          }
          for (const key of keys) {
            if (speakerConfig[key].name === styleName) return key;
          }
          return keys[0] || 'A';
        };

        const items: SubtitleItem[] = dialogues.reduce((result: SubtitleItem[], d: any, index: number) => {
          const text = normalizeSubtitleText(d.Text.combined);
          if (!text) {
            return result;
          }

          result.push({
            id: `sub-${dialogueLineIndexes[index] ?? index}`,
            start: d.Start,
            end: d.End,
            duration: Number((d.End - d.Start).toFixed(2)),
            style: d.Style,
            actor: d.Name || d.Style,
            text,
            speakerId: mapActorToSpeaker(d.Name, d.Style),
            sourceLineIndex: dialogueLineIndexes[index] ?? index
          });

          return result;
        }, []);

        setSubtitles(items);
        setError(null);
      })
      .catch((err: any) => {
        console.error(err);
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [assPath]);

  return { subtitles, setSubtitles, loading, error };
}
