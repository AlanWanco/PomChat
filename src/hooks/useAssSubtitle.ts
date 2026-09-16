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

type ParsedAssEvent = {
  dialogue: ParsedASS['events']['dialogue'][number];
  sourceLineIndex: number;
  visible: boolean;
};

const parseAssEvents = (content: string): ParsedAssEvent[] => {
  const parsed = parse(content);
  let dialogueIndex = 0;
  let commentIndex = 0;

  return content
    .split(/\r?\n/)
    .map((line, sourceLineIndex) => {
      const eventType = line.trimStart().match(/^(Dialogue|Comment)\s*:/i)?.[1]?.toLowerCase();
      if (eventType === 'dialogue') {
        const dialogue = parsed.events.dialogue[dialogueIndex++];
        return dialogue ? { dialogue, sourceLineIndex, visible: true } : null;
      }
      if (eventType === 'comment') {
        const dialogue = parsed.events.comment[commentIndex++];
        return dialogue ? { dialogue, sourceLineIndex, visible: false } : null;
      }
      return null;
    })
    .filter((item): item is ParsedAssEvent => Boolean(item));
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

const buildSubtitleItems = (events: ParsedAssEvent[], speakerConfig: SpeakerConfig) => {
  return events.reduce((result: SubtitleItem[], event) => {
    const { dialogue, sourceLineIndex, visible } = event;
    const text = normalizeSubtitleText(dialogue.Text.combined);
    if (!text) {
      return result;
    }

    result.push({
      id: `sub-${sourceLineIndex}`,
      start: dialogue.Start,
      end: dialogue.End,
      duration: Number((dialogue.End - dialogue.Start).toFixed(2)),
      style: dialogue.Style,
      actor: dialogue.Name || dialogue.Style,
      text,
      speakerId: mapActorToSpeaker(speakerConfig, dialogue.Name, dialogue.Style),
      visible,
      sourceLineIndex
    });

    return result;
  }, []);
};

export type SubtitleSource = {
  assPath: string;
  assContentOverride?: string | null;
  projectContent?: ProjectTextItem[];
  subtitleFormat?: 'ass' | 'srt' | 'lrc';
  /** Distinguishes relative resource paths belonging to different projects. */
  projectPath?: string | null;
};
const sourceIdentity = (source: SubtitleSource) => JSON.stringify([
  source.assPath, source.assContentOverride, source.projectContent, source.subtitleFormat, source.projectPath,
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
  if (hasOverride) return buildSubtitleItems(parseAssEvents(assContentOverride!), speakers);
  return assPath && window.electron ? null : [];
}

export function useAssSubtitle(
  assPath: string,
  speakerConfig: SpeakerConfig,
  assContentOverride?: string | null,
  projectContent?: ProjectTextItem[],
  subtitleFormat?: 'ass' | 'srt' | 'lrc',
  projectPath?: string | null
) {
  const source = { assPath, assContentOverride, projectContent, subtitleFormat, projectPath };
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
          items = buildSubtitleItems(parseAssEvents(text), speakerConfig);
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
