import React, { useState, useEffect } from 'react';
import { parse } from 'ass-compiler';
import { X } from 'lucide-react';
import { translate, type Language } from '../i18n';
import { createThemeTokens } from '../theme';

interface AssImportModalProps {
  assPath: string;
  assContent: string;
  onConfirm: (path: string, newSpeakers: any) => void | Promise<void>;
  onCancel: () => void;
  isDarkMode: boolean;
  language: Language;
  themeColor: string;
  secondaryThemeColor: string;
}

export function AssImportModal({ assPath, assContent, onConfirm, onCancel, isDarkMode, language, themeColor, secondaryThemeColor }: AssImportModalProps): React.JSX.Element {
  const t = (key: string) => translate(language, key);
  const uiTheme = createThemeTokens(themeColor, isDarkMode);
  const [names, setNames] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const parsed = parse(assContent);
      const nameSet = new Set<string>();
      const styleSet = new Set<string>();
      
      parsed.events.dialogue.forEach(d => {
        if (d.Name) nameSet.add(d.Name);
        if (d.Style) styleSet.add(d.Style);
      });
      
      setNames(Array.from(nameSet));
      setStyles(Array.from(styleSet));
      
      // Auto-select names if available, otherwise styles
      const initialSelection = new Set<string>();
      if (nameSet.size > 0) {
        nameSet.forEach(a => initialSelection.add(`name:${a}`));
      } else {
        styleSet.forEach(s => initialSelection.add(`style:${s}`));
      }
      setSelectedItems(initialSelection);
    } catch (e) {
      console.error("ASS Parse error:", e);
    }
  }, [assContent]);

  const toggleItem = (id: string) => {
    const next = new Set(selectedItems);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedItems(next);
  };

  const handleConfirm = async () => {
    const newSpeakers: any = {};
    let charCode = 65; // 'A'
    
    selectedItems.forEach(id => {
      const isName = id.startsWith('name:');
      const val = isName ? id.substring(5) : id.substring(6);
      const isAnnotation = /注释/.test(val);
      const speakerId = isAnnotation ? 'ANNOTATION' : String.fromCharCode(charCode++);
      
        newSpeakers[speakerId] = {
          name: isAnnotation ? '注释' : (val || `角色${speakerId}`),
          avatar: isAnnotation ? '' : `https://api.dicebear.com/7.x/adventurer/svg?seed=${val || speakerId}`,
          side: isAnnotation ? 'center' : (charCode % 2 === 0 ? "left" : "right"),
          type: isAnnotation ? 'annotation' : 'speaker',
          style: {
            bgColor: isAnnotation ? '#111827' : (charCode % 2 === 0 ? "#2563eb" : "#f3f4f6"),
            textColor: isAnnotation ? '#ffffff' : (charCode % 2 === 0 ? "#ffffff" : "#111827"),
            borderRadius: isAnnotation ? 999 : 28,
            opacity: 0.9,
            borderWidth: 0,
            avatarBorderColor: "#ffffff",
            borderColor: "#ffffff",
            borderOpacity: 1.0,
            margin: isAnnotation ? 10 : 14,
            paddingX: isAnnotation ? 18 : 20,
            paddingY: isAnnotation ? 10 : 12,
            shadowSize: isAnnotation ? 12 : 18,
            animationStyle: 'rise',
            animationDuration: 0.45,
            fontFamily: "system-ui",
            fontSize: isAnnotation ? 16 : 18,
            fontWeight: "normal",
            nameColor: '#ffffff',
            annotationPosition: 'bottom'
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
          bgColor: "#2563eb", textColor: "#ffffff", nameColor: '#ffffff', borderRadius: 28, opacity: 0.9, borderWidth: 0, avatarBorderColor: "#ffffff", borderColor: "#ffffff", borderOpacity: 1.0, margin: 14, paddingX: 20, paddingY: 12, shadowSize: 18, animationStyle: 'rise', animationDuration: 0.45, fontFamily: "system-ui", fontSize: 18, fontWeight: "normal"
        }
      };
    }
    
    await onConfirm(assPath, newSpeakers);
  };

  const itemBg = isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-50 hover:bg-gray-100';
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl shadow-2xl overflow-hidden border" style={{ backgroundColor: uiTheme.panelBg, borderColor: uiTheme.border, color: uiTheme.text }}>
        <div className="flex justify-between items-center p-4 border-b" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgElevated }}>
          <h3 className="font-bold">{t('import.title')}</h3>
          <button onClick={onCancel} className="p-1 rounded-md hover:bg-black/10">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <p className="text-sm opacity-80">{t('import.desc')}</p>
          
          {names.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase opacity-50">{t('import.name')}</h4>
              <div className="grid grid-cols-2 gap-2">
                {names.map(a => {
                  const id = `name:${a}`;
                  const isSel = selectedItems.has(id);
                  return (
                    <button
                      key={id}
                      onClick={() => toggleItem(id)}
                      className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${isSel ? '' : `border-transparent ${itemBg}`}`}
                      style={isSel ? { borderColor: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}${isDarkMode ? '22' : '12'}` } : undefined}
                    >
                      <div className="font-medium truncate">{a || t('import.empty')}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {styles.length > 0 && (
            <div className="space-y-2 mt-4">
              <h4 className="text-xs font-semibold uppercase opacity-50">{t('import.style')}</h4>
              <div className="grid grid-cols-2 gap-2">
                {styles.map(s => {
                  const id = `style:${s}`;
                  const isSel = selectedItems.has(id);
                  return (
                    <button
                      key={id}
                      onClick={() => toggleItem(id)}
                      className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${isSel ? '' : `border-transparent ${itemBg}`}`}
                      style={isSel ? { borderColor: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}${isDarkMode ? '22' : '12'}` } : undefined}
                    >
                      <div className="font-medium truncate">{s || t('import.empty')}</div>
                    </button>
                  );
                })}
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
          <button onClick={handleConfirm} className="px-4 py-2 text-sm rounded text-white transition-colors" style={{ backgroundColor: themeColor }}>
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
