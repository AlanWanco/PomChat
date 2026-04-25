import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Copy, Download, Image as ImageIcon, RotateCcw, X } from 'lucide-react';
import { translate, type Language } from '../i18n';
import { createThemeTokens } from '../theme';
import { ChatAnnotationBubble, ChatMessageBubble, type SharedChatLayout, type SharedChatSpeaker } from './chat/SharedChatBubbles';

interface SubtitleLike {
  id: string;
  start: number;
  end: number;
  text: string;
  speakerId: string;
  visible?: boolean;
}

interface BubbleSnapshotModalProps {
  open: boolean;
  subtitles: SubtitleLike[];
  speakers: Record<string, SharedChatSpeaker>;
  chatLayout: SharedChatLayout & {
    paddingLeft?: number;
    paddingRight?: number;
    paddingX?: number;
  };
  background: {
    image?: string;
    blur?: number;
    brightness?: number;
  };
  canvasWidth: number;
  language: Language;
  isDarkMode: boolean;
  themeColor: string;
  secondaryThemeColor: string;
  resolveAssetSrc?: (src?: string) => string | undefined;
  includeBackground: boolean;
  onIncludeBackgroundChange: (value: boolean) => void;
  backgroundMode: 'project' | 'transparent' | 'solid' | 'custom-image';
  onBackgroundModeChange: (value: 'project' | 'transparent' | 'solid' | 'custom-image') => void;
  backgroundColor: string;
  onBackgroundColorChange: (value: string) => void;
  customBackgroundImage: string;
  onCustomBackgroundImageChange: (value: string) => void;
  backgroundImageSizing: 'fit-width' | 'tile';
  onBackgroundImageSizingChange: (value: 'fit-width' | 'tile') => void;
  tileAlign: TileAlign;
  onTileAlignChange: (value: TileAlign) => void;
  backgroundBlur: number;
  onBackgroundBlurChange: (value: number) => void;
  backgroundBrightness: number;
  onBackgroundBrightnessChange: (value: number) => void;
  sidePadding: number;
  onSidePaddingChange: (value: number) => void;
  bubbleMaxWidthPercent: number;
  onBubbleMaxWidthPercentChange: (value: number) => void;
  exportScale: number;
  onExportScaleChange: (value: number) => void;
  onClose: () => void;
  showToast: (message: string) => void;
}

type TileAlign = 'left' | 'center' | 'right';

const VIDEO_EXT_RE = /\.(mp4|webm|mov|mkv|m4v)(\?|$)/i;
const CSS_URL_RE = /url\((['"]?)(.*?)\1\)/g;

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
  reader.readAsDataURL(blob);
});

const svgToDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const fetchAsDataUrl = async (url: string, cache: Map<string, string>) => {
  if (!url) {
    return '';
  }
  const cached = cache.get(url);
  if (cached) {
    return cached;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch resource: ${response.status}`);
  }
  const dataUrl = await blobToDataUrl(await response.blob());
  cache.set(url, dataUrl);
  return dataUrl;
};

const copyStyles = (source: Element, target: Element) => {
  const computed = window.getComputedStyle(source);
  const targetStyle = (target as HTMLElement).style;
  for (let i = 0; i < computed.length; i += 1) {
    const property = computed[i];
    targetStyle.setProperty(
      property,
      computed.getPropertyValue(property),
      computed.getPropertyPriority(property),
    );
  }
};

const cloneWithInlineStyles = (source: Element): Element => {
  const clone = source.cloneNode(false) as Element;
  if (clone instanceof HTMLElement) {
    clone.style.transform = 'none';
  }
  copyStyles(source, clone);

  const sourceChildren = Array.from(source.childNodes);
  sourceChildren.forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE) {
      clone.appendChild(cloneWithInlineStyles(child as Element));
      return;
    }
    clone.appendChild(child.cloneNode(true));
  });
  return clone;
};

const inlineCloneResources = async (root: Element, cache: Map<string, string>) => {
  const elements = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const element of elements) {
    if (element instanceof HTMLImageElement) {
      const sourceUrl = element.getAttribute('src') || '';
      if (sourceUrl && !sourceUrl.startsWith('data:')) {
        element.setAttribute('src', await fetchAsDataUrl(sourceUrl, cache));
      }
    }

    const htmlElement = element as HTMLElement;
    const backgroundImage = htmlElement.style?.backgroundImage;
    if (backgroundImage && backgroundImage !== 'none') {
      let nextBackgroundImage = backgroundImage;
      const matches = Array.from(backgroundImage.matchAll(CSS_URL_RE));
      for (const match of matches) {
        const sourceUrl = match[2];
        if (!sourceUrl || sourceUrl.startsWith('data:')) {
          continue;
        }
        const dataUrl = await fetchAsDataUrl(sourceUrl, cache);
        nextBackgroundImage = nextBackgroundImage.replace(match[0], `url("${dataUrl}")`);
      }
      htmlElement.style.backgroundImage = nextBackgroundImage;
    }
  }
};

const waitForMediaReady = async (root: HTMLElement) => {
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(images.map((image) => new Promise<void>((resolve) => {
    if (image.complete && image.naturalWidth > 0) {
      resolve();
      return;
    }
    const done = () => {
      image.removeEventListener('load', done);
      image.removeEventListener('error', done);
      resolve();
    };
    image.addEventListener('load', done, { once: true });
    image.addEventListener('error', done, { once: true });
  })));
};

const renderSvgPreviewToCanvas = async ({ previewUrl, width, height }: { previewUrl: string; width: number; height: number }) => {
  const image = new Image();
  image.decoding = 'async';
  image.src = previewUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load snapshot preview'));
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas context unavailable');
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
};

export function BubbleSnapshotModal({
  open,
  subtitles,
  speakers,
  chatLayout,
  background,
  canvasWidth,
  language,
  isDarkMode,
  themeColor,
  secondaryThemeColor,
  resolveAssetSrc,
  includeBackground,
  onIncludeBackgroundChange,
  backgroundMode,
  onBackgroundModeChange,
  backgroundColor,
  onBackgroundColorChange,
  customBackgroundImage,
  onCustomBackgroundImageChange,
  backgroundImageSizing,
  onBackgroundImageSizingChange,
  tileAlign,
  onTileAlignChange,
  backgroundBlur,
  onBackgroundBlurChange,
  backgroundBrightness,
  onBackgroundBrightnessChange,
  sidePadding,
  onSidePaddingChange,
  bubbleMaxWidthPercent,
  onBubbleMaxWidthPercentChange,
  exportScale,
  onExportScaleChange,
  onClose,
  showToast,
}: BubbleSnapshotModalProps) {
  const t = useCallback((key: string, vars?: Record<string, string | number>) => translate(language, key, vars), [language]);
  const uiTheme = createThemeTokens(themeColor, isDarkMode);
  const themedRangeStyle = useMemo(() => ({ accentColor: themeColor }) as React.CSSProperties, [themeColor]);
  const [previewUrl, setPreviewUrl] = useState('');
  const [snapshotHtml, setSnapshotHtml] = useState('');
  const [snapshotSize, setSnapshotSize] = useState({ width: 0, height: 0 });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isZoomDirty, setIsZoomDirty] = useState(false);
  const [localBackgroundMode, setLocalBackgroundMode] = useState(backgroundMode);
  const [localBackgroundColor, setLocalBackgroundColor] = useState(backgroundColor);
  const [localCustomBackgroundImage, setLocalCustomBackgroundImage] = useState(customBackgroundImage);
  const [localBackgroundImageSizing, setLocalBackgroundImageSizing] = useState<'fit-width' | 'tile'>(backgroundImageSizing);
  const [localTileAlign, setLocalTileAlign] = useState<TileAlign>(tileAlign);
  const [localBackgroundBlur, setLocalBackgroundBlur] = useState(backgroundBlur);
  const [localBackgroundBrightness, setLocalBackgroundBrightness] = useState(backgroundBrightness);
  const [localSidePadding, setLocalSidePadding] = useState(sidePadding);
  const [localBubbleMaxWidthPercent, setLocalBubbleMaxWidthPercent] = useState(bubbleMaxWidthPercent);
  const [localExportScale, setLocalExportScale] = useState(exportScale);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const resourceCacheRef = useRef(new Map<string, string>());
  const subtitleSignature = useMemo(
    () => subtitles.map((subtitle) => `${subtitle.id}:${subtitle.start}:${subtitle.end}:${subtitle.speakerId}:${subtitle.text}:${subtitle.visible !== false}`).join('|'),
    [subtitles]
  );

  const contentWidth = useMemo(() => {
    const paddingLeft = chatLayout?.paddingLeft ?? chatLayout?.paddingX ?? 48;
    const paddingRight = chatLayout?.paddingRight ?? chatLayout?.paddingX ?? 48;
    return Math.max(240, canvasWidth - paddingLeft - paddingRight);
  }, [canvasWidth, chatLayout?.paddingLeft, chatLayout?.paddingRight, chatLayout?.paddingX]);

  const snapshotWidth = useMemo(() => contentWidth + localSidePadding * 2, [contentWidth, localSidePadding]);
  const exportWidth = useMemo(() => Math.max(1, Math.round(snapshotWidth * localExportScale)), [localExportScale, snapshotWidth]);
  const exportHeight = useMemo(() => Math.max(1, Math.round(snapshotSize.height * localExportScale)), [localExportScale, snapshotSize.height]);
  const snapshotChatLayout = useMemo(() => ({
    ...chatLayout,
    bubbleMaxWidthPercent: localBubbleMaxWidthPercent,
  }), [localBubbleMaxWidthPercent, chatLayout]);
  const resolvedCustomBackgroundImage = useMemo(
    () => resolveAssetSrc?.(localCustomBackgroundImage) || localCustomBackgroundImage,
    [localCustomBackgroundImage, resolveAssetSrc]
  );

  const backgroundImageSrc = useMemo(() => {
    if (localBackgroundMode === 'custom-image') {
      return resolvedCustomBackgroundImage || '';
    }
    if (!background?.image || VIDEO_EXT_RE.test(background.image)) {
      return '';
    }
    const resolved = resolveAssetSrc?.(background.image) || background.image;
    if (!resolved || VIDEO_EXT_RE.test(resolved)) {
      return '';
    }
    return resolved;
  }, [background?.image, localBackgroundMode, resolveAssetSrc, resolvedCustomBackgroundImage]);

  const shouldRenderBackground = localBackgroundMode !== 'transparent' && (localBackgroundMode === 'solid' || Boolean(backgroundImageSrc));
  const usesImageBackground = localBackgroundMode !== 'transparent' && localBackgroundMode !== 'solid' && Boolean(backgroundImageSrc);
  const usesTileBackground = usesImageBackground && localBackgroundImageSizing === 'tile';
  const effectiveBackgroundBlur = shouldRenderBackground ? localBackgroundBlur : 0;
  const effectiveBackgroundBrightness = shouldRenderBackground ? localBackgroundBrightness : 1;
  const snapshotBackgroundColor = localBackgroundMode === 'transparent'
    ? 'transparent'
    : localBackgroundMode === 'solid'
      ? localBackgroundColor
      : (isDarkMode ? '#0f172a' : '#f8fafc');

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsZoomDirty(false);
  }, [subtitleSignature, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setLocalBackgroundMode(backgroundMode);
    setLocalBackgroundColor(backgroundColor);
    setLocalCustomBackgroundImage(customBackgroundImage);
    setLocalBackgroundImageSizing(backgroundImageSizing);
    setLocalTileAlign(tileAlign);
    setLocalBackgroundBlur(backgroundBlur);
    setLocalBackgroundBrightness(backgroundBrightness);
    setLocalSidePadding(sidePadding);
    setLocalBubbleMaxWidthPercent(bubbleMaxWidthPercent);
    setLocalExportScale(exportScale);
  }, [open, backgroundMode, backgroundColor, customBackgroundImage, backgroundImageSizing, tileAlign, backgroundBlur, backgroundBrightness, sidePadding, bubbleMaxWidthPercent, exportScale]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const timer = window.setTimeout(() => {
      onBackgroundModeChange(localBackgroundMode);
      onIncludeBackgroundChange(localBackgroundMode !== 'transparent');
      onBackgroundColorChange(localBackgroundColor);
      onCustomBackgroundImageChange(localCustomBackgroundImage);
      onBackgroundImageSizingChange(localBackgroundImageSizing);
      onTileAlignChange(localTileAlign);
      onBackgroundBlurChange(localBackgroundBlur);
      onBackgroundBrightnessChange(localBackgroundBrightness);
      onSidePaddingChange(localSidePadding);
      onBubbleMaxWidthPercentChange(localBubbleMaxWidthPercent);
      onExportScaleChange(localExportScale);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [localBackgroundMode, localBackgroundColor, localCustomBackgroundImage, localBackgroundImageSizing, localTileAlign, localBackgroundBlur, localBackgroundBrightness, localSidePadding, localBubbleMaxWidthPercent, localExportScale, onBackgroundModeChange, onIncludeBackgroundChange, onBackgroundColorChange, onCustomBackgroundImageChange, onBackgroundImageSizingChange, onTileAlignChange, onBackgroundBlurChange, onBackgroundBrightnessChange, onSidePaddingChange, onBubbleMaxWidthPercentChange, onExportScaleChange, open]);

  const renderAvatar = useCallback((speaker: SharedChatSpeaker, style: React.CSSProperties) => {
    if (!speaker.avatar) {
      return null;
    }
    const src = resolveAssetSrc?.(speaker.avatar) || speaker.avatar;
    const bubbleScale = chatLayout?.bubbleScale ?? 1.5;
    const borderWidth = Math.max(2, Math.round(4 * bubbleScale));
    const borderColor = speaker.style?.avatarBorderColor || (isDarkMode ? '#1f2937' : '#ffffff');
    return (
      <img
        src={src}
        alt={speaker.name || ''}
        referrerPolicy="no-referrer"
        style={{
          ...style,
          boxSizing: 'border-box',
          border: `${borderWidth}px solid ${borderColor}`,
          backgroundColor: borderColor,
          display: 'block',
        }}
      />
    );
  }, [chatLayout?.bubbleScale, isDarkMode, resolveAssetSrc]);

  const renderInlineImage = useCallback(({ src, alt, key, style }: { src: string; alt: string; key?: string; style: React.CSSProperties }) => (
    <img
      key={key}
      src={resolveAssetSrc?.(src) || src}
      alt={alt}
      referrerPolicy="no-referrer"
      style={style}
    />
  ), [resolveAssetSrc]);

  const renderSnapshotBubble = useCallback((subtitle: SubtitleLike, index: number) => {
    const speaker = speakers[subtitle.speakerId];
    if (!speaker) {
      return null;
    }

    const prevSpeakerId = index > 0 ? subtitles[index - 1]?.speakerId : undefined;
    const nextSpeakerId = index < subtitles.length - 1 ? subtitles[index + 1]?.speakerId : undefined;
    const item = {
      key: subtitle.id,
      start: subtitle.start,
      end: subtitle.end,
      text: subtitle.text,
      speakerId: subtitle.speakerId,
    };

    if (speaker.type === 'annotation') {
      return (
        <div key={`snapshot-annotation-${subtitle.id}`} style={{ width: '100%' }}>
          <ChatAnnotationBubble
            item={item}
            speaker={speaker}
            currentTime={subtitle.start + 1}
            layoutScale={1}
            chatLayout={snapshotChatLayout}
            renderInlineImage={renderInlineImage}
            renderBubble={({ outerStyle, contentStyle, children }) => (
              <div style={outerStyle}>
                <div style={contentStyle}>{children}</div>
              </div>
            )}
          />
        </div>
      );
    }

    return (
      <div
        key={`snapshot-message-${subtitle.id}`}
        style={{
          display: 'flex',
          justifyContent: speaker.side === 'right' ? 'flex-end' : 'flex-start',
          width: '100%',
        }}
      >
        <ChatMessageBubble
          item={item}
          speaker={speaker}
          currentTime={subtitle.start + 1}
          canvasWidth={contentWidth}
          layoutScale={1}
          chatLayout={snapshotChatLayout}
          prevSpeakerId={prevSpeakerId}
          nextSpeakerId={nextSpeakerId}
          isLatestVisible={index === subtitles.length - 1}
          renderInlineImage={renderInlineImage}
          renderAvatar={({ style }) => renderAvatar(speaker, style)}
          renderBubble={({ outerStyle, contentStyle, children }) => (
            <div style={outerStyle}>
              <div style={contentStyle}>{children}</div>
            </div>
          )}
        />
      </div>
    );
  }, [contentWidth, renderAvatar, renderInlineImage, snapshotChatLayout, speakers, subtitles]);

  const handlePreviewWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsZoomDirty(true);
    setZoom((current) => {
      const nextZoom = Math.max(0.35, Math.min(4, current * (event.deltaY < 0 ? 1.12 : 0.9)));
      return Number(nextZoom.toFixed(3));
    });
  }, []);

  const fitPreviewToWidth = useCallback(() => {
    const node = previewViewportRef.current;
    if (!node || !snapshotWidth) {
      return;
    }
    const availableWidth = Math.max(1, node.clientWidth - 40);
    const nextZoom = Number(Math.min(1, availableWidth / snapshotWidth).toFixed(3));
    setZoom((current) => (current === nextZoom ? current : nextZoom));
    setPan((current) => (current.x === 0 && current.y === 0 ? current : { x: 0, y: 0 }));
  }, [snapshotWidth]);

  useEffect(() => {
    if (!open || isZoomDirty) {
      return;
    }
    const rafId = window.requestAnimationFrame(fitPreviewToWidth);
    return () => window.cancelAnimationFrame(rafId);
  }, [fitPreviewToWidth, isZoomDirty, open, subtitleSignature]);

  const regeneratePreview = useCallback(async () => {
    const sourceEl = sourceRef.current;
    if (!open || !sourceEl || subtitles.length === 0) {
      return;
    }

    setIsGenerating(true);
    setGenerateError(null);
    try {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      await waitForMediaReady(sourceEl);
      await new Promise((resolve) => window.requestAnimationFrame(resolve));

      const width = Math.max(1, Math.ceil(sourceEl.offsetWidth));
      const height = Math.max(1, Math.ceil(sourceEl.offsetHeight));
      const clone = cloneWithInlineStyles(sourceEl);
      await inlineCloneResources(clone, resourceCacheRef.current);

      const wrapper = document.createElement('div');
      wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
      wrapper.appendChild(clone);
      const serialized = new XMLSerializer().serializeToString(wrapper);
      setSnapshotHtml(serialized);
      setSnapshotSize({ width, height });
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
          <foreignObject width="100%" height="100%">${serialized}</foreignObject>
        </svg>
      `;
      setPreviewUrl(svgToDataUrl(svg));
    } catch (error: any) {
      setGenerateError(error?.message || t('bubbleSnapshot.generateFailed'));
      setPreviewUrl('');
      setSnapshotHtml('');
      setSnapshotSize({ width: 0, height: 0 });
    } finally {
      setIsGenerating(false);
    }
  }, [
    backgroundImageSrc,
    localBackgroundColor,
    localBackgroundMode,
    contentWidth,
    effectiveBackgroundBlur,
    effectiveBackgroundBrightness,
    includeBackground,
    open,
    renderAvatar,
    renderInlineImage,
    localSidePadding,
    snapshotChatLayout,
    speakers,
    subtitleSignature,
    subtitles.length,
    t,
    localTileAlign,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void regeneratePreview();
    }, 90);
    return () => window.clearTimeout(timer);
  }, [regeneratePreview]);

  const handleCopyImage = useCallback(async () => {
    if (!snapshotHtml || !snapshotSize.width || !snapshotSize.height) {
      return;
    }
    setCopying(true);
    try {
      if (window.electron) {
        const bytes = await window.electron.renderHtmlToPng({
          html: snapshotHtml,
          width: snapshotSize.width,
          height: snapshotSize.height,
          scale: localExportScale,
        });
        if (!bytes) {
          throw new Error('PNG render returned empty result');
        }
        await window.electron.copyImageBytesToClipboard({ bytes });
      } else {
        if (!previewUrl || !navigator.clipboard || typeof ClipboardItem === 'undefined') {
          throw new Error('Clipboard image API unavailable');
        }
        const canvas = await renderSvgPreviewToCanvas({ previewUrl, width: exportWidth, height: exportHeight });
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) {
          throw new Error('Failed to build PNG blob');
        }
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      }
      showToast(t('bubbleSnapshot.copySuccess'));
    } catch (error) {
      console.error('Failed to copy bubble snapshot image:', error);
      showToast(t('bubbleSnapshot.copyFailed'));
    } finally {
      setCopying(false);
    }
  }, [exportHeight, exportWidth, localExportScale, previewUrl, showToast, snapshotHtml, snapshotSize.height, snapshotSize.width, t]);

  const handleSaveImage = useCallback(async () => {
    if (!snapshotHtml || !snapshotSize.width || !snapshotSize.height) {
      return;
    }
    setSaving(true);
    try {
      const filename = `pomchat-bubbles-${Date.now()}.png`;
      if (window.electron) {
        const result = await window.electron.showSaveDialog({
          title: t('bubbleSnapshot.save'),
          defaultPath: filename,
          filters: [{ name: 'PNG', extensions: ['png'] }],
        });
        if (result?.canceled || !result?.filePath) {
          return;
        }
        const bytes = await window.electron.renderHtmlToPng({
          html: snapshotHtml,
          width: snapshotSize.width,
          height: snapshotSize.height,
          scale: localExportScale,
        });
        if (!bytes) {
          throw new Error('PNG render returned empty result');
        }
        await window.electron.writeBinaryFile({ filePath: result.filePath, bytes });
      } else {
        const canvas = await renderSvgPreviewToCanvas({ previewUrl, width: exportWidth, height: exportHeight });
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) {
          throw new Error('Failed to build PNG blob');
        }
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }
      showToast(t('bubbleSnapshot.saveSuccess'));
    } catch (error) {
      console.error('Failed to save bubble snapshot image:', error);
      showToast(t('bubbleSnapshot.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [exportHeight, exportWidth, localExportScale, previewUrl, showToast, snapshotHtml, snapshotSize.height, snapshotSize.width, t]);

  const handlePreviewPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [pan.x, pan.y]);

  const handlePreviewPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current) {
      return;
    }
    const nextX = dragStateRef.current.originX + (event.clientX - dragStateRef.current.startX);
    const nextY = dragStateRef.current.originY + (event.clientY - dragStateRef.current.startY);
    setPan({ x: Math.round(nextX), y: Math.round(nextY) });
  }, []);

  const handlePreviewPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current) {
      dragStateRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  if (!open) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-[220] flex items-center justify-center px-4 py-6" style={{ backgroundColor: 'rgba(2, 6, 23, 0.72)', backdropFilter: 'blur(10px)' }}>
        <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border shadow-2xl" style={{ backgroundColor: uiTheme.panelBgElevated, borderColor: uiTheme.border, color: uiTheme.text }}>
          <div className="flex items-center justify-between gap-4 border-b px-5 py-4" style={{ borderColor: uiTheme.border }}>
            <div className="flex items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${secondaryThemeColor}18`, color: secondaryThemeColor }}>
                <ImageIcon size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold">{t('bubbleSnapshot.title')}</div>
                <div className="text-xs opacity-65">{t('bubbleSnapshot.subtitle', { count: subtitles.length })}</div>
              </div>
            </div>
            <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border" style={{ borderColor: uiTheme.border, color: uiTheme.textMuted, backgroundColor: uiTheme.panelBgSubtle }}>
              <X size={16} />
            </button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col border-r" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBg }}>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="space-y-4 pr-1">
                  <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wider opacity-70">{t('bubbleSnapshot.backgroundSource')}</div>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ['project', t('bubbleSnapshot.backgroundModeProject')],
                      ['custom-image', t('bubbleSnapshot.backgroundModeCustomImage')],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setLocalBackgroundMode(value)}
                        className="inline-flex items-center justify-center rounded-lg border px-2 py-2 text-xs transition-colors"
                        style={{
                          borderColor: localBackgroundMode === value ? `${secondaryThemeColor}66` : uiTheme.border,
                          backgroundColor: localBackgroundMode === value ? `${secondaryThemeColor}16` : uiTheme.panelBgSubtle,
                          color: localBackgroundMode === value ? secondaryThemeColor : uiTheme.text,
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ['solid', t('bubbleSnapshot.backgroundModeSolid')],
                      ['transparent', t('bubbleSnapshot.backgroundModeTransparent')],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setLocalBackgroundMode(value)}
                        className="inline-flex items-center justify-center rounded-lg border px-2 py-2 text-xs transition-colors"
                        style={{
                          borderColor: localBackgroundMode === value ? `${secondaryThemeColor}66` : uiTheme.border,
                          backgroundColor: localBackgroundMode === value ? `${secondaryThemeColor}16` : uiTheme.panelBgSubtle,
                          color: localBackgroundMode === value ? secondaryThemeColor : uiTheme.text,
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {localBackgroundMode === 'custom-image' ? (
                <div className="space-y-1.5">
                  <div className="text-xs opacity-70">{t('bubbleSnapshot.customBackgroundImage')}</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={localCustomBackgroundImage}
                      onChange={(event) => setLocalCustomBackgroundImage(event.target.value)}
                      placeholder={t('bubbleSnapshot.customBackgroundPlaceholder')}
                      className="w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
                      style={{ backgroundColor: uiTheme.inputBg, borderColor: uiTheme.border, color: uiTheme.text }}
                    />
                    {window.electron ? (
                      <button
                        type="button"
                        onClick={async () => {
                          const result = await window.electron.showOpenDialog({
                            title: t('bubbleSnapshot.customBackgroundImage'),
                            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }],
                            properties: ['openFile'],
                          });
                          if (!result.canceled && result.filePaths?.[0]) {
                            setLocalCustomBackgroundImage(result.filePaths[0]);
                          }
                        }}
                        className="rounded-lg border px-3 py-1.5 text-xs"
                        style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgSubtle, color: uiTheme.text }}
                      >
                        {t('dialog.browse')}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {localBackgroundMode === 'solid' ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs opacity-70">{t('bubbleSnapshot.backgroundColor')}</span>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: themeColor, backgroundColor: `${themeColor}18` }}>{localBackgroundColor.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={/^#([0-9a-f]{6})$/i.test(localBackgroundColor) ? localBackgroundColor : '#0F172A'}
                      onChange={(event) => setLocalBackgroundColor(event.target.value.toUpperCase())}
                      className="h-9 w-12 rounded border-0 bg-transparent p-0"
                    />
                    <input
                      type="text"
                      value={localBackgroundColor}
                      onChange={(event) => setLocalBackgroundColor(event.target.value)}
                      className="w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
                      style={{ backgroundColor: uiTheme.inputBg, borderColor: uiTheme.border, color: uiTheme.text }}
                    />
                  </div>
                </div>
              ) : null}

              {usesImageBackground ? (
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wider opacity-70">{t('bubbleSnapshot.backgroundImageSizing')}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ['fit-width', t('bubbleSnapshot.backgroundSizingFitWidth')],
                      ['tile', t('bubbleSnapshot.backgroundSizingTile')],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setLocalBackgroundImageSizing(value)}
                        className="inline-flex items-center justify-center rounded-lg border px-2 py-2 text-xs transition-colors"
                        style={{
                          borderColor: localBackgroundImageSizing === value ? `${secondaryThemeColor}66` : uiTheme.border,
                          backgroundColor: localBackgroundImageSizing === value ? `${secondaryThemeColor}16` : uiTheme.panelBgSubtle,
                          color: localBackgroundImageSizing === value ? secondaryThemeColor : uiTheme.text,
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {usesTileBackground ? (
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wider opacity-70">{t('bubbleSnapshot.tileAlign')}</div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['left', <AlignLeft size={14} />, t('bubbleSnapshot.alignLeft')],
                    ['center', <AlignCenter size={14} />, t('bubbleSnapshot.alignCenter')],
                    ['right', <AlignRight size={14} />, t('bubbleSnapshot.alignRight')],
                  ] as const).map(([value, icon, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setLocalTileAlign(value)}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs transition-colors"
                      style={{
                        borderColor: localTileAlign === value ? `${secondaryThemeColor}66` : uiTheme.border,
                        backgroundColor: localTileAlign === value ? `${secondaryThemeColor}16` : uiTheme.panelBgSubtle,
                        color: localTileAlign === value ? secondaryThemeColor : uiTheme.text,
                      }}
                    >
                      {icon}
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              ) : null}

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs opacity-70">{t('bubbleSnapshot.sidePadding')}</span>
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: themeColor, backgroundColor: `${themeColor}18` }}>{localSidePadding}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="160"
                  step="4"
                  value={localSidePadding}
                  onChange={(event) => setLocalSidePadding(parseInt(event.target.value, 10))}
                  className="w-full"
                  style={themedRangeStyle}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs opacity-70">{t('bubbleSnapshot.bubbleWidth')}</span>
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: themeColor, backgroundColor: `${themeColor}18` }}>{localBubbleMaxWidthPercent}%</span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="95"
                  step="1"
                  value={localBubbleMaxWidthPercent}
                  onChange={(event) => setLocalBubbleMaxWidthPercent(parseInt(event.target.value, 10))}
                  className="w-full"
                  style={themedRangeStyle}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs opacity-70">{t('bubbleSnapshot.exportScale')}</span>
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: themeColor, backgroundColor: `${themeColor}18` }}>{localExportScale.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.25"
                  value={localExportScale}
                  onChange={(event) => setLocalExportScale(parseFloat(event.target.value))}
                  className="w-full"
                  style={themedRangeStyle}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs opacity-70">{t('project.blur')}</span>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: themeColor, backgroundColor: `${themeColor}18`, opacity: usesImageBackground ? 1 : 0.55 }}>{localBackgroundBlur}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={localBackgroundBlur}
                    disabled={!usesImageBackground}
                    onChange={(event) => setLocalBackgroundBlur(parseInt(event.target.value, 10))}
                    className="w-full disabled:opacity-50"
                    style={themedRangeStyle}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs opacity-70">{t('project.brightness')}</span>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: themeColor, backgroundColor: `${themeColor}18`, opacity: usesImageBackground ? 1 : 0.55 }}>{Math.round(localBackgroundBrightness * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="2.0"
                    step="0.05"
                    value={localBackgroundBrightness}
                    disabled={!usesImageBackground}
                    onChange={(event) => setLocalBackgroundBrightness(parseFloat(event.target.value))}
                    className="w-full disabled:opacity-50"
                    style={themedRangeStyle}
                  />
                </div>
              </div>

              <div className="rounded-xl border px-3 py-3 text-xs leading-relaxed space-y-1" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgSubtle }}>
                <div>{t('bubbleSnapshot.actualWidth', { width: contentWidth })}</div>
                <div>{t('bubbleSnapshot.exportWidth', { width: snapshotWidth })}</div>
                <div>{t('bubbleSnapshot.exportSize', { width: exportWidth, height: exportHeight })}</div>
                <div>{localBackgroundMode === 'solid' ? t('bubbleSnapshot.backgroundSolidActive') : localBackgroundMode === 'custom-image' && shouldRenderBackground ? t('bubbleSnapshot.backgroundCustomActive') : shouldRenderBackground ? t('bubbleSnapshot.backgroundActive') : t('bubbleSnapshot.noBackground')}</div>
              </div>

                </div>
              </div>

              <div className="shrink-0 space-y-2 border-t p-4" style={{ borderColor: uiTheme.border, backgroundColor: uiTheme.panelBgElevated }}>
                <button
                  type="button"
                  onClick={() => {
                    const node = previewViewportRef.current;
                    setIsZoomDirty(false);
                    if (node) {
                      fitPreviewToWidth();
                    } else {
                      setZoom(1);
                      setPan({ x: 0, y: 0 });
                    }
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: `${secondaryThemeColor}44`, backgroundColor: `${secondaryThemeColor}12`, color: uiTheme.text }}
                >
                  <RotateCcw size={16} />
                  <span>{t('common.reset')}</span>
                </button>
                <button
                  type="button"
                  disabled={!snapshotHtml || isGenerating || saving}
                  onClick={() => void handleSaveImage()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                  style={{ borderColor: `${secondaryThemeColor}44`, backgroundColor: `${secondaryThemeColor}12`, color: uiTheme.text }}
                >
                  <Download size={16} />
                  <span>{saving ? t('bubbleSnapshot.saving') : t('bubbleSnapshot.save')}</span>
                </button>
                <button
                  type="button"
                  disabled={!snapshotHtml || isGenerating || copying}
                  onClick={() => void handleCopyImage()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                  style={{ borderColor: `${secondaryThemeColor}44`, backgroundColor: `${secondaryThemeColor}12`, color: uiTheme.text }}
                >
                  <Copy size={16} />
                  <span>{copying ? t('bubbleSnapshot.copying') : t('bubbleSnapshot.copy')}</span>
                </button>
              </div>
            </div>

            <div
              ref={previewViewportRef}
              className="min-h-0 h-full overflow-hidden p-5"
              onWheel={handlePreviewWheel}
              onPointerDown={handlePreviewPointerDown}
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={handlePreviewPointerUp}
              onPointerCancel={handlePreviewPointerUp}
              style={{ backgroundColor: isDarkMode ? 'rgba(2, 6, 23, 0.55)' : 'rgba(248, 250, 252, 0.88)', cursor: dragStateRef.current ? 'grabbing' : 'grab', touchAction: 'none' }}
            >
              {isGenerating ? (
                <div className="flex h-full min-h-[320px] items-center justify-center text-sm opacity-70">{t('bubbleSnapshot.generating')}</div>
              ) : generateError ? (
                <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-red-400">{generateError}</div>
              ) : subtitles.length > 0 ? (
                <div
                  className="h-full min-h-[320px] flex items-start justify-center overflow-hidden"
                  style={{ userSelect: 'none' }}
                >
                  <div
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                      transformOrigin: 'top center',
                      transition: dragStateRef.current ? 'none' : 'transform 140ms ease-out',
                    }}
                  >
                <div className="mx-auto inline-block rounded-xl border shadow-2xl overflow-hidden" style={{ borderColor: uiTheme.border, backgroundColor: '#00000008' }}>
                  <div
                    style={{
                      width: `${snapshotWidth}px`,
                      position: 'relative',
                      overflow: 'hidden',
                      backgroundColor: snapshotBackgroundColor,
                      paddingTop: '28px',
                      paddingBottom: '28px',
                      paddingLeft: `${localSidePadding}px`,
                      paddingRight: `${localSidePadding}px`,
                    }}
                  >
                    {usesImageBackground ? (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            inset: effectiveBackgroundBlur ? '-12px' : '0',
                            backgroundImage: `url("${backgroundImageSrc}")`,
                            backgroundRepeat: usesTileBackground ? 'repeat' : 'repeat-y',
                            backgroundPositionX: usesTileBackground ? localTileAlign : 'center',
                            backgroundPositionY: 'top',
                            backgroundSize: usesTileBackground ? undefined : '100% auto',
                            filter: `blur(${effectiveBackgroundBlur}px) brightness(${effectiveBackgroundBrightness})`,
                            transform: effectiveBackgroundBlur ? 'scale(1.03)' : undefined,
                          }}
                        />
                      </div>
                    ) : null}

                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column' }}>
                      {subtitles.map((subtitle, index) => renderSnapshotBubble(subtitle, index))}
                    </div>
                  </div>
                </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[320px] items-center justify-center text-sm opacity-60">{t('bubbleSnapshot.empty')}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: 'fixed', left: '-100000px', top: 0, pointerEvents: 'none', opacity: 0, zIndex: -1 }}>
        <div
          ref={sourceRef}
          style={{
            width: `${snapshotWidth}px`,
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: snapshotBackgroundColor,
            paddingTop: '28px',
            paddingBottom: '28px',
            paddingLeft: `${localSidePadding}px`,
            paddingRight: `${localSidePadding}px`,
          }}
        >
          {usesImageBackground ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: effectiveBackgroundBlur ? '-12px' : '0',
                  backgroundImage: `url("${backgroundImageSrc}")`,
                  backgroundRepeat: usesTileBackground ? 'repeat' : 'repeat-y',
                  backgroundPositionX: usesTileBackground ? localTileAlign : 'center',
                  backgroundPositionY: 'top',
                  backgroundSize: usesTileBackground ? undefined : '100% auto',
                  filter: `blur(${effectiveBackgroundBlur}px) brightness(${effectiveBackgroundBrightness})`,
                  transform: effectiveBackgroundBlur ? 'scale(1.03)' : undefined,
                }}
              />
            </div>
          ) : null}

          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column' }}>
            {subtitles.map((subtitle, index) => renderSnapshotBubble(subtitle, index))}
          </div>
        </div>
      </div>
    </>
  );
}
