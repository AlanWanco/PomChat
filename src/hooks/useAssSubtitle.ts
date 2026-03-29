import { useState, useEffect } from 'react';
import { parse, type ParsedASS } from 'ass-compiler';

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

type SpeakerConfig = Record<string, { name?: string }>;
type ProjectTextItem = {
  type?: string;
  start?: number;
  end?: number;
  text?: string;
  speaker?: string;
};
type ParsedDialogue = ParsedASS['events']['dialogue'][number];

const mapActorToSpeaker = (speakerConfig: SpeakerConfig, actorName: string, styleName: string) => {
  const keys = Object.keys(speakerConfig);
  for (const key of keys) {
    if (speakerConfig[key].name === actorName) return key;
  }
  for (const key of keys) {
    if (speakerConfig[key].name === styleName) return key;
  }
  return keys[0] || 'A';
};

const buildSubtitleItems = (dialogues: ParsedDialogue[], dialogueLineIndexes: number[], speakerConfig: SpeakerConfig) => {
  return dialogues.reduce((result: SubtitleItem[], dialogue, index: number) => {
    const text = normalizeSubtitleText(dialogue.Text.combined);
    if (!text) {
      return result;
    }

    result.push({
      id: `sub-${dialogueLineIndexes[index] ?? index}`,
      start: dialogue.Start,
      end: dialogue.End,
      duration: Number((dialogue.End - dialogue.Start).toFixed(2)),
      style: dialogue.Style,
      actor: dialogue.Name || dialogue.Style,
      text,
      speakerId: mapActorToSpeaker(speakerConfig, dialogue.Name, dialogue.Style),
      sourceLineIndex: dialogueLineIndexes[index] ?? index
    });

    return result;
  }, []);
};

export function useAssSubtitle(
  assPath: string,
  speakerConfig: SpeakerConfig,
  assContentOverride?: string | null,
  projectContent?: ProjectTextItem[],
  subtitleFormat?: 'ass' | 'srt' | 'lrc'
) {
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const shouldUseProjectContent = Array.isArray(projectContent)
      && projectContent.length > 0
      && (!window.electron || subtitleFormat === 'srt' || subtitleFormat === 'lrc' || !assPath);

    if (assContentOverride && !shouldUseProjectContent) {
      Promise.resolve().then(() => {
        if (!cancelled) {
          setLoading(true);
        }
      });

      Promise.resolve(assContentOverride)
        .then((text: string) => {
          if (cancelled) return;
          const parsed = parse(text);
          const dialogueLineIndexes = extractDialogueLineIndexes(text);
          const items = buildSubtitleItems(parsed.events.dialogue, dialogueLineIndexes, speakerConfig);

          setSubtitles(items);
          setError(null);
        })
        .catch((err: Error) => {
          if (cancelled) return;
          console.error(err);
          setError(err.message);
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }

    if (shouldUseProjectContent) {
      const items: SubtitleItem[] = projectContent
        .filter((item): item is ProjectTextItem => Boolean(item) && typeof item === 'object' && item.type === 'text')
        .map((item, index) => ({
          id: `sub-${index}`,
          start: Number(item.start || 0),
          end: Number(item.end || 0),
          duration: Number(((item.end || 0) - (item.start || 0)).toFixed(2)),
          style: item.speaker ? (speakerConfig[item.speaker]?.name || 'Default') : 'Default',
          actor: item.speaker ? (speakerConfig[item.speaker]?.name || item.speaker) : '',
          text: normalizeSubtitleText(item.text || ''),
          speakerId: item.speaker || Object.keys(speakerConfig || {})[0] || 'A',
          sourceLineIndex: index
        }));

      const timer = window.setTimeout(() => {
        setSubtitles(items);
        setError(null);
        setLoading(false);
      }, 0);

      return () => {
        window.clearTimeout(timer);
      };
    }

    if (!assPath || !window.electron) {
      const timer = window.setTimeout(() => setSubtitles([]), 0);
      return () => {
        window.clearTimeout(timer);
      };
    }
    
    Promise.resolve().then(() => {
      if (!cancelled) {
        setLoading(true);
      }
    });

    window.electron.readFile(assPath)
      .then((text: string) => {
        if (cancelled) return;
        const parsed = parse(text);
        const dialogueLineIndexes = extractDialogueLineIndexes(text);
        const items = buildSubtitleItems(parsed.events.dialogue, dialogueLineIndexes, speakerConfig);

        setSubtitles(items);
        setError(null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        console.error(err);
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assPath, assContentOverride, projectContent, speakerConfig, subtitleFormat]);

  return { subtitles, setSubtitles, loading, error };
}
