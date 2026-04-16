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
  visible?: boolean;
  sourceLineIndex: number;
}

const extractDialogueLineMetas = (content: string) => {
  return content
    .split(/\r?\n/)
    .map((line, index) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('Dialogue:')) {
        return { index, visible: true };
      }
      if (trimmed.startsWith('Comment:')) {
        return { index, visible: false };
      }
      return null;
    })
    .filter((item): item is { index: number; visible: boolean } => Boolean(item));
};

const normalizeSubtitleText = (value: string) => value.replace(/\\N/g, '\n').trim();

const buildSpeakerStyleCandidates = (actorName: string, styleName: string) => {
  const actor = (actorName || '').trim();
  const style = (styleName || '').trim();
  if (!actor || !style || actor === style) {
    return [];
  }
  return [
    `${actor}（${style}）`,
    `${actor} (${style})`,
  ];
};

type SpeakerConfig = Record<string, { name?: string }>;
type ProjectTextItem = {
  type?: string;
  start?: number;
  end?: number;
  text?: string;
  speaker?: string;
  visible?: boolean;
};
type ParsedDialogue = ParsedASS['events']['dialogue'][number];

const mapActorToSpeaker = (speakerConfig: SpeakerConfig, actorName: string, styleName: string) => {
  const keys = Object.keys(speakerConfig);
  const combinedCandidates = buildSpeakerStyleCandidates(actorName, styleName);
  for (const candidate of combinedCandidates) {
    for (const key of keys) {
      if (speakerConfig[key].name === candidate) return key;
    }
  }
  for (const key of keys) {
    if (speakerConfig[key].name === actorName) return key;
  }
  for (const key of keys) {
    if (speakerConfig[key].name === styleName) return key;
  }
  return keys[0] || 'A';
};

const buildSubtitleItems = (dialogues: ParsedDialogue[], dialogueLineMetas: Array<{ index: number; visible: boolean }>, speakerConfig: SpeakerConfig) => {
  return dialogues.reduce((result: SubtitleItem[], dialogue, index: number) => {
    const text = normalizeSubtitleText(dialogue.Text.combined);
    if (!text) {
      return result;
    }

    result.push({
      id: `sub-${dialogueLineMetas[index]?.index ?? index}`,
      start: dialogue.Start,
      end: dialogue.End,
      duration: Number((dialogue.End - dialogue.Start).toFixed(2)),
      style: dialogue.Style,
      actor: dialogue.Name || dialogue.Style,
      text,
      speakerId: mapActorToSpeaker(speakerConfig, dialogue.Name, dialogue.Style),
      visible: dialogueLineMetas[index]?.visible ?? true,
      sourceLineIndex: dialogueLineMetas[index]?.index ?? index
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
    const hasAssOverride = Boolean(assContentOverride && assContentOverride.trim().length > 0);

    const shouldUseProjectContent = Array.isArray(projectContent)
      && projectContent.length > 0
      && (subtitleFormat === 'srt' || subtitleFormat === 'lrc' || subtitleFormat === 'ass' || (!window.electron && !hasAssOverride) || !assPath);

    if (hasAssOverride && !shouldUseProjectContent) {
      Promise.resolve().then(() => {
        if (!cancelled) {
          setLoading(true);
        }
      });

      Promise.resolve(assContentOverride as string)
        .then((text: string) => {
          if (cancelled) return;
          const parsed = parse(text);
          const dialogueLineMetas = extractDialogueLineMetas(text);
          const items = buildSubtitleItems(parsed.events.dialogue, dialogueLineMetas, speakerConfig);

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
          visible: item.visible !== false,
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
        const dialogueLineMetas = extractDialogueLineMetas(text);
        const items = buildSubtitleItems(parsed.events.dialogue, dialogueLineMetas, speakerConfig);

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
  }, [assPath, assContentOverride, projectContent, subtitleFormat]);

  return { subtitles, setSubtitles, loading, error };
}
