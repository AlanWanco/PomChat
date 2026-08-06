import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Copy, Save, X, Sparkles, GripVertical, FolderOpen } from 'lucide-react';
import { translate, type Language } from '../i18n';
import { createThemeTokens, rgba } from '../theme';
import type { SpeakerConfig, FontPreset } from '../remotion/types';

interface StyleManagerModalProps {
  isOpen: boolean;
  language: Language;
  isDarkMode: boolean;
  themeColor: string;
  secondaryThemeColor: string;
  speakers: Record<string, SpeakerConfig>;
  fontPresets?: Record<string, FontPreset>;
  speakerPresets?: Record<string, any>;
  projectPath?: string;
  onSave: (speakers: Record<string, SpeakerConfig>) => void;
  onSpeakerPresetsChange?: (presets: Record<string, any>) => void;
  onClose: () => void;
}

const DEFAULT_SPEAKER: SpeakerConfig = {
  name: '', avatar: '', side: 'left', type: 'speaker',
  style: {
    bgColor: '#2563eb', textColor: '#ffffff', nameColor: '#ffffff',
    nameStrokeWidth: 0, nameStrokeColor: '#000000', borderRadius: 28,
    opacity: 0.9, borderWidth: 0, avatarBorderColor: '#ffffff',
    borderColor: '#ffffff', borderOpacity: 1, margin: 14,
    paddingX: 20, paddingY: 12, shadowSize: 1,
    fontFamily: 'system-ui', fontSize: 30, fontWeight: 'normal',
    animationStyle: 'rise',
  },
};

const SYSTEM_FONTS = ['system-ui', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans'];

export function StyleManagerModal({ isOpen, language, isDarkMode, themeColor, secondaryThemeColor, speakers, fontPresets, speakerPresets, projectPath, onSave, onSpeakerPresetsChange, onClose }: StyleManagerModalProps) {
  const t = (key: string, vars?: Record<string, string | number>) => translate(language, key, vars);
  const uiTheme = createThemeTokens(themeColor, isDarkMode);
  const [localSpeakers, setLocalSpeakers] = useState<Record<string, SpeakerConfig>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<'speakers' | 'presets'>('speakers');
  const [localPresets, setLocalPresets] = useState<Record<string, any>>({});
  const [selectedPresetIds, setSelectedPresetIds] = useState<Set<string>>(new Set());
  const [editingPresetName, setEditingPresetName] = useState<string | null>(null);
  const [speakersDirty, setSpeakersDirty] = useState(false);
  const [presetsDirty, setPresetsDirty] = useState(false);
  const dragRef = useRef<{ id: string; type: 'speaker' | 'preset' } | null>(null);
  const [dragOverSpeakerId, setDragOverSpeakerId] = useState<string | null>(null);
  const [dragOverPresetName, setDragOverPresetName] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLocalSpeakers(JSON.parse(JSON.stringify(speakers || {})));
      setSelectedIds(new Set());
      setEditingSpeakerId(null);
      setLocalPresets(JSON.parse(JSON.stringify(speakerPresets || {})));
      setSelectedPresetIds(new Set());
      setEditingPresetName(null);
      setSpeakersDirty(false);
      setPresetsDirty(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const editingSpeaker = editingSpeakerId ? localSpeakers[editingSpeakerId] : null;
  const editingPreset = editingPresetName ? localPresets[editingPresetName] : null;
  const ic = isDarkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900';

  const handleAdd = () => {
    let key = 'S'; for (let i = 0; i < 99; i++) { key = i === 0 ? 'S' : `S_${i + 1}`; if (!localSpeakers[key]) break; }
    setLocalSpeakers({ ...localSpeakers, [key]: { ...JSON.parse(JSON.stringify(DEFAULT_SPEAKER)), name: key } });
    setEditingSpeakerId(key);
    setSelectedIds(new Set([key]));
    setSpeakersDirty(true);
  };
  const handleDelete = () => {
    if (selectedIds.size === 0) return; const next = { ...localSpeakers }; selectedIds.forEach((id) => delete next[id]);
    setLocalSpeakers(next); setSelectedIds(new Set()); if (editingSpeakerId && selectedIds.has(editingSpeakerId)) setEditingSpeakerId(null);
    setSpeakersDirty(true);
  };
  const handleDuplicate = () => {
    if (selectedIds.size === 0) return; const next = { ...localSpeakers };
    selectedIds.forEach((id) => { let ck = `${id}_copy`; let c = 1; while (next[ck]) { c++; ck = `${id}_copy${c}`; } next[ck] = JSON.parse(JSON.stringify(localSpeakers[id])); if (next[ck].name) next[ck].name = `${next[ck].name} (copy)`; });
    setLocalSpeakers(next);
    setSpeakersDirty(true);
  };
  const handlePresetDelete = () => {
    if (selectedPresetIds.size === 0) return;
    const next = { ...localPresets }; selectedPresetIds.forEach((id) => delete next[id]);
    setLocalPresets(next);
    setSelectedPresetIds(new Set());
    if (editingPresetName && selectedPresetIds.has(editingPresetName)) setEditingPresetName(null);
    setPresetsDirty(true);
  };
  const toggleSelect = (id: string) => setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const togglePresetSelect = (name: string) => setSelectedPresetIds((p) => { const n = new Set(p); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const updateSpeaker = (id: string, u: (s: SpeakerConfig) => SpeakerConfig, keepPreset?: boolean) => { setLocalSpeakers((p) => { const updated = u(p[id]); return { ...p, [id]: keepPreset ? updated : { ...updated, preset: '' } }; }); setSpeakersDirty(true); };
  const updateStyle = (id: string, k: string, v: any) => { setLocalSpeakers((p) => ({ ...p, [id]: { ...p[id], preset: '', style: { ...(p[id]?.style || {}), [k]: v } } })); setSpeakersDirty(true); };
  const updatePresetStyle = (name: string, k: string, v: any) => {
    const next = { ...localPresets, [name]: { ...localPresets[name], style: { ...(localPresets[name]?.style || {}), [k]: v } } };
    setLocalPresets(next);
    setPresetsDirty(true);
  };
  const updatePresetField = (name: string, k: string, v: any) => {
    const next = { ...localPresets, [name]: { ...localPresets[name], [k]: v } };
    setLocalPresets(next);
    setPresetsDirty(true);
  };

  const matchesAcceptedExtension = (path: string, extensions: string[]) => {
    const normalizedPath = path.trim().replace(/^['"]|['"]$/g, '');
    return extensions.some((extension) => normalizedPath.toLowerCase().endsWith(`.${extension.toLowerCase()}`));
  };
  const extractClipboardFilePath = (event: React.ClipboardEvent<HTMLInputElement>, extensions: string[]) => {
    const clipboardItems = Array.from(event.clipboardData?.items || []);
    const fileItem = clipboardItems.find((item) => item.kind === 'file');
    if (fileItem) {
      const file = fileItem.getAsFile();
      const filePath = file && (window as any).electron ? (window as any).electron.getDroppedFilePath(file) : '';
      if (filePath && matchesAcceptedExtension(filePath, extensions)) return filePath;
    }
    const text = event.clipboardData?.getData('text/plain')?.trim() || '';
    if (text && matchesAcceptedExtension(text, extensions)) return text.replace(/^['"]|['"]$/g, '');
    return '';
  };
  const saveClipboardImageToCache = async (event: React.ClipboardEvent<HTMLInputElement>) => {
    const electron = (window as any).electron; if (!electron) return '';
    const clipboardItems = Array.from(event.clipboardData?.items || []);
    const imageItem = clipboardItems.find((item: any) => item.kind === 'file' && item.type.startsWith('image/'));
    if (!imageItem) return '';
    const file = imageItem.getAsFile(); if (!file) return '';
    const directPath = electron.getDroppedFilePath(file) || '';
    if (directPath) return directPath;
    const arrayBuffer = await file.arrayBuffer();
    return await electron.saveClipboardImageToCache({ bytes: Array.from(new Uint8Array(arrayBuffer)), contentType: file.type, preferredName: file.name }) || '';
  };
  const createImageAwarePathPasteHandler = (extensions: string[], onPath: (path: string) => void) => {
    return (event: React.ClipboardEvent<HTMLInputElement>) => {
      const textOrFilePath = extractClipboardFilePath(event, extensions);
      if (textOrFilePath) { event.preventDefault(); onPath(textOrFilePath); return; }
      void (async () => {
        const cachedImagePath = await saveClipboardImageToCache(event);
        if (!cachedImagePath) return;
        event.preventDefault(); onPath(cachedImagePath);
      })();
    };
  };

  const handleBrowseFile = async (): Promise<string | null> => {
    const electron = (window as any).electron; if (!electron) return null;
    try {
      const res = await electron.showOpenDialog({
        title: '选择图片',
        filters: [{ name: t('dialog.filterMedia') || 'Media', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov', 'mkv'] }],
        properties: ['openFile']
      });
      if (!res.canceled && res.filePaths.length > 0) return res.filePaths[0];
    } catch (_) { /* ignore */ }
    return null;
  };

  const toFsPreviewPath = (localPath: string) => {
    const normalized = localPath.replace(/\\/g, '/');
    if (/^[a-zA-Z]:\//.test(normalized)) {
      const [drive, ...segments] = normalized.split('/');
      return `/@fs/${drive}/${segments.map((s) => encodeURIComponent(s)).join('/')}`;
    }
    if (normalized.startsWith('//')) {
      const [host, ...segments] = normalized.replace(/^\/\//, '').split('/');
      return `/@fs//${host}/${segments.map((s) => encodeURIComponent(s)).join('/')}`;
    }
    const segments = normalized.split('/');
    return `/@fs${segments.map((s, i) => (i === 0 ? s : `/${encodeURIComponent(s)}`)).join('')}`;
  };

  const resolveAssetPathAgainstProject = (value: string | undefined, baseProjectFilePath: string | null | undefined): string | undefined => {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('file://')) return trimmed;
    if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
    if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\') || (trimmed.startsWith('/') && !trimmed.startsWith('/projects/') && !trimmed.startsWith('/assets/'))) return trimmed;
    if (!baseProjectFilePath || baseProjectFilePath === 'web-demo') return trimmed;
    try {
      const normalizedBasePath = baseProjectFilePath.replace(/\\/g, '/');
      const baseSegments = normalizedBasePath.split('/');
      baseSegments.pop();
      trimmed.replace(/\\/g, '/').split('/').forEach((segment) => {
        if (!segment || segment === '.') return;
        if (segment === '..') {
          if (baseSegments.length > 1 || !/^[a-zA-Z]:$/.test(baseSegments[0] || '')) baseSegments.pop();
          return;
        }
        baseSegments.push(segment);
      });
      return baseSegments.join('/');
    } catch { return trimmed; }
  };

  const toFilePreviewPath = (localPath: string) => {
    const normalized = localPath.replace(/\\/g, '/');
    if (/^[a-zA-Z]:\//.test(normalized)) {
      const [drive, ...segments] = normalized.split('/');
      return `file:///${drive}/${segments.map((s) => encodeURIComponent(s)).join('/')}`;
    }
    if (normalized.startsWith('//')) {
      const [host, ...segments] = normalized.replace(/^\/\//, '').split('/');
      return `file://${host}/${segments.map((s) => encodeURIComponent(s)).join('/')}`;
    }
    const segments = normalized.split('/');
    return `file://${segments.map((s, i) => (i === 0 ? s : encodeURIComponent(s))).join('/')}`;
  };

  const resolveLocalPreviewPath = (path: string | undefined): string | undefined => {
    if (!path) return path;
    const trimmed = path.trim();
    if (!trimmed) return undefined;
    const useFilePreviewPath = typeof window !== 'undefined' && Boolean((window as any).electron);
    const resolveAbs = (p: string) => useFilePreviewPath ? toFilePreviewPath(p) : toFsPreviewPath(p);
    if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
    if (trimmed.startsWith('file://')) {
      try {
        const url = new URL(trimmed);
        const host = url.host ? `//${url.host}` : '';
        const pathname = decodeURIComponent(url.pathname);
        const normalizedPath = /^\/[a-zA-Z]:\//.test(pathname) ? pathname.slice(1) : pathname;
        return resolveAbs(`${host}${normalizedPath}`);
      } catch {
        return resolveAbs(trimmed.replace(/^file:\/\/?/, '/'));
      }
    }
    if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
    if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\')) return resolveAbs(trimmed);
    if (trimmed.startsWith('/') && !trimmed.startsWith('/projects/') && !trimmed.startsWith('/assets/')) return resolveAbs(trimmed);
    if (trimmed.startsWith('/')) return trimmed;
    const resolved = resolveAssetPathAgainstProject(trimmed, projectPath);
    if (resolved && resolved !== trimmed) return resolveAbs(resolved);
    return `/${trimmed}`;
  };

  const renderFontField = (updateFn: (k: string, v: any) => void, value: string | undefined) => {
    const presetEntries = Object.entries(fontPresets || {});
    const presets = presetEntries.map(([id_, p]) => ({ label: p.name, value: p.family, id: id_ }));
    const isPreset = presets.some((f) => f.value === (value || ''));
    return (
      <div className="space-y-1.5">
        {presets.length > 0 && (
          <select value={isPreset ? value : ''} onChange={(e) => { if (e.target.value) updateFn('fontFamily', e.target.value); }}
            className={`w-full border rounded px-2 py-1 text-xs focus:outline-none ${ic}`} style={{ backgroundColor: uiTheme.inputBg, borderColor: uiTheme.border, color: uiTheme.text }}>
            <option value="">Font presets</option>
            {presets.map((f) => <option key={f.id} value={f.value}>{f.label}</option>)}
            {SYSTEM_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        )}
        <input type="text" placeholder="Custom font name" value={value || ''} onChange={(e) => updateFn('fontFamily', e.target.value)}
          className={`w-full border rounded px-2 py-1 text-xs focus:outline-none ${ic}`} style={{ backgroundColor: uiTheme.inputBg, borderColor: uiTheme.border, color: uiTheme.text }} />
      </div>
    );
  };
  const renderColor = (updateFn: (k: string, v: any) => void, key: string, value: string | undefined) => (
    <div className="flex items-center gap-2 rounded px-2 py-1.5" style={{ backgroundColor: uiTheme.panelBgSubtle }}>
      <input type="color" value={value || '#000000'} onChange={(e) => updateFn(key, e.target.value.toUpperCase())}
        className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent shrink-0 shadow-sm"
        style={{ WebkitAppearance: 'none' } as React.CSSProperties} />
      <input type="text" value={(value || '').toUpperCase()} onChange={(e) => updateFn(key, e.target.value)}
        onBlur={(e) => { const v = e.target.value.trim(); if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(v)) updateFn(key, v.toUpperCase()); }}
        placeholder="#RRGGBB" className={`w-full rounded border px-2 py-1 text-[0.6875rem] font-mono focus:outline-none ${ic}`}
        style={{ backgroundColor: uiTheme.inputBg, borderColor: uiTheme.border, color: uiTheme.text }} />
    </div>
  );
  const renderNum = (updateFn: (k: string, v: any) => void, key: string, value: number | undefined, min?: number, max?: number, step?: number) => {
    const s = step || 1;
    const safeVal = Number.isFinite(value ?? 0) ? (value ?? 0) : 0;
    const applyDelta = (d: number) => {
      let next = safeVal + d;
      if (typeof min === 'number') next = Math.max(min, next);
      if (typeof max === 'number') next = Math.min(max, next);
      updateFn(key, Number(next.toFixed(s.toString().includes('.') ? s.toString().split('.')[1].length : 0)));
    };
    return (
      <div className="relative">
        <input type="number" min={min} max={max} step={s} value={safeVal} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) updateFn(key, n); }}
          className={`w-full border rounded px-2 py-1 text-xs focus:outline-none pr-8 ${ic}`} style={{ backgroundColor: uiTheme.inputBg, borderColor: uiTheme.border, color: uiTheme.text }} />
        <div className="absolute inset-y-0 right-1 flex flex-col justify-center gap-px">
          <button type="button" onClick={() => applyDelta(s)} className="h-3.5 w-4 rounded text-[0.5rem] leading-none border" style={{ borderColor: `${secondaryThemeColor}55`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}16` }}>▲</button>
          <button type="button" onClick={() => applyDelta(-s)} className="h-3.5 w-4 rounded text-[0.5rem] leading-none border" style={{ borderColor: `${secondaryThemeColor}55`, color: secondaryThemeColor, backgroundColor: `${secondaryThemeColor}16` }}>▼</button>
        </div>
      </div>
    );
  };
  const renderRange = (updateFn: (k: string, v: any) => void, key: string, value: number | undefined, min: number, max: number, step: number) => (
    <div className="flex items-center gap-2"><input type="range" min={min} max={max} step={step} value={value ?? 0} onChange={(e) => updateFn(key, parseFloat(e.target.value))} className="flex-1" style={{ accentColor: themeColor }} /><span className="text-xs w-8 text-right font-mono">{value ?? 0}</span></div>
  );
  const renderSel = (updateFn: (k: string, v: any) => void, key: string, value: string | undefined, opts: string[]) => (
    <select value={value || ''} onChange={(e) => updateFn(key, e.target.value)}
      className={`w-full border rounded px-2 py-1 text-xs focus:outline-none ${ic}`} style={{ backgroundColor: uiTheme.inputBg, borderColor: uiTheme.border, color: uiTheme.text }}>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  const modalBg = isDarkMode ? 'rgba(2, 6, 23, 0.72)' : 'rgba(15, 23, 42, 0.48)';
  const sectionStyle = { borderColor: uiTheme.border, backgroundColor: uiTheme.cardBg };

  const renderEditorFields = (style: any, updateFn: (k: string, v: any) => void) => (
    <>
      <div className="p-3 rounded-xl border space-y-2" style={sectionStyle}><span className="text-xs font-semibold opacity-80">{t('speakers.typography')}</span>
        <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.font')}</span>{renderFontField(updateFn, style?.fontFamily)}</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.fontSize')}</span>{renderNum(updateFn, 'fontSize', style?.fontSize, 8)}</div>
          <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.fontWeight')}</span>{renderSel(updateFn, 'fontWeight', style?.fontWeight, ['normal','bold','100','300','500','700','900'])}</div>
        </div>
      </div>
      <div className="p-3 rounded-xl border space-y-2" style={sectionStyle}><span className="text-xs font-semibold opacity-80">{t('speakers.name')}</span>
        <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.nameFont')}</span>{renderFontField(updateFn, style?.nameFontFamily)}</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.nameColor')}</span>{renderColor(updateFn, 'nameColor', style?.nameColor)}</div>
          <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.nameFontWeight')}</span>{renderSel(updateFn, 'nameFontWeight', style?.nameFontWeight, ['normal','bold','100','300','500','700','900'])}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.nameStrokeColor')}</span>{renderColor(updateFn, 'nameStrokeColor', style?.nameStrokeColor)}</div>
          <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.nameStrokeWidth')}</span>{renderNum(updateFn, 'nameStrokeWidth', style?.nameStrokeWidth, 0, 12)}</div>
        </div>
      </div>
      <div className="p-3 rounded-xl border space-y-2" style={sectionStyle}><span className="text-xs font-semibold opacity-80">{t('speakers.colors')}</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><span className="text-[0.625rem] opacity-70">气泡颜色</span>{renderColor(updateFn, 'bgColor', style?.bgColor)}</div>
          <div className="space-y-1"><span className="text-[0.625rem] opacity-70">文字颜色</span>{renderColor(updateFn, 'textColor', style?.textColor)}</div>
        </div>
        <button onClick={() => { const bg = style?.bgColor || '#2563eb'; const tc = style?.textColor || '#ffffff'; updateFn('bgColor', tc); updateFn('textColor', bg); }} className="text-xs px-2 py-1 rounded w-full" style={{ backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.text }}>{t('speakers.swapBgText') || 'Swap'}</button>
        <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.opacity')}</span>{renderRange(updateFn, 'opacity', style?.opacity, 0, 1, 0.05)}</div>
      </div>
      <div className="p-3 rounded-xl border space-y-2" style={sectionStyle}><span className="text-xs font-semibold opacity-80">{t('speakers.border')}</span>
        <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.avatarBorderColor')}</span>{renderColor(updateFn, 'avatarBorderColor', style?.avatarBorderColor)}</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.borderColor')}</span>{renderColor(updateFn, 'borderColor', style?.borderColor)}</div>
          <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.borderWidth')}</span>{renderNum(updateFn, 'borderWidth', style?.borderWidth, 0, 10)}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.borderRadius')}</span>{renderNum(updateFn, 'borderRadius', style?.borderRadius, 0, 64)}</div>
          <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.borderOpacity')}</span>{renderRange(updateFn, 'borderOpacity', style?.borderOpacity, 0, 1, 0.05)}</div>
        </div>
      </div>
      <div className="p-3 rounded-xl border space-y-2" style={sectionStyle}><span className="text-xs font-semibold opacity-80">{t('speakers.layout')}</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.paddingX')}</span>{renderNum(updateFn, 'paddingX', style?.paddingX, 0)}</div>
          <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.paddingY')}</span>{renderNum(updateFn, 'paddingY', style?.paddingY, 0)}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.shadow')}</span>{renderNum(updateFn, 'shadowSize', style?.shadowSize, 0, 64)}</div>
          <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.margin')}</span>{renderNum(updateFn, 'margin', style?.margin, 0)}</div>
        </div>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-6" style={{ backgroundColor: modalBg, backdropFilter: 'blur(10px)' }} onClick={onClose}>
      <div className="flex flex-col w-full max-w-[45rem] max-h-[85vh] overflow-hidden rounded-[28px] border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDragLeave={(e) => { e.stopPropagation(); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}
        style={{ ...{ '--podchat-scrollbar-thumb': `${secondaryThemeColor}44`, '--podchat-scrollbar-thumb-hover': `${secondaryThemeColor}66` } as React.CSSProperties, background: `linear-gradient(180deg, ${uiTheme.panelBgElevated} 0%, ${uiTheme.panelBg} 68%, ${secondaryThemeColor}${isDarkMode ? '12' : '08'} 100%)`, borderColor: `${secondaryThemeColor}33`, color: uiTheme.text }}>
        {/* Banner Header */}
        <div className="flex items-start justify-between gap-4 border-b px-6 py-5" style={{ borderColor: uiTheme.border, backgroundColor: isDarkMode ? `${themeColor}10` : `${themeColor}06` }}>
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: `${secondaryThemeColor}14`, color: secondaryThemeColor, border: `1px solid ${secondaryThemeColor}24` }}>
              <Sparkles size={12} /> {t('menu.styleManager')}
            </div>
            <h3 className="text-xl font-semibold" style={{ color: uiTheme.text }}>{t('speakers.title')}</h3>
            <p className="mt-1 text-sm" style={{ color: uiTheme.textMuted }}>管理所有说话人的样式配置和预设</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 transition-colors" style={{ backgroundColor: isDarkMode ? `${themeColor}16` : `${themeColor}08`, color: uiTheme.textMuted }}>
            <X size={16} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b shrink-0" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgSubtle }}>
          <button onClick={() => setLeftTab('speakers')} className={`flex-1 py-2 text-sm font-medium transition-colors ${leftTab === 'speakers' ? 'border-b-2' : ''}`}
            style={leftTab === 'speakers' ? { borderColor: secondaryThemeColor, color: uiTheme.text } : { color: uiTheme.textSoft, borderColor: 'transparent' }}>
            {t('speakers.title')}
          </button>
          <button onClick={() => setLeftTab('presets')} className={`flex-1 py-2 text-sm font-medium transition-colors ${leftTab === 'presets' ? 'border-b-2' : ''}`}
            style={leftTab === 'presets' ? { borderColor: secondaryThemeColor, color: uiTheme.text } : { color: uiTheme.textSoft, borderColor: 'transparent' }}>
            预设管理器
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left Panel */}
          <div className="w-60 shrink-0 border-r flex flex-col" style={{ borderColor: uiTheme.border }}>
            {leftTab === 'speakers' ? (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: uiTheme.border }}>
                  <span className="text-xs font-medium opacity-70">{Object.keys(localSpeakers).filter((k) => localSpeakers[k]?.type !== 'annotation').length} 个说话人</span>
                  <button onClick={handleAdd} className="p-1.5 rounded-md hover:opacity-80" style={{ backgroundColor: `${secondaryThemeColor}18`, color: secondaryThemeColor }}><Plus size={14} /></button>
                </div>
                <div className="flex gap-1 px-3 py-2 border-b" style={{ borderColor: uiTheme.border }}>
                  <button onClick={handleDelete} disabled={selectedIds.size === 0} className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[0.625rem]" style={{ opacity: selectedIds.size > 0 ? 1 : 0.4, backgroundColor: selectedIds.size > 0 ? 'rgba(239,68,68,0.12)' : 'transparent', color: selectedIds.size > 0 ? '#ef4444' : uiTheme.textMuted }}><Trash2 size={12} /> {t('common.delete')}</button>
                  <button onClick={handleDuplicate} disabled={selectedIds.size === 0} className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[0.625rem]" style={{ opacity: selectedIds.size > 0 ? 1 : 0.4, backgroundColor: selectedIds.size > 0 ? `${secondaryThemeColor}14` : 'transparent', color: selectedIds.size > 0 ? secondaryThemeColor : uiTheme.textMuted }}><Copy size={12} /> {t('common.copy')}</button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ '--podchat-scrollbar-thumb': `${secondaryThemeColor}44`, '--podchat-scrollbar-thumb-hover': `${secondaryThemeColor}66` } as React.CSSProperties}>
                  {Object.entries(localSpeakers).filter(([, s]) => s.type !== 'annotation').map(([id, speaker]) => (
                    <div key={id} onClick={() => { setEditingSpeakerId(id); setSelectedIds(new Set([id])); }}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverSpeakerId(id); }}
                      onDragLeave={() => setDragOverSpeakerId(null)}
                      onDrop={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        setDragOverSpeakerId(null);
                        const from = dragRef.current;
                          dragRef.current = null;
                          if (!from || from.type !== 'speaker' || from.id === id) return;
                          const entries = Object.entries(localSpeakers).filter(([, s]) => s.type !== 'annotation');
                          const fromIdx = entries.findIndex(([k]) => k === from.id);
                          const toIdx = entries.findIndex(([k]) => k === id);
                          if (fromIdx < 0 || toIdx < 0) return;
                          const [moved] = entries.splice(fromIdx, 1);
                          entries.splice(toIdx, 0, moved);
                          const ordered: Record<string, SpeakerConfig> = {};
                          entries.forEach(([k, v]) => { ordered[k] = v as SpeakerConfig; });
                          Object.entries(localSpeakers).filter(([, s]) => s.type === 'annotation').forEach(([k, v]) => { ordered[k] = v as SpeakerConfig; });
                          setLocalSpeakers(ordered);
                          setSpeakersDirty(true);
                        }}
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer border-b text-xs transition-all"
                      style={{
                        backgroundColor: editingSpeakerId === id ? `${themeColor}14` : dragOverSpeakerId === id ? `${secondaryThemeColor}14` : 'transparent',
                        borderColor: dragOverSpeakerId === id ? secondaryThemeColor : uiTheme.border,
                        color: editingSpeakerId === id ? uiTheme.text : uiTheme.textMuted,
                        borderTop: dragOverSpeakerId === id ? `2px solid ${secondaryThemeColor}` : undefined,
                      }}>
                      <input type="checkbox" checked={selectedIds.has(id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleSelect(id)} style={{ accentColor: secondaryThemeColor }} />
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: speaker.style?.bgColor || '#888' }} />
                      <span className="truncate flex-1">{speaker.name || id}</span>
                      <div
                        draggable
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; dragRef.current = { id, type: 'speaker' }; e.stopPropagation(); }}
                        className="shrink-0 cursor-grab active:cursor-grabbing"
                      >
                        <GripVertical size={12} className="opacity-30 hover:opacity-60 pointer-events-none" style={{ color: uiTheme.textMuted }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3 border-t" style={{ borderColor: uiTheme.border }}>
                  <button onClick={() => { onSave(localSpeakers); setSpeakersDirty(false); }} disabled={!speakersDirty}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all"
                    style={{ backgroundColor: speakersDirty ? secondaryThemeColor : uiTheme.border, opacity: speakersDirty ? 1 : 0.5, cursor: speakersDirty ? 'pointer' : 'default' }}>
                    <Save size={14} /> {t('settings.save') || 'Save'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: uiTheme.border }}>
                  <span className="text-xs font-medium opacity-70">{Object.keys(localPresets).length} 个预设</span>
                  <button onClick={() => {
                    const name = `preset-${Date.now()}`;
                    const next = { ...localPresets, [name]: { ...JSON.parse(JSON.stringify(DEFAULT_SPEAKER)), name } };
                    setLocalPresets(next);
                    setEditingPresetName(name);
                    setSelectedPresetIds(new Set([name]));
                    setPresetsDirty(true);
                  }} className="p-1.5 rounded-md hover:opacity-80" style={{ backgroundColor: `${secondaryThemeColor}18`, color: secondaryThemeColor }}><Plus size={14} /></button>
                </div>
                <div className="flex gap-1 px-3 py-2 border-b" style={{ borderColor: uiTheme.border }}>
                  <button onClick={handlePresetDelete} disabled={selectedPresetIds.size === 0} className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[0.625rem]" style={{ opacity: selectedPresetIds.size > 0 ? 1 : 0.4, backgroundColor: selectedPresetIds.size > 0 ? 'rgba(239,68,68,0.12)' : 'transparent', color: selectedPresetIds.size > 0 ? '#ef4444' : uiTheme.textMuted }}><Trash2 size={12} /> {t('common.delete')}</button>
                  <button onClick={() => {
                    if (selectedPresetIds.size === 0) return; const next = { ...localPresets };
                    selectedPresetIds.forEach((name) => { let ck = `${name}_copy`; let c = 1; while (next[ck]) { c++; ck = `${name}_copy${c}`; } next[ck] = JSON.parse(JSON.stringify(localPresets[name])); if (next[ck].name) next[ck].name = `${next[ck].name} (copy)`; });
                    setLocalPresets(next);
                    setPresetsDirty(true);
                  }} disabled={selectedPresetIds.size === 0} className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[0.625rem]" style={{ opacity: selectedPresetIds.size > 0 ? 1 : 0.4, backgroundColor: selectedPresetIds.size > 0 ? `${secondaryThemeColor}14` : 'transparent', color: selectedPresetIds.size > 0 ? secondaryThemeColor : uiTheme.textMuted }}><Copy size={12} /> {t('common.copy')}</button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ '--podchat-scrollbar-thumb': `${secondaryThemeColor}44`, '--podchat-scrollbar-thumb-hover': `${secondaryThemeColor}66` } as React.CSSProperties}>
                  {Object.keys(localPresets).length > 0 ? (
                    Object.entries(localPresets).map(([name, preset]) => (
                      <div key={name} onClick={() => { setEditingPresetName(name); setSelectedPresetIds(new Set([name])); }}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverPresetName(name); }}
                        onDragLeave={() => setDragOverPresetName(null)}
                        onDrop={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          setDragOverPresetName(null);
                          const from = dragRef.current;
                          dragRef.current = null;
                          if (!from || from.type !== 'preset' || from.id === name) return;
                          const entries = Object.entries(localPresets);
                          const fromIdx = entries.findIndex(([k]) => k === from!.id);
                          const toIdx = entries.findIndex(([k]) => k === name);
                          if (fromIdx < 0 || toIdx < 0) return;
                          const [moved] = entries.splice(fromIdx, 1);
                          entries.splice(toIdx, 0, moved);
                          const ordered: Record<string, any> = {};
                          entries.forEach(([k, v]) => { ordered[k] = v; });
                          setLocalPresets(ordered);
                          setPresetsDirty(true);
                        }}
                        className="flex items-center gap-2 px-3 py-2 cursor-pointer border-b text-xs transition-all"
                        style={{
                          backgroundColor: editingPresetName === name ? `${themeColor}14` : dragOverPresetName === name ? `${secondaryThemeColor}14` : 'transparent',
                          borderColor: dragOverPresetName === name ? secondaryThemeColor : uiTheme.border,
                          color: editingPresetName === name ? uiTheme.text : uiTheme.textMuted,
                          borderTop: dragOverPresetName === name ? `2px solid ${secondaryThemeColor}` : undefined,
                        }}>
                        <input type="checkbox" checked={selectedPresetIds.has(name)} onClick={(e) => e.stopPropagation()} onChange={() => togglePresetSelect(name)} style={{ accentColor: secondaryThemeColor }} />
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: preset?.style?.bgColor || '#888' }} />
                        <span className="truncate flex-1">{name}</span>
                        <div
                          draggable
                          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; dragRef.current = { id: name, type: 'preset' }; e.stopPropagation(); }}
                          className="shrink-0 cursor-grab active:cursor-grabbing"
                        >
                          <GripVertical size={12} className="opacity-30 hover:opacity-60 pointer-events-none" style={{ color: uiTheme.textMuted }} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-center h-full text-sm opacity-50 p-4 text-center">暂无预设</div>
                  )}
                </div>
                <div className="px-4 py-3 border-t" style={{ borderColor: uiTheme.border }}>
                  <button onClick={() => { if (onSpeakerPresetsChange) { onSpeakerPresetsChange(localPresets); setPresetsDirty(false); } }} disabled={!presetsDirty}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all"
                    style={{ backgroundColor: presetsDirty ? secondaryThemeColor : uiTheme.border, opacity: presetsDirty ? 1 : 0.5, cursor: presetsDirty ? 'pointer' : 'default' }}>
                    <Save size={14} /> {t('settings.save') || 'Save'}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Right Panel */}
          <div className="flex-1 flex flex-col min-w-0">
            {leftTab === 'speakers' && editingSpeaker ? (() => {
                const isLeft = (editingSpeaker.side || 'left') === 'left';
                const s = editingSpeaker.style;
                const PREVIEW_SCALE = 0.63;
                const AVATAR_DEFAULT = 80;
                const NAME_DEFAULT = 22;
                const FONT_DEFAULT = 30;
                const PADX_DEFAULT = 20;
                const PADY_DEFAULT = 12;
                const RADIUS_DEFAULT = 28;
                const BUBBLE_GAP_DEFAULT = 16;
                const NAME_MARGIN_DEFAULT = 4;
                const BORDER_DEFAULT = 0;

                const fontFamily = s?.fontFamily || 'system-ui';
                const fz = Math.max(10, (s?.fontSize ?? FONT_DEFAULT) * PREVIEW_SCALE);
                const fw = s?.fontWeight || 'normal';
                const py = (s?.paddingY ?? PADY_DEFAULT) * PREVIEW_SCALE;
                const px = (s?.paddingX ?? PADX_DEFAULT) * PREVIEW_SCALE;
                const br = (s?.borderRadius ?? RADIUS_DEFAULT) * PREVIEW_SCALE;
                const sharp = Math.max(1.5, br * 0.15);
                const bw = (s?.borderWidth ?? BORDER_DEFAULT) * PREVIEW_SCALE;
                const bco = s?.borderColor || '#ffffff';
                const bop = s?.borderOpacity ?? 1;
                const bg = s?.bgColor || '#2563eb';
                const op = s?.opacity ?? 0.9;
                const tc = s?.textColor || '#fff';
                const ss = s?.shadowSize ?? 0;
                const shadow = ss > 0 ? `0 ${Math.round(ss * 0.45)}px ${ss}px rgba(15, 23, 42, 0.24)` : 'none';
                const avSizePx = Math.round(AVATAR_DEFAULT * PREVIEW_SCALE);
                const namePx = Math.round(NAME_DEFAULT * PREVIEW_SCALE);
                const bubbleGapPx = Math.round(BUBBLE_GAP_DEFAULT * PREVIEW_SCALE);
                const nameMarginPx = Math.round(NAME_MARGIN_DEFAULT * PREVIEW_SCALE);
                
                const nameColor = s?.nameColor || '#fff';
                const nameFontFamily = s?.nameFontFamily || fontFamily;
                const nameFontWeight = s?.nameFontWeight || '700';
                const nameText = editingSpeaker.name || 'Speaker';
                
                const avatarEl = <img src={resolveLocalPreviewPath(editingSpeaker.avatar) || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(editingSpeaker.name || editingSpeakerId || '')}`} alt="" className="rounded-full border object-cover shrink-0" style={{ width: avSizePx, height: avSizePx, borderColor: s?.avatarBorderColor || uiTheme.border, boxShadow: shadow }} referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(editingSpeaker.name || '')}`; }} />;
                
                const bubbleEl = (
                  <div style={{ width: 'fit-content', maxWidth: '100%' }}>
                    {nameText ? <div className="font-bold" style={{ color: nameColor, fontFamily: nameFontFamily, fontWeight: nameFontWeight, fontSize: `${namePx}px`, lineHeight: 1.2, marginBottom: `${nameMarginPx}px`, textAlign: isLeft ? 'left' : 'right' }}>{nameText}</div> : null}
                    <div style={{ overflow: 'hidden', isolation: 'isolate', padding: `${py}px ${px}px`, backgroundClip: 'padding-box', backgroundColor: rgba(bg, op), color: tc, fontFamily, fontSize: `${fz}px`, fontWeight: fw, borderTopLeftRadius: isLeft ? `${sharp}px` : `${br}px`, borderTopRightRadius: isLeft ? `${br}px` : `${sharp}px`, borderBottomLeftRadius: `${br}px`, borderBottomRightRadius: `${br}px`, border: bw > 0 ? `${bw}px solid ${rgba(bco, bop)}` : 'none', boxShadow: shadow, width: 'fit-content', maxWidth: '100%' }}>
                      <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word', lineHeight: 1.35 }}>预览文本消息</span>
                    </div>
                  </div>
                );
                
                return (
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="sticky top-0 z-10 border-b" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.cardBg, padding: '12px 16px' }}>
                  <div className="flex items-start" style={{ flexDirection: isLeft ? 'row' : 'row-reverse', gap: `${bubbleGapPx}px` }}>
                    {avatarEl}
                    {bubbleEl}
                  </div>
                </div>
                <div className="p-4 space-y-3">
                <div className="p-3 rounded-xl border space-y-2" style={sectionStyle}><span className="text-xs font-semibold opacity-80">{t('speakers.title')}</span>
                  <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.name') || 'Name'}</span><input type="text" value={editingSpeaker.name || ''} onChange={(e) => updateSpeaker(editingSpeakerId!, (s) => ({ ...s, name: e.target.value }))} className={`w-full border rounded px-2 py-1 text-xs focus:outline-none ${ic}`} style={{ backgroundColor: uiTheme.inputBg, borderColor: uiTheme.border, color: uiTheme.text }} /></div>
                  <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.avatar') || 'Avatar'}</span>
                    <div className="flex items-center gap-2">
                      <img
                        src={resolveLocalPreviewPath(editingSpeaker.avatar) || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(editingSpeaker.name || editingSpeakerId || '')}`}
                        alt="" className="w-8 h-8 rounded-full border object-cover shrink-0" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgSubtle }}
                        referrerPolicy="no-referrer"
                        onError={(e) => { e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(editingSpeaker.name || editingSpeakerId || '')}`; }}
                      />
                      <input type="text" value={editingSpeaker.avatar || ''} onChange={(e) => updateSpeaker(editingSpeakerId!, (s) => ({ ...s, avatar: e.target.value }))}
                        onPaste={createImageAwarePathPasteHandler(['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov', 'mkv'], (path) => updateSpeaker(editingSpeakerId!, (s) => ({ ...s, avatar: path })))}
                        className={`flex-1 border rounded px-2 py-1 text-xs focus:outline-none ${ic}`} style={{ backgroundColor: uiTheme.inputBg, borderColor: uiTheme.border, color: uiTheme.text }}
                        title={t('project.quickPasteFilePathTip') || '支持右键粘贴文件路径；若剪贴板里是图片，也会自动保存到缓存并填入路径。'} />
                      <button onClick={async () => { const path = await handleBrowseFile(); if (path) updateSpeaker(editingSpeakerId!, (s) => ({ ...s, avatar: path })); }}
                        className="shrink-0 p-1.5 rounded-md hover:brightness-90" style={{ backgroundColor: `${secondaryThemeColor}18`, color: uiTheme.textMuted }} title={t('project.selectLocalImage') || '选择本地文件'}>
                        <FolderOpen size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1"><span className="text-[0.625rem] opacity-70">预设</span>
                    <select value={editingSpeaker.preset || ''} onChange={(e) => {
                      const val = e.target.value;
                      updateSpeaker(editingSpeakerId!, (s) => {
                        if (!val) return { ...s, preset: '' };
                        const presetData = speakerPresets?.[val];
                        if (!presetData) return s;
                        return { ...s, preset: val, avatar: presetData.avatar || s.avatar, side: presetData.side || s.side, style: { ...s.style, ...(presetData.style || {}) } };
                      }, true);
                    }} className={`w-full border rounded px-2 py-1 text-xs focus:outline-none ${ic}`} style={{ backgroundColor: uiTheme.inputBg, borderColor: uiTheme.border, color: uiTheme.text }}>
                      <option value="">{t('speakers.applyPreset') || 'Apply preset'}</option>
                      {speakerPresets && Object.keys(speakerPresets).map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.side') || 'Side'}</span>
                    <select value={editingSpeaker.side || 'left'} onChange={(e) => updateSpeaker(editingSpeakerId!, (s) => ({ ...s, side: e.target.value as 'left' | 'right' }))} className={`w-full border rounded px-2 py-1 text-xs focus:outline-none ${ic}`} style={{ backgroundColor: uiTheme.inputBg, borderColor: uiTheme.border, color: uiTheme.text }}><option value="left">{t('speakers.side.left') || 'Left'}</option><option value="right">{t('speakers.side.right') || 'Right'}</option></select>
                  </div>
                </div>
                {renderEditorFields(editingSpeaker.style, (k, v) => updateStyle(editingSpeakerId!, k, v))}
              </div>
                </div>
            ); })() : leftTab === 'presets' && editingPreset ? (() => {
                const isLeft = (editingPreset.side || 'left') === 'left';
                const s = editingPreset.style;
                const PREVIEW_SCALE = 0.63;
                const AVATAR_DEFAULT = 80;
                const NAME_DEFAULT = 22;
                const FONT_DEFAULT = 30;
                const PADX_DEFAULT = 20;
                const PADY_DEFAULT = 12;
                const RADIUS_DEFAULT = 28;
                const BUBBLE_GAP_DEFAULT = 16;
                const NAME_MARGIN_DEFAULT = 4;
                const BORDER_DEFAULT = 0;

                const fontFamily = s?.fontFamily || 'system-ui';
                const fz = Math.max(10, (s?.fontSize ?? FONT_DEFAULT) * PREVIEW_SCALE);
                const fw = s?.fontWeight || 'normal';
                const py = (s?.paddingY ?? PADY_DEFAULT) * PREVIEW_SCALE;
                const px = (s?.paddingX ?? PADX_DEFAULT) * PREVIEW_SCALE;
                const br = (s?.borderRadius ?? RADIUS_DEFAULT) * PREVIEW_SCALE;
                const sharp = Math.max(1.5, br * 0.15);
                const bw = (s?.borderWidth ?? BORDER_DEFAULT) * PREVIEW_SCALE;
                const bco = s?.borderColor || '#ffffff';
                const bop = s?.borderOpacity ?? 1;
                const bg = s?.bgColor || '#2563eb';
                const op = s?.opacity ?? 0.9;
                const tc = s?.textColor || '#fff';
                const ss = s?.shadowSize ?? 0;
                const shadow = ss > 0 ? `0 ${Math.round(ss * 0.45)}px ${ss}px rgba(15, 23, 42, 0.24)` : 'none';
                const avSizePx = Math.round(AVATAR_DEFAULT * PREVIEW_SCALE);
                const namePx = Math.round(NAME_DEFAULT * PREVIEW_SCALE);
                const bubbleGapPx = Math.round(BUBBLE_GAP_DEFAULT * PREVIEW_SCALE);
                const nameMarginPx = Math.round(NAME_MARGIN_DEFAULT * PREVIEW_SCALE);
                
                const nameColor = s?.nameColor || '#fff';
                const nameFontFamily = s?.nameFontFamily || fontFamily;
                const nameFontWeight = s?.nameFontWeight || '700';
                const nameText = editingPresetName || 'Preset';
                
                const avatarEl = <img src={resolveLocalPreviewPath(editingPreset.avatar) || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(editingPresetName || '')}`} alt="" className="rounded-full border object-cover shrink-0" style={{ width: avSizePx, height: avSizePx, borderColor: s?.avatarBorderColor || uiTheme.border, boxShadow: shadow }} referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(editingPresetName || '')}`; }} />;
                
                const bubbleEl = (
                  <div style={{ width: 'fit-content', maxWidth: '100%' }}>
                    {nameText ? <div className="font-bold" style={{ color: nameColor, fontFamily: nameFontFamily, fontWeight: nameFontWeight, fontSize: `${namePx}px`, lineHeight: 1.2, marginBottom: `${nameMarginPx}px`, textAlign: isLeft ? 'left' : 'right' }}>{nameText}</div> : null}
                    <div style={{ overflow: 'hidden', isolation: 'isolate', padding: `${py}px ${px}px`, backgroundClip: 'padding-box', backgroundColor: rgba(bg, op), color: tc, fontFamily, fontSize: `${fz}px`, fontWeight: fw, borderTopLeftRadius: isLeft ? `${sharp}px` : `${br}px`, borderTopRightRadius: isLeft ? `${br}px` : `${sharp}px`, borderBottomLeftRadius: `${br}px`, borderBottomRightRadius: `${br}px`, border: bw > 0 ? `${bw}px solid ${rgba(bco, bop)}` : 'none', boxShadow: shadow, width: 'fit-content', maxWidth: '100%' }}>
                      <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word', lineHeight: 1.35 }}>预览文本消息</span>
                    </div>
                  </div>
                );
                
                return (
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="sticky top-0 z-10 border-b" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.cardBg, padding: '12px 16px' }}>
                  <div className="flex items-start" style={{ flexDirection: isLeft ? 'row' : 'row-reverse', gap: `${bubbleGapPx}px` }}>
                    {avatarEl}
                    {bubbleEl}
                  </div>
                </div>
                <div className="p-4 space-y-3">
                <div className="p-3 rounded-xl border space-y-2" style={sectionStyle}><span className="text-xs font-semibold opacity-80">预设配置</span>
                  <div className="space-y-1"><span className="text-[0.625rem] opacity-70">预设名称</span>
                    <input type="text" value={editingPresetName || ''} onChange={(e) => {
                      const newName = e.target.value;
                      if (newName && newName !== editingPresetName) {
                        const ordered: Record<string, any> = {};
                        for (const [k, v] of Object.entries(localPresets)) {
                          if (k === editingPresetName) ordered[newName] = v;
                          else ordered[k] = v;
                        }
                        setLocalPresets(ordered);
                        setEditingPresetName(newName);
                        setPresetsDirty(true);
                      }
                    }} className={`w-full border rounded px-2 py-1 text-xs focus:outline-none ${ic}`} style={{ backgroundColor: uiTheme.inputBg, borderColor: uiTheme.border, color: uiTheme.text }} />
                  </div>
                  <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.avatar') || 'Avatar'}</span>
                    <div className="flex items-center gap-2">
                      <img
                        src={resolveLocalPreviewPath(editingPreset.avatar) || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(editingPresetName || '')}`}
                        alt="" className="w-8 h-8 rounded-full border object-cover shrink-0" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgSubtle }}
                        referrerPolicy="no-referrer"
                        onError={(e) => { e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(editingPresetName || '')}`; }}
                      />
                      <input type="text" value={editingPreset.avatar || ''} onChange={(e) => updatePresetField(editingPresetName!, 'avatar', e.target.value)}
                        onPaste={createImageAwarePathPasteHandler(['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov', 'mkv'], (path) => updatePresetField(editingPresetName!, 'avatar', path))}
                        className={`flex-1 border rounded px-2 py-1 text-xs focus:outline-none ${ic}`} style={{ backgroundColor: uiTheme.inputBg, borderColor: uiTheme.border, color: uiTheme.text }}
                        title={t('project.quickPasteFilePathTip') || '支持右键粘贴文件路径；若剪贴板里是图片，也会自动保存到缓存并填入路径。'} />
                      <button onClick={async () => { const path = await handleBrowseFile(); if (path) updatePresetField(editingPresetName!, 'avatar', path); }}
                        className="shrink-0 p-1.5 rounded-md hover:brightness-90" style={{ backgroundColor: `${secondaryThemeColor}18`, color: uiTheme.textMuted }} title={t('project.selectLocalImage') || '选择本地文件'}>
                        <FolderOpen size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1"><span className="text-[0.625rem] opacity-70">{t('speakers.side') || 'Side'}</span>
                    <select value={editingPreset.side || 'left'} onChange={(e) => updatePresetField(editingPresetName!, 'side', e.target.value)} className={`w-full border rounded px-2 py-1 text-xs focus:outline-none ${ic}`} style={{ backgroundColor: uiTheme.inputBg, borderColor: uiTheme.border, color: uiTheme.text }}><option value="left">{t('speakers.side.left') || 'Left'}</option><option value="right">{t('speakers.side.right') || 'Right'}</option></select>
                  </div>
                </div>
                {renderEditorFields(editingPreset.style, (k, v) => updatePresetStyle(editingPresetName!, k, v))}
              </div>
                </div>
            ); })() : (
              <div className="flex-1 flex items-center justify-center text-sm opacity-50">{t('speakers.applyPreset') || 'Select a speaker to edit'}</div>
            )}
            <div className="px-4 py-3 border-t flex justify-end" style={{ borderColor: uiTheme.border }}>
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm" style={{ backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.text }}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
