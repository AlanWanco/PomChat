import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, AudioLines, Eye, EyeOff, Layers, Moon, Pause, Play, RotateCcw, Sun, Type, Upload, Plus, X } from 'lucide-react';
import { translate, type Language } from '../../../src/i18n';
import { createThemeTokens } from '../../../src/theme';
import { ChatMessageBubble } from '../../../src/components/chat/SharedChatBubbles';
import { AudioEnergyBars } from '../../../src/remotion/AudioEnergyBars';
import { analyzeAudioEnergy, getEnergyBarLevels, smoothAudioEnergy, type AudioEnergyEnvelope } from '../../../src/remotion/audioEnergy';
import { createAudioSpectrumSampler, type AudioSpectrumSampler } from '../../../src/remotion/audioSpectrum';
import { createSampleAudio } from './sampleAudio';
import './style.css';

interface DemoSource {
  url: string;
  name: string | null;
  envelope: AudioEnergyEnvelope;
  spectrum: AudioSpectrumSampler;
}

interface BarSettings {
  mode: 'energy' | 'spectrum';
  spectrumAlignment: 'center' | 'bottom';
  count: number;
  gain: number;
  smoothing: number;
  color: string;
  colorMode: 'solid' | 'gradient';
  gradientColors: string[];
  cornerStyle: 'rounded' | 'square';
  alignment: 'center' | 'bottom';
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  layer: 'background' | 'overlay';
  order: number;
  visible: boolean;
}

const defaults: BarSettings = {
  mode: 'energy', spectrumAlignment: 'bottom', cornerStyle: 'rounded',
  colorMode: 'solid', gradientColors: ['#ed7e96', '#c3a6f3', '#70c9dc'],
  count: 48, gain: 5, smoothing: 0.04, color: '#ed7e96', alignment: 'center',
  x: 640, y: 562, width: 980, height: 124, opacity: 1, layer: 'overlay', order: 1, visible: true,
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const formatTime = (time: number) => `${Math.floor(time / 60).toString().padStart(2, '0')}:${(time % 60).toFixed(2).padStart(5, '0')}`;

function sampleSource(): DemoSource {
  const { samples, sampleRate, blob } = createSampleAudio();
  return {
    url: URL.createObjectURL(blob), name: null,
    envelope: analyzeAudioEnergy([samples], sampleRate),
    spectrum: createAudioSpectrumSampler([samples], sampleRate),
  };
}

function Slider({ label, value, min, max, step = 1, unit = '', onChange, testId }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string;
  onChange: (value: number) => void; testId?: string;
}) {
  return <label className="slider-field">
    <span>{label}<output>{Number(value.toFixed(2))}{unit}</output></span>
    <input data-testid={testId} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
  </label>;
}

export function AudioVizDemo() {
  const [language, setLanguage] = useState<Language>('zh-CN');
  const [dark, setDark] = useState(false);
  const [source, setSource] = useState(sampleSource);
  const [settings, setSettings] = useState<BarSettings>(defaults);
  const [time, setTime] = useState(1.25);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.35);
  const [loop, setLoop] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState('');
  const [scale, setScale] = useState(0.6);
  const audio = useRef<HTMLAudioElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const importId = useRef(0);
  const initialTime = useRef(1.25);
  const drag = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const t = (key: string) => translate(language, key);
  const theme = createThemeTokens('#545454', dark);
  const cssVars = {
    '--app': theme.appBg, '--panel': theme.panelBg, '--subtle': theme.panelBgSubtle,
    '--text': theme.text, '--muted': theme.textMuted, '--border': theme.border, '--input': theme.inputBg,
    '--accent': dark ? '#f5a1b4' : '#a83756', '--selected': dark ? '#3e2931' : '#fce8ee',
    '--on-accent': dark ? '#2b1820' : '#ffffff', colorScheme: dark ? 'dark' : 'light',
  } as CSSProperties;
  const smoothed = useMemo(() => smoothAudioEnergy(source.envelope, settings.smoothing), [source.envelope, settings.smoothing]);
  const levels = useMemo(() => {
    if (!settings.visible) return [];
    return settings.mode === 'spectrum'
      ? source.spectrum.getLevels(time, { count: settings.count, gain: settings.gain, smoothingSeconds: settings.smoothing })
      : getEnergyBarLevels(smoothed, time, settings.count, settings.gain);
  }, [smoothed, source.spectrum, time, settings.count, settings.gain, settings.mode, settings.smoothing, settings.visible]);
  const modeLabel = t(settings.mode === 'spectrum' ? 'audioViz.modeSpectrum' : 'audioViz.modeEnergy');
  const alignment = settings.mode === 'spectrum' ? settings.spectrumAlignment : settings.alignment;
  const update = <K extends keyof BarSettings>(key: K, value: BarSettings[K]) => setSettings((previous) => ({ ...previous, [key]: value }));

  useEffect(() => () => URL.revokeObjectURL(source.url), [source.url]);
  useEffect(() => () => { importId.current += 1; }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  useEffect(() => { if (audio.current) audio.current.volume = volume; }, [volume, source.url]);
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 1280));
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      if (audio.current) setTime(audio.current.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const seek = (next: number) => {
    const bounded = clamp(next, 0, source.envelope.duration);
    if (audio.current) audio.current.currentTime = bounded;
    initialTime.current = bounded;
    setTime(bounded);
  };
  const togglePlayback = async () => {
    if (!audio.current) return;
    if (!audio.current.paused) { audio.current.pause(); return; }
    try {
      setErrorKey('');
      if (audio.current.ended) seek(0);
      await audio.current.play();
    } catch { setErrorKey('audioViz.playError'); }
  };
  const replaceSource = (next: DemoSource) => {
    audio.current?.pause();
    setPlaying(false);
    initialTime.current = 0;
    setTime(0);
    setSource(next);
  };
  const loadFile = async (file: File) => {
    const request = ++importId.current;
    setErrorKey('');
    if (file.size > 32 * 1024 * 1024) { setErrorKey('audioViz.limitError'); return; }
    audio.current?.pause();
    setBusy(true);
    let context: AudioContext | undefined;
    try {
      context = new AudioContext({ sampleRate: 24000 });
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      if (request !== importId.current) return;
      if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > 300) {
        setErrorKey('audioViz.limitError');
        return;
      }
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
      const envelope = analyzeAudioEnergy(channels, buffer.sampleRate);
      const spectrum = createAudioSpectrumSampler(channels, buffer.sampleRate);
      replaceSource({ url: URL.createObjectURL(file), name: file.name, envelope, spectrum });
    } catch {
      if (request === importId.current) setErrorKey('audioViz.decodeError');
    } finally {
      await context?.close().catch(() => {});
      if (request === importId.current) setBusy(false);
    }
  };
  const barBox: CSSProperties = {
    position: 'absolute', left: settings.x - settings.width / 2, top: settings.y - settings.height / 2,
    width: settings.width, height: settings.height,
  };
  const barLayer = <div className="layer-row selected" data-testid="energy-layer">
    <AudioLines size={18} aria-hidden /><span>{modeLabel}</span>
    <button title={t(settings.visible ? 'audioViz.hide' : 'audioViz.show')} aria-label={t(settings.visible ? 'audioViz.hide' : 'audioViz.show')} data-testid="visibility" onClick={() => update('visible', !settings.visible)}>{settings.visible ? <Eye size={16} /> : <EyeOff size={16} />}</button>
    <button title={t('audioViz.moveUp')} aria-label={t('audioViz.moveUp')} data-testid="move-up" disabled={settings.layer !== 'overlay' || settings.order === 1} onClick={() => update('order', 1)}><ArrowUp size={16} /></button>
    <button title={t('audioViz.moveDown')} aria-label={t('audioViz.moveDown')} data-testid="move-down" disabled={settings.layer !== 'overlay' || settings.order === 0} onClick={() => update('order', 0)}><ArrowDown size={16} /></button>
  </div>;
  const textLayer = <div className="layer-row"><Type size={18} aria-hidden /><span>{t('audioViz.textLayer')}</span><span className="layer-tag">{t('audioViz.above')}</span></div>;

  return <div className="demo" style={cssVars}>
    <header className="app-header">
      <div className="brand"><AudioLines size={24} aria-hidden /><strong>PomChat <span>Studio</span></strong><span className="prototype">{t('audioViz.prototype')}</span></div>
      <div className="header-actions">
        <button onClick={() => setLanguage(language === 'zh-CN' ? 'en' : 'zh-CN')} data-testid="language">{language === 'zh-CN' ? 'English' : '中文'}</button>
        <button onClick={() => setDark(!dark)} title={t('audioViz.theme')} aria-label={t('audioViz.theme')} data-testid="theme">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
      </div>
    </header>
    <main>
      <div className="page-heading"><h1>{t('audioViz.demoTitle')}</h1><p>{t('audioViz.scope')}</p></div>
      <div className="workspace">
        <section className="preview-column" aria-label={t('audioViz.preview')}>
          <div className="preview-heading"><span>{t('audioViz.preview')}</span><span>1280 × 720</span></div>
          <div className="viewport" ref={viewport}>
            <div className="stage" style={{ transform: `scale(${scale})` }} data-testid="stage">
              <div className="stage-heading"><span>{t('audioViz.stageCaption')}</span><h2>{t('audioViz.stageTitle')}</h2></div>
              <div className="sample-chats">
                {[false, true].map((right) => <div key={String(right)} style={{ display: 'flex', justifyContent: right ? 'flex-end' : 'flex-start' }}>
                  <ChatMessageBubble item={{ key: String(right), speakerId: String(right), start: 0, end: 20, text: t(right ? 'audioViz.messageB' : 'audioViz.messageA') }}
                    speaker={{ name: t(right ? 'audioViz.speakerB' : 'audioViz.speakerA'), side: right ? 'right' : 'left', style: { bgColor: right ? '#f8d4df' : '#ffffff', textColor: '#263044', nameColor: '#d9e0ed', fontSize: 29, borderRadius: 22, paddingX: 26, paddingY: 22, bubbleShadow: false, textShadow: false } }}
                    currentTime={2} canvasWidth={1100} layoutScale={1}
                    chatLayout={{ animationStyle: 'none', bubbleScale: 1, showAvatar: false, showSpeakerName: true, showTimestamp: false, bubbleMaxWidthPercent: 85 }}
                    renderBubble={({ outerStyle, contentStyle, children }) => <div style={outerStyle}><div style={contentStyle}>{children}</div></div>}
                  />
                </div>)}
              </div>
              <div className="stage-text-asset" data-testid="text-asset">{t('audioViz.demoLabel')}</div>
              {settings.visible && <>
                <div data-testid="energy-bars" style={{ ...barBox, opacity: settings.opacity, zIndex: settings.layer === 'background' ? 1 : 10 + settings.order * 2 }}>
                  <AudioEnergyBars
                    levels={levels} color={settings.color} colorMode={settings.colorMode} gradientColors={settings.gradientColors}
                    width={settings.width} height={settings.height} alignment={alignment} cornerStyle={settings.cornerStyle} label={modeLabel}
                  />
                </div>
                <div className="selection" style={barBox} role="button" tabIndex={0} aria-label={t('audioViz.dragHint')} data-testid="drag-box"
                  onKeyDown={(event) => {
                    const moves: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
                    const move = moves[event.key];
                    if (!move) return;
                    event.preventDefault();
                    setSettings((previous) => ({ ...previous, x: clamp(previous.x + move[0], 0, 1280), y: clamp(previous.y + move[1], 0, 720) }));
                  }}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: settings.x, originY: settings.y };
                  }}
                  onPointerMove={(event) => {
                    const initial = drag.current;
                    if (!initial || initial.pointerId !== event.pointerId) return;
                    setSettings((previous) => ({ ...previous,
                      x: clamp(Math.round(initial.originX + (event.clientX - initial.x) / scale), 0, 1280),
                      y: clamp(Math.round(initial.originY + (event.clientY - initial.y) / scale), 0, 720),
                    }));
                  }}
                  onPointerUp={() => { drag.current = null; }}
                  onPointerCancel={() => { drag.current = null; }}
                  onLostPointerCapture={() => { drag.current = null; }}
                ><span className="selection-name">{modeLabel}</span><i /><i /><i /><i /></div>
              </>}
            </div>
          </div>
          <p className="hint">{t('audioViz.dragHint')}</p>
          <div className="transport">
            <audio ref={audio} src={source.url} loop={loop} preload="auto"
              onLoadedMetadata={() => { if (audio.current) audio.current.currentTime = initialTime.current; }}
              onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); if (audio.current) setTime(audio.current.currentTime); }}
              onSeeked={() => { if (audio.current) setTime(audio.current.currentTime); }}
              onEnded={() => { setPlaying(false); setTime(source.envelope.duration); }}
              onError={() => setErrorKey('audioViz.playError')}
            />
            <div className="transport-row">
              <button className="primary play-button" data-testid="play" disabled={busy} onClick={() => { void togglePlayback(); }}>{playing ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}{t(playing ? 'player.pause' : 'player.play')}</button>
              <span className="timecode" data-testid="time">{formatTime(time)} <span>/ {formatTime(source.envelope.duration)}</span></span>
              <label className="loop"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />{t('audioViz.loop')}</label>
            </div>
            <input className="seek" aria-label={t('audioViz.seek')} data-testid="seek" type="range" min="0" max={source.envelope.duration} step="0.01" value={time} onChange={(event) => seek(Number(event.target.value))} disabled={busy} />
            <div className="audio-source"><AudioLines size={19} aria-hidden /><span title={source.name || t('audioViz.sample')}>{source.name || t('audioViz.sample')}</span><button disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={15} aria-hidden />{t('audioViz.import')}</button></div>
            <input hidden ref={fileInput} data-testid="file" type="file" accept="audio/*,.m4a,.wav,.mp3,.flac,.aac,.ogg" onChange={(event) => {
              const file = event.target.files?.[0]; event.target.value = ''; if (file) void loadFile(file);
            }} />
            <div role="status" aria-live="polite">{busy && <p className="hint">{t('audioViz.analyzing')}</p>}{errorKey && <p className="error">{t(errorKey)}</p>}</div>
            <p className="hint">{t('audioViz.audioHint')}</p>
            <div className="volume-row"><Slider label={t('audioViz.volume')} value={volume} min={0} max={1} step={0.05} onChange={setVolume} testId="volume" /><button disabled={busy} onClick={() => { setErrorKey(''); replaceSource(sampleSource()); }}><RotateCcw size={15} aria-hidden />{t('audioViz.restoreSample')}</button></div>
            <p className="hint">{t('audioViz.volumeHint')}</p>
          </div>
          <p className="energy-explanation">{t(settings.mode === 'spectrum' ? 'audioViz.spectrumHint' : 'audioViz.energyHint')}</p>
        </section>
        <aside className="inspector">
          <section className="panel layers"><h2><Layers size={18} aria-hidden />{t('audioViz.assets')}</h2><p className="hint">{t('audioViz.layerHint')}</p>
            {settings.layer === 'overlay' && settings.order === 1 && barLayer}{textLayer}{settings.layer === 'overlay' && settings.order === 0 && barLayer}
            <div className="layer-row chat-row">{t('audioViz.chatLayer')}</div>
            {settings.layer === 'background' && barLayer}
            <div className="layer-row background-row">{t('audioViz.backgroundLayer')}</div>
            <label className="select-field"><span>{t('audioViz.layer')}</span><select value={settings.layer} data-testid="placement" onChange={(event) => update('layer', event.target.value as BarSettings['layer'])}><option value="overlay">{t('audioViz.above')}</option><option value="background">{t('audioViz.below')}</option></select></label>
          </section>
          <section className="panel controls"><h2>{t('audioViz.appearance')}</h2>
            <div className="mode-selector" role="group" aria-label={t('audioViz.mode')}>
              {(['energy', 'spectrum'] as const).map((mode) => <button
                key={mode} type="button" data-testid={`mode-${mode}`} aria-pressed={settings.mode === mode}
                onClick={() => update('mode', mode)}
              >{t(mode === 'spectrum' ? 'audioViz.modeSpectrum' : 'audioViz.modeEnergy')}</button>)}
            </div>
            <p className="hint mode-hint">{t(settings.mode === 'spectrum' ? 'audioViz.modeSpectrumHint' : 'audioViz.modeEnergyHint')}</p>
            <label className="select-field"><span>{t('audioViz.colorMode')}</span><select value={settings.colorMode} data-testid="color-mode" onChange={(event) => update('colorMode', event.target.value as BarSettings['colorMode'])}><option value="solid">{t('audioViz.solid')}</option><option value="gradient">{t('audioViz.gradient')}</option></select></label>
            <div className="color-controls">
              {settings.colorMode === 'solid' ? (
                <label className="color-field">{t('audioViz.color')}<input aria-label={t('audioViz.color')} type="color" value={settings.color} onChange={(event) => update('color', event.target.value)} data-testid="color" /><span>{settings.color}</span></label>
              ) : <div className="gradient-controls">
                <div className="gradient-preview" aria-hidden style={{ background: `linear-gradient(90deg, ${settings.gradientColors.join(', ')})` }} />
                {settings.gradientColors.map((color, index) => <div className="gradient-stop" key={index}>
                  <label className="color-field">
                    {translate(language, 'audioViz.gradientColor', { index: index + 1 })}
                    <input type="color" value={color} data-testid={`gradient-color-${index}`} onChange={(event) => {
                      const value = event.target.value;
                      setSettings((previous) => ({ ...previous, gradientColors: previous.gradientColors.map((oldColor, colorIndex) => colorIndex === index ? value : oldColor) }));
                    }} />
                    <span>{color}</span>
                  </label>
                  <button type="button" data-testid={`remove-color-${index}`} disabled={settings.gradientColors.length <= 2}
                    aria-label={translate(language, 'audioViz.removeColor', { index: index + 1 })}
                    title={translate(language, 'audioViz.removeColor', { index: index + 1 })}
                    onClick={() => setSettings((previous) => previous.gradientColors.length <= 2 ? previous : { ...previous, gradientColors: previous.gradientColors.filter((_, colorIndex) => colorIndex !== index) })}
                  ><X size={15} aria-hidden /></button>
                </div>)}
                <div className="gradient-actions">
                  <button type="button" data-testid="add-color" disabled={settings.gradientColors.length >= 5}
                    onClick={() => setSettings((previous) => previous.gradientColors.length >= 5 ? previous : { ...previous, gradientColors: [...previous.gradientColors, '#ffffff'] })}
                  ><Plus size={15} aria-hidden />{t('audioViz.addColor')}</button>
                  <button type="button" data-testid="reverse-color"
                    title={t('audioViz.reverseColors')} aria-label={t('audioViz.reverseColors')}
                    onClick={() => setSettings((previous) => ({ ...previous, gradientColors: [...previous.gradientColors].reverse() }))}
                  ><ArrowLeftRight size={15} aria-hidden />{t('audioViz.reverseColors')}</button>
                </div>
                <p className="hint">{t('audioViz.gradientHint')}</p>
              </div>}
            </div>
            <Slider label={t('audioViz.count')} value={settings.count} min={8} max={96} step={4} onChange={(value) => update('count', value)} testId="count" />
            <Slider label={t('audioViz.gain')} value={settings.gain} min={0.5} max={12} step={0.25} unit="×" onChange={(value) => update('gain', value)} testId="gain" />
            <Slider label={t('audioViz.smoothing')} value={settings.smoothing * 1000} min={0} max={180} step={10} unit=" ms" onChange={(value) => update('smoothing', value / 1000)} />
            <label className="select-field"><span>{t('audioViz.corners')}</span><select value={settings.cornerStyle} data-testid="corners" onChange={(event) => update('cornerStyle', event.target.value as BarSettings['cornerStyle'])}><option value="rounded">{t('audioViz.rounded')}</option><option value="square">{t('audioViz.square')}</option></select></label>
            <label className="select-field"><span>{t('audioViz.align')}</span><select value={alignment} data-testid="alignment" onChange={(event) => update(settings.mode === 'spectrum' ? 'spectrumAlignment' : 'alignment', event.target.value as BarSettings['alignment'])}><option value="center">{t('audioViz.center')}</option><option value="bottom">{t('audioViz.bottom')}</option></select></label>
            <details open><summary>{t('audioViz.position')}</summary>
              <Slider label={t('audioViz.x')} value={settings.x} min={0} max={1280} onChange={(value) => update('x', value)} testId="position-x" />
              <Slider label={t('audioViz.y')} value={settings.y} min={0} max={720} onChange={(value) => update('y', value)} testId="position-y" />
              <Slider label={t('audioViz.width')} value={settings.width} min={200} max={1200} step={10} onChange={(value) => update('width', value)} />
              <Slider label={t('audioViz.height')} value={settings.height} min={40} max={300} step={4} onChange={(value) => update('height', value)} />
              <Slider label={t('audioViz.opacity')} value={settings.opacity} min={0} max={1} step={0.05} onChange={(value) => update('opacity', value)} />
            </details>
            <button className="reset" onClick={() => setSettings(defaults)} data-testid="reset"><RotateCcw size={15} aria-hidden />{t('audioViz.reset')}</button>
          </section>
        </aside>
      </div>
    </main>
  </div>;
}
