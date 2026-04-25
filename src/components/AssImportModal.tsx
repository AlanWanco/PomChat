import React, { useState, useEffect } from 'react';
import { parse, type ParsedASS } from 'ass-compiler';
import { X } from 'lucide-react';
import { translate, type Language } from '../i18n';
import { createThemeTokens } from '../theme';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parseAssColor = (value?: string) => {
  if (!value) return null;

  let alpha = '00';
  let color = '';

  const hexMatch = value.match(/&?H?([0-9a-f]{2})?([0-9a-f]{6})/i);
  if (hexMatch) {
    alpha = hexMatch[1] || '00';
    color = hexMatch[2];
  } else {
    const numeric = Number.parseInt(value, 10);
    if (Number.isNaN(numeric)) {
      return null;
    }

    const normalized = `00000000${(numeric < 0 ? numeric + 4294967296 : numeric).toString(16)}`.slice(-8);
    alpha = normalized.slice(0, 2);
    color = normalized.slice(2);
  }

  if (color.length !== 6) {
    return null;
  }

  const bb = color.slice(0, 2);
  const gg = color.slice(2, 4);
  const rr = color.slice(4, 6);
  const opacity = clamp(1 - Number.parseInt(alpha, 16) / 255, 0, 1);

  return {
    hex: `#${rr}${gg}${bb}`.toUpperCase(),
    opacity: Number(opacity.toFixed(2))
  };
};

type ParsedAssStyle = ParsedASS['styles']['style'][number];
type ParsedAssDialogue = ParsedASS['events']['dialogue'][number];
type AssColorInfo = ReturnType<typeof parseAssColor>;
type ImportedSpeakerMap = Record<string, {
  name: string;
  avatar: string;
  side: 'left' | 'right' | 'center';
  type?: 'annotation' | 'speaker';
  preset?: string;
  style: Record<string, string | number>;
}>;
type ImportedPresetMap = Record<string, {
  style: Record<string, string | number>;
  avatar: string;
  side: 'left' | 'right' | 'center';
}>;
type StylePreviewRow = {
  id: string;
  speakerLabel: string;
  matchedStyleName: string;
  bubbleColor: AssColorInfo;
  borderColor: AssColorInfo;
  textColor: AssColorInfo;
  borderWidth: number | null;
  fontName?: string;
};

const PREVIEW_ROWS_PER_TAB = 8;
const buildAssPresetKey = (styleName: string) => `ASS:${styleName || 'Default'}:${Math.floor(Date.now() / 1000)}`;
const ASS_PRESET_KEY_RE = /^ASS:(.*?):\d+$/;

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const findMatchingAssPresetKey = (styleName: string, style: Record<string, string | number>, presets: ImportedPresetMap) => {
  const normalizedStyleName = (styleName || 'Default').trim();
  const styleSignature = stableStringify(style);
  return Object.entries(presets).find(([presetKey, preset]) => {
    const match = presetKey.match(ASS_PRESET_KEY_RE);
    if (!match) {
      return false;
    }
    return match[1] === normalizedStyleName && stableStringify(preset?.style || {}) === styleSignature;
  })?.[0];
};

const getPreferredStylesByName = (dialogues: ParsedAssDialogue[]) => {
  const counts = new Map<string, Map<string, number>>();

  dialogues.forEach((dialogue) => {
    if (!dialogue?.Name || !dialogue?.Style) {
      return;
    }

    const styleCounts = counts.get(dialogue.Name) || new Map<string, number>();
    styleCounts.set(dialogue.Style, (styleCounts.get(dialogue.Style) || 0) + 1);
    counts.set(dialogue.Name, styleCounts);
  });

  const preferred = new Map<string, string>();
  counts.forEach((styleCounts, name) => {
    let selectedStyle = '';
    let maxCount = -1;
    styleCounts.forEach((count, styleName) => {
      if (count > maxCount) {
        selectedStyle = styleName;
        maxCount = count;
      }
    });
    if (selectedStyle) {
      preferred.set(name, selectedStyle);
    }
  });

  return preferred;
};

const getStylesByName = (dialogues: ParsedAssDialogue[]) => {
  const stylesByName = new Map<string, string[]>();

  dialogues.forEach((dialogue) => {
    if (!dialogue?.Name || !dialogue?.Style) {
      return;
    }

    const existing = stylesByName.get(dialogue.Name) || [];
    if (!existing.includes(dialogue.Style)) {
      existing.push(dialogue.Style);
    }
    stylesByName.set(dialogue.Name, existing);
  });

  return stylesByName;
};

const formatImportedSpeakerName = (language: Language, name: string, styleName: string, includeStyle: boolean) => {
  if (!includeStyle || !styleName || styleName === name) {
    return name;
  }
  return language === 'zh-CN' ? `${name}（${styleName}）` : `${name} (${styleName})`;
};

const getImportedSpeakerStyle = (assStyle: ParsedAssStyle | undefined, isAnnotation: boolean) => {
  const primaryColor = parseAssColor(assStyle?.PrimaryColour);
  const outlineColor = parseAssColor(assStyle?.OutlineColour);
  const backColor = parseAssColor(assStyle?.BackColour);
  const outlineWidth = Number(assStyle?.Outline);
  const fontFamily = assStyle?.Fontname && assStyle.Fontname.trim() ? assStyle.Fontname : undefined;

  return {
    bgColor: outlineColor?.hex || (isAnnotation ? '#111827' : '#2563eb'),
    textColor: primaryColor?.hex || (isAnnotation ? '#ffffff' : '#ffffff'),
    nameColor: primaryColor?.hex || '#ffffff',
    borderColor: backColor?.hex || '#ffffff',
    borderOpacity: backColor?.opacity ?? 1,
    opacity: outlineColor?.opacity ?? 0.9,
    borderWidth: Number.isFinite(outlineWidth) && outlineWidth > 0 ? Math.round(outlineWidth) : 0,
    ...(fontFamily && { fontFamily })
  };
};

const getBaseImportedStyle = (isAnnotation: boolean, charCode: number) => ({
  bgColor: isAnnotation ? '#111827' : (charCode % 2 === 0 ? '#2563eb' : '#f3f4f6'),
  textColor: isAnnotation ? '#ffffff' : (charCode % 2 === 0 ? '#ffffff' : '#111827'),
  borderRadius: 28,
  ...(isAnnotation ? { annotationBorderRadius: 28 } : {}),
  opacity: 0.9,
  borderWidth: 0,
  avatarBorderColor: '#ffffff',
  borderColor: '#ffffff',
  borderOpacity: 1.0,
  margin: isAnnotation ? 10 : 14,
  paddingX: isAnnotation ? 24 : 20,
  paddingY: isAnnotation ? 12 : 12,
  shadowSize: 1,
  animationStyle: 'rise',
  animationDuration: 0.2,
  fontFamily: 'system-ui',
  fontSize: isAnnotation ? 24 : 30,
  fontWeight: 'normal',
  nameColor: '#ffffff',
  annotationPosition: 'bottom',
  annotationAlign: 'center',
  annotationMarginX: 0,
});

interface AssImportModalProps {
  assPath: string;
  assContent: string;
  existingPresets: ImportedPresetMap;
  existingAnnotationPresets: ImportedPresetMap;
  onConfirm: (path: string, newSpeakers: ImportedSpeakerMap, newPresets: ImportedPresetMap, newAnnotationPresets: ImportedPresetMap) => void | Promise<void>;
  onCancel: () => void;
  isDarkMode: boolean;
  language: Language;
  themeColor: string;
  secondaryThemeColor: string;
}

export function AssImportModal({ assPath, assContent, existingPresets, existingAnnotationPresets, onConfirm, onCancel, isDarkMode, language, themeColor, secondaryThemeColor }: AssImportModalProps): React.JSX.Element {
  const t = (key: string, vars?: Record<string, string | number>) => translate(language, key, vars);
  const uiTheme = createThemeTokens(themeColor, isDarkMode);
  const [names, setNames] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [selectedStyles, setSelectedStyles] = useState<Set<string>>(new Set());
  const [parsedAss, setParsedAss] = useState<ParsedASS | null>(null);
  const [previewTabIndex, setPreviewTabIndex] = useState(0);

  useEffect(() => {
    try {
      const parsed = parse(assContent);
      setParsedAss(parsed);
      const nameSet = new Set<string>();
      const styleSet = new Set<string>();
      
      parsed.events.dialogue.forEach(d => {
        if (d.Name) nameSet.add(d.Name);
      });

      parsed.styles.style.forEach((style) => {
        if (style?.Name) {
          styleSet.add(style.Name);
        }
      });
      
      setNames(Array.from(nameSet));
      setStyles(Array.from(styleSet));
      
      const preferredStylesByName = getPreferredStylesByName(parsed.events.dialogue || []);
      const stylesByName = getStylesByName(parsed.events.dialogue || []);
      const initialNames = new Set<string>(Array.from(nameSet));
      const initialStyles = new Set<string>();
      if (nameSet.size > 0) {
        nameSet.forEach((name) => {
          const relatedStyles = stylesByName.get(name) || [];
          if (relatedStyles.length > 0) {
            relatedStyles.forEach((styleName) => initialStyles.add(styleName));
            return;
          }
          const fallbackStyle = preferredStylesByName.get(name);
          if (fallbackStyle) initialStyles.add(fallbackStyle);
        });
      } else {
        const usedStyleSet = new Set<string>();
        parsed.events.dialogue.forEach((dialogue) => {
          if (dialogue?.Style && styleSet.has(dialogue.Style)) {
            usedStyleSet.add(dialogue.Style);
          }
        });
        if (usedStyleSet.size > 0) {
          usedStyleSet.forEach((styleName) => initialStyles.add(styleName));
        } else {
          styleSet.forEach((styleName) => initialStyles.add(styleName));
        }
      }
      setSelectedNames(initialNames);
      setSelectedStyles(initialStyles);
    } catch (e) {
      console.error("ASS Parse error:", e);
      setParsedAss(null);
    }
  }, [assContent]);

  useEffect(() => {
    setPreviewTabIndex(0);
  }, [selectedNames, selectedStyles]);

  const preferredStylesByName = getPreferredStylesByName(parsedAss?.events?.dialogue || []);
  const stylesByName = getStylesByName(parsedAss?.events?.dialogue || []);

  const toggleName = (name: string) => {
    const nextNames = new Set(selectedNames);
    if (nextNames.has(name)) {
      nextNames.delete(name);
    } else {
      nextNames.add(name);
      const nextStyles = new Set(selectedStyles);
      const relatedStyles = stylesByName.get(name) || [];
      if (relatedStyles.length > 0) {
        relatedStyles.forEach((styleName) => nextStyles.add(styleName));
      } else {
        const mappedStyle = preferredStylesByName.get(name);
        if (mappedStyle) nextStyles.add(mappedStyle);
      }
      setSelectedStyles(nextStyles);
    }
    setSelectedNames(nextNames);
  };

  const toggleStyle = (styleName: string) => {
    const next = new Set(selectedStyles);
    if (next.has(styleName)) next.delete(styleName);
    else next.add(styleName);
    setSelectedStyles(next);
  };

  const handleConfirm = async () => {
    let latestParsedAss: ParsedASS | null = parsedAss;

    if (!latestParsedAss) {
      try {
        latestParsedAss = parse(assContent);
      } catch (error) {
        console.error('ASS Parse error:', error);
      }
    }

    const assStylesByName = new Map<string, ParsedAssStyle>(
      (latestParsedAss?.styles?.style || []).map((style) => [style.Name, style])
    );
    const preferredStylesByName = getPreferredStylesByName(latestParsedAss?.events?.dialogue || []);
    const newSpeakers: ImportedSpeakerMap = {};
    const newPresets: ImportedPresetMap = {};
    const newAnnotationPresets: ImportedPresetMap = {};
    const availablePresets: ImportedPresetMap = { ...(existingPresets || {}) };
    const availableAnnotationPresets: ImportedPresetMap = { ...(existingAnnotationPresets || {}) };
    const createdSpeakerKeys = new Set<string>();
    const stylesBoundByNames = new Set<string>();
    let charCode = 65; // 'A'

    const ensurePresetKey = (styleName: string, mergedStyle: Record<string, string | number>, isAnnotation: boolean) => {
      const presetPool = isAnnotation ? availableAnnotationPresets : availablePresets;
      const pendingPool = isAnnotation ? newAnnotationPresets : newPresets;
      const matchedExistingKey = findMatchingAssPresetKey(styleName, mergedStyle, presetPool);
      if (matchedExistingKey) {
        return matchedExistingKey;
      }
      const assPresetKey = buildAssPresetKey(styleName || 'Default');
      pendingPool[assPresetKey] = {
        style: mergedStyle,
        avatar: '',
        side: isAnnotation ? 'center' : 'left'
      };
      presetPool[assPresetKey] = pendingPool[assPresetKey];
      return assPresetKey;
    };

    selectedStyles.forEach((styleName) => {
      const isAnnotationStyle = /注释/.test(styleName);
      if (isAnnotationStyle) {
        return;
      }
      const baseStyle = getBaseImportedStyle(false, charCode);
      const importedStyle = getImportedSpeakerStyle(assStylesByName.get(styleName), false);
      const mergedStyle = { ...baseStyle, ...importedStyle };
      ensurePresetKey(styleName || 'Default', mergedStyle, false);
    });

    Array.from(selectedNames).forEach((name) => {
      const isAnnotation = /注释/.test(name);
      const candidateStyles = (stylesByName.get(name) || []).filter((styleName) => selectedStyles.has(styleName));
      const fallbackStyle = preferredStylesByName.get(name) || name;
      const styleVariants = candidateStyles.length > 0 ? candidateStyles : [fallbackStyle];
      const shouldIncludeStyleInName = styleVariants.length > 1;

      styleVariants.forEach((styleName) => {
        const hasSelectedStyle = selectedStyles.has(styleName);
        const baseStyle = getBaseImportedStyle(isAnnotation, charCode);
        const importedStyle = getImportedSpeakerStyle(assStylesByName.get(styleName), isAnnotation);
        const mergedStyle = hasSelectedStyle ? { ...baseStyle, ...importedStyle } : baseStyle;
        const assPresetKey = hasSelectedStyle ? ensurePresetKey(styleName || name || 'Default', mergedStyle, isAnnotation) : undefined;
        const displayName = isAnnotation
          ? '注释'
          : formatImportedSpeakerName(language, name || `角色${String.fromCharCode(charCode)}`, styleName, shouldIncludeStyleInName);
        const normalizedSpeakerName = displayName.trim().toLowerCase();
        const speakerUniqueKey = isAnnotation ? `annotation:${styleName || 'default'}` : normalizedSpeakerName;
        if (createdSpeakerKeys.has(speakerUniqueKey)) {
          return;
        }
        createdSpeakerKeys.add(speakerUniqueKey);

        const speakerId = isAnnotation ? (styleVariants.length > 1 ? `ANNOTATION_${styleName}` : 'ANNOTATION') : String.fromCharCode(charCode++);
        newSpeakers[speakerId] = {
          name: displayName,
          avatar: isAnnotation ? '' : `https://api.dicebear.com/7.x/adventurer/svg?seed=${displayName || speakerId}`,
          side: isAnnotation ? 'center' : (charCode % 2 === 0 ? 'left' : 'right'),
          type: isAnnotation ? 'annotation' : 'speaker',
          preset: hasSelectedStyle ? assPresetKey : undefined,
          style: {
            ...mergedStyle
          }
        };

        if (hasSelectedStyle) {
          stylesBoundByNames.add(styleName);
        }
      });
    });

    Array.from(selectedStyles).forEach((styleName) => {
      if (stylesBoundByNames.has(styleName)) {
        return;
      }
      const isAnnotation = /注释/.test(styleName);
      const normalizedSpeakerName = (styleName || '').trim().toLowerCase();
      const speakerUniqueKey = isAnnotation ? 'annotation' : normalizedSpeakerName;
      if (createdSpeakerKeys.has(speakerUniqueKey)) {
        return;
      }
      createdSpeakerKeys.add(speakerUniqueKey);

      const baseStyle = getBaseImportedStyle(isAnnotation, charCode);
      const importedStyle = getImportedSpeakerStyle(assStylesByName.get(styleName), isAnnotation);
      const mergedStyle = { ...baseStyle, ...importedStyle };
      const assPresetKey = ensurePresetKey(styleName || 'Default', mergedStyle, isAnnotation);
      const speakerId = isAnnotation ? 'ANNOTATION' : String.fromCharCode(charCode++);

      newSpeakers[speakerId] = {
        name: isAnnotation ? '注释' : (styleName || `角色${speakerId}`),
        avatar: isAnnotation ? '' : `https://api.dicebear.com/7.x/adventurer/svg?seed=${styleName || speakerId}`,
        side: isAnnotation ? 'center' : (charCode % 2 === 0 ? 'left' : 'right'),
        type: isAnnotation ? 'annotation' : 'speaker',
        preset: assPresetKey,
        style: {
          ...mergedStyle
        }
      };

    });
    
    // If nothing selected, just provide a default A
    if (Object.keys(newSpeakers).length === 0) {
      newSpeakers['A'] = {
        name: "默认角色",
        avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=A`,
        side: "left",
        style: {
          bgColor: "#2563eb", textColor: "#ffffff", nameColor: '#ffffff', borderRadius: 28, opacity: 0.9, borderWidth: 0, avatarBorderColor: "#ffffff", borderColor: "#ffffff", borderOpacity: 1.0, margin: 14, paddingX: 20, paddingY: 12, shadowSize: 1, animationStyle: 'rise', animationDuration: 0.2, fontFamily: "system-ui", fontSize: 30, fontWeight: "normal"
        }
      };
    }
    
    await onConfirm(assPath, newSpeakers, newPresets, newAnnotationPresets);
  };

  const assStylesByName = new Map<string, ParsedAssStyle>((parsedAss?.styles?.style || []).map((style) => [style.Name, style]));
  const previewRows: StylePreviewRow[] = [
    ...Array.from(selectedNames).flatMap((name) => {
      const candidateStyles = (stylesByName.get(name) || []).filter((styleName) => selectedStyles.has(styleName));
      const fallbackStyle = preferredStylesByName.get(name) || name;
      const styleVariants = candidateStyles.length > 0 ? candidateStyles : [fallbackStyle];
      const shouldIncludeStyleInName = styleVariants.length > 1;

      return styleVariants.map((matchedStyleName) => {
        const matchedStyle = selectedStyles.has(matchedStyleName) ? assStylesByName.get(matchedStyleName) : undefined;
        const outlineWidth = Number(matchedStyle?.Outline);
        return {
          id: `name:${name}:${matchedStyleName}`,
          speakerLabel: formatImportedSpeakerName(language, name || t('import.empty'), matchedStyleName, shouldIncludeStyleInName),
          matchedStyleName: selectedStyles.has(matchedStyleName) ? matchedStyleName : '--',
          bubbleColor: parseAssColor(matchedStyle?.OutlineColour),
          borderColor: parseAssColor(matchedStyle?.BackColour),
          textColor: parseAssColor(matchedStyle?.PrimaryColour),
          borderWidth: Number.isFinite(outlineWidth) ? Math.max(0, Math.round(outlineWidth)) : null,
          fontName: matchedStyle?.Fontname
        };
      });
    }),
    ...Array.from(selectedStyles)
      .filter((styleName) => !Array.from(selectedNames).some((name) => (preferredStylesByName.get(name) || name) === styleName))
      .map((styleName) => {
        const matchedStyle = assStylesByName.get(styleName);
        const outlineWidth = Number(matchedStyle?.Outline);
        return {
          id: `style:${styleName}`,
          speakerLabel: styleName || t('import.empty'),
          matchedStyleName: styleName,
          bubbleColor: parseAssColor(matchedStyle?.OutlineColour),
          borderColor: parseAssColor(matchedStyle?.BackColour),
          textColor: parseAssColor(matchedStyle?.PrimaryColour),
          borderWidth: Number.isFinite(outlineWidth) ? Math.max(0, Math.round(outlineWidth)) : null,
          fontName: matchedStyle?.Fontname
        };
      })
  ];
  const totalPreviewTabs = Math.max(1, Math.ceil(previewRows.length / PREVIEW_ROWS_PER_TAB));
  const safePreviewTabIndex = Math.min(previewTabIndex, totalPreviewTabs - 1);
  const previewRowsInTab = previewRows.slice(
    safePreviewTabIndex * PREVIEW_ROWS_PER_TAB,
    (safePreviewTabIndex + 1) * PREVIEW_ROWS_PER_TAB
  );

  const renderColorBadge = (color: AssColorInfo) => {
    if (!color) {
      return <span className="text-xs opacity-50">--</span>;
    }

    return (
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full border" style={{ backgroundColor: color.hex, borderColor: uiTheme.border }} />
        <span className="text-xs font-mono">{color.hex}</span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden border" style={{ backgroundColor: uiTheme.panelBg, borderColor: uiTheme.border, color: uiTheme.text }}>
        <div className="flex justify-between items-center p-4 border-b" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgElevated }}>
          <h3 className="font-bold">{t('import.title')}</h3>
          <button onClick={onCancel} className="p-1 rounded-md hover:bg-black/10">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <p className="text-sm opacity-80">{t('import.desc')}</p>

          <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: uiTheme.border }}>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedNames(new Set(names));
                  setSelectedStyles(new Set(styles));
                }}
                className="px-2.5 py-1 rounded-md text-xs border transition-colors"
                style={{ borderColor: uiTheme.border, color: uiTheme.textMuted }}
              >
                {t('common.selectAll')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedNames(new Set());
                  setSelectedStyles(new Set());
                }}
                className="px-2.5 py-1 rounded-md text-xs border transition-colors"
                style={{ borderColor: uiTheme.border, color: uiTheme.textMuted }}
              >
                {t('common.selectNone')}
              </button>
            </div>
            {names.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase opacity-50">{t('import.name')}</h4>
                <div className="grid grid-cols-2 gap-2">
                  {names.map(a => {
                    const isSel = selectedNames.has(a);
                    const relatedStyles = stylesByName.get(a) || [];
                    const fallbackStyle = preferredStylesByName.get(a);
                    const styleVariants = relatedStyles.length > 0
                      ? relatedStyles
                      : (fallbackStyle ? [fallbackStyle] : []);
                    return (
                      <button
                        key={`name:${a}`}
                        onClick={() => toggleName(a)}
                        className="text-left px-3 py-2 rounded-lg border text-sm transition-colors"
                        style={isSel
                          ? { borderColor: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}${isDarkMode ? '22' : '12'}` }
                          : { borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgElevated }}
                      >
                        <div className="space-y-1.5">
                          <div className="font-medium truncate">{a || t('import.empty')}</div>
                          {styleVariants.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {styleVariants.map((styleName) => {
                                const styleSelected = selectedStyles.has(styleName);
                                return (
                                  <span
                                    key={`${a}:${styleName}`}
                                    className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                                    style={styleSelected
                                      ? { color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}18` }
                                      : { color: uiTheme.textMuted, backgroundColor: uiTheme.panelBgSubtle }}
                                  >
                                    {formatImportedSpeakerName(language, a || t('import.empty'), styleName, true)}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {styles.length > 0 && (
              <div className="space-y-2 mt-2">
                <h4 className="text-xs font-semibold uppercase opacity-50">{t('import.style')}</h4>
                <div className="grid grid-cols-2 gap-2">
                  {styles.map(s => {
                    const isSel = selectedStyles.has(s);
                    return (
                      <button
                        key={`style:${s}`}
                        onClick={() => toggleStyle(s)}
                        className="text-left px-3 py-2 rounded-lg border text-sm transition-colors"
                        style={isSel
                          ? { borderColor: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}${isDarkMode ? '22' : '12'}` }
                          : { borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgElevated }}
                      >
                        <div className="font-medium truncate">{s || t('import.empty')}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {previewRows.length > 0 && (
            <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: uiTheme.border }}>
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-semibold uppercase opacity-60">{t('import.previewTitle')}</h4>
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: totalPreviewTabs }).map((_, idx) => (
                    <button
                      key={`tab-${idx}`}
                      type="button"
                      onClick={() => setPreviewTabIndex(idx)}
                      className="px-2 py-1 rounded text-xs border"
                      style={safePreviewTabIndex === idx ? { borderColor: secondaryThemeColor, color: secondaryThemeColor } : { borderColor: uiTheme.border, color: uiTheme.textMuted }}
                    >
                      {t('import.previewTab', { index: idx + 1 })}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border" style={{ borderColor: uiTheme.border }}>
                <table className="w-full min-w-[820px] text-xs">
                  <thead style={{ backgroundColor: uiTheme.panelBgElevated }}>
                    <tr>
                      <th className="text-left px-3 py-2">{t('import.previewSpeaker')}</th>
                      <th className="text-left px-3 py-2">{t('import.previewMatchedStyle')}</th>
                      <th className="text-left px-3 py-2">{t('import.previewBubbleColor')}</th>
                      <th className="text-left px-3 py-2">{t('import.previewBorderColor')}</th>
                      <th className="text-left px-3 py-2">{t('import.previewTextColor')}</th>
                      <th className="text-left px-3 py-2">{t('import.previewBorderWidth')}</th>
                      <th className="text-left px-3 py-2">{t('import.previewBubbleOpacity')}</th>
                      <th className="text-left px-3 py-2">{t('import.previewBorderOpacity')}</th>
                      <th className="text-left px-3 py-2">{t('import.previewFontName')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRowsInTab.map((row) => (
                      <tr key={`preview-${row.id}`} className="border-t" style={{ borderColor: uiTheme.border }}>
                        <td className="px-3 py-2">{row.speakerLabel}</td>
                        <td className="px-3 py-2 font-mono">{row.matchedStyleName || '--'}</td>
                        <td className="px-3 py-2">{renderColorBadge(row.bubbleColor)}</td>
                        <td className="px-3 py-2">{renderColorBadge(row.borderColor)}</td>
                        <td className="px-3 py-2">{renderColorBadge(row.textColor)}</td>
                        <td className="px-3 py-2">{typeof row.borderWidth === 'number' ? `${row.borderWidth}px` : '--'}</td>
                        <td className="px-3 py-2">{row.bubbleColor ? `${Math.round(row.bubbleColor.opacity * 100)}%` : '--'}</td>
                        <td className="px-3 py-2">{row.borderColor ? `${Math.round(row.borderColor.opacity * 100)}%` : '--'}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.fontName || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {names.length === 0 && styles.length === 0 && (
            <div className="text-sm opacity-50 text-center py-4">{t('import.noneFound')}</div>
          )}
        </div>
        
        <div className="p-4 border-t flex justify-end gap-2" style={{ borderColor: uiTheme.border }}>
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded hover:bg-black/5 transition-colors">
            {t('common.cancel')}
          </button>
          <button onClick={handleConfirm} className="px-4 py-2 text-sm rounded text-white transition-colors" style={{ backgroundColor: secondaryThemeColor }}>
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
