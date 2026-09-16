import { useState, useEffect, useRef, useCallback } from 'react';
import { useLiveState } from './useLiveState';
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

type SpeakerConfig = Record<string, {
  name?: string;
  assActorName?: string;
  assStyleName?: string;
  assStyleNames?: string[];
}>;
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
  const actor = (actorName || '').trim();
  const style = (styleName || '').trim();

  for (const key of keys) {
    const speaker = speakerConfig[key] || {};
    if (speaker.assActorName && speaker.assStyleName) {
      if (speaker.assActorName.trim() === actor && speaker.assStyleName.trim() === style) {
        return key;
      }
    }
  }

  for (const key of keys) {
    const speaker = speakerConfig[key] || {};
    if (Array.isArray(speaker.assStyleNames) && style) {
      if (speaker.assStyleNames.some((item) => (item || '').trim() === style)) {
        if (!speaker.assActorName || speaker.assActorName.trim() === actor) {
          return key;
        }
      }
    }
  }

  for (const key of keys) {
    const speaker = speakerConfig[key] || {};
    if (speaker.assStyleName && speaker.assStyleName.trim() === style) {
      if (!speaker.assActorName || speaker.assActorName.trim() === actor) {
        return key;
      }
    }
  }

  for (const key of keys) {
    const speaker = speakerConfig[key] || {};
    if (speaker.assActorName && speaker.assActorName.trim() === actor) {
      return key;
    }
  }

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

export type SubtitleSource = {
  assPath: string;
  assContentOverride?: string | null;
  projectContent?: ProjectTextItem[];
  subtitleFormat?: 'ass' | 'srt' | 'lrc';
};
const sourceIdentity = (source: SubtitleSource) => JSON.stringify([
  source.assPath, source.assContentOverride, source.projectContent, source.subtitleFormat,
]);

export function parseSubtitleSource(source: SubtitleSource, speakers: SpeakerConfig): SubtitleItem[] | null {
  const { assPath, assContentOverride, projectContent, subtitleFormat } = source;
  const hasOverride = Boolean(assContentOverride?.trim());
  // A supplied empty project list is authoritative for plain subtitle formats.
  const useProject = Array.isArray(projectContent) && (
    subtitleFormat === 'srt' || subtitleFormat === 'lrc' ||
    (projectContent.length > 0 && (subtitleFormat === 'ass' || !assPath || (!window.electron && !hasOverride)))
  );
  if (useProject) {
    return projectContent.filter(item => item?.type === 'text').map((item, index) => ({
      id: `sub-${index}`,
      start: Number(item.start || 0), end: Number(item.end || 0),
      duration: Number(((item.end || 0) - (item.start || 0)).toFixed(2)),
      style: item.speaker ? (speakers[item.speaker]?.name || 'Default') : 'Default',
      actor: item.speaker ? (speakers[item.speaker]?.name || item.speaker) : '',
      text: normalizeSubtitleText(item.text || ''),
      speakerId: item.speaker || Object.keys(speakers)[0] || 'A',
      visible: item.visible !== false, sourceLineIndex: index,
    }));
  }
  if (hasOverride) return buildSubtitleItems(parse(assContentOverride!).events.dialogue, extractDialogueLineMetas(assContentOverride!), speakers);
  return assPath && window.electron ? null : [];
}

export function useAssSubtitle(
  assPath: string,
  speakerConfig: SpeakerConfig,
  assContentOverride?: string | null,
  projectContent?: ProjectTextItem[],
  subtitleFormat?: 'ass' | 'srt' | 'lrc'
) {
  const source = { assPath, assContentOverride, projectContent, subtitleFormat };
  const sourceKey = sourceIdentity(source);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const [subtitles, updateSubtitles, subtitlesRef] = useLiveState<SubtitleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const [loadRevision, setLoadRevision] = useState(0);
  const acceptedSource = useRef<string | null>(null);
  const restoreSubtitles = useCallback((items: SubtitleItem[], restoredSource: SubtitleSource) => {
    generation.current++;
    acceptedSource.current = sourceIdentity(restoredSource);
    updateSubtitles(structuredClone(items));
    setLoading(false);
    setError(null);
  }, [updateSubtitles]);
  const setSubtitles = useCallback((action: React.SetStateAction<SubtitleItem[]>) => {
    restoreSubtitles(typeof action === 'function' ? action(subtitlesRef.current) : action, sourceRef.current);
  }, [restoreSubtitles, subtitlesRef]);
  const invalidateSubtitleLoads = useCallback(() => {
    generation.current++;
    acceptedSource.current = null;
    updateSubtitles([]);
    setLoadRevision(value => value + 1);
  }, [updateSubtitles]);

  useEffect(() => {
    if (acceptedSource.current === sourceKey) return;
    const loadGeneration = ++generation.current;
    let cancelled = false;
    const isStale = () => cancelled || generation.current !== loadGeneration;
    const load = async () => {
      try {
        setLoading(true);
        let items = parseSubtitleSource(source, speakerConfig);
        if (items === null) {
          const text = await window.electron!.readFile(assPath);
          if (isStale()) return;
          items = buildSubtitleItems(parse(text).events.dialogue, extractDialogueLineMetas(text), speakerConfig);
        }
        if (isStale()) return;
        acceptedSource.current = sourceKey;
        updateSubtitles(items);
        setError(null);
      } catch (err) {
        if (!isStale()) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!isStale()) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
    // Speaker styling and object identity changes must not reload edited subtitles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, loadRevision]);

  return { subtitles, setSubtitles, subtitlesRef, restoreSubtitles, invalidateSubtitleLoads, loading, error };
}
