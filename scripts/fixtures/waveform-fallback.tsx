import React, { createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { PlayerControls } from '../../src/components/PlayerControls';

function createPcmWaveBlob() {
  const sampleRate = 8000;
  const sampleCount = sampleRate;
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeText(0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, sampleCount * 2, true);
  for (let index = 0; index < sampleCount; index += 1) {
    view.setInt16(44 + index * 2, Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * 440) * 24000), true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

const waveformFallbackTest = {
  run: async () => {
    const originalDecode = AudioContext.prototype.decodeAudioData;
    let decodeFailures = 0;
    let fallbackCalls = 0;
    AudioContext.prototype.decodeAudioData = function () {
      decodeFailures += 1;
      return Promise.reject(new DOMException('Synthetic unsupported codec', 'EncodingError'));
    };

    const source = createPcmWaveBlob();
    const sourceUrl = URL.createObjectURL(source);
    const audioRef = createRef<HTMLAudioElement>();
    const fallbackSamples = Float32Array.from({ length: 1024 }, (_, index) => Math.sin(index / 10));
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        generateAudioWaveformSamples: async () => {
          fallbackCalls += 1;
          return fallbackSamples;
        },
      },
    });

    const root = createRoot(document.getElementById('root')!);
    root.render(<>
      <audio ref={audioRef} src={sourceUrl} />
      <PlayerControls
        audioPath={sourceUrl}
        audioBlob={source}
        waveformSourcePath="synthetic.wav"
        waveformProjectPath={null}
        audioRef={audioRef}
        duration={1}
        isPlaying={false}
        loop={false}
        playbackRate={1}
        onPlayPause={() => {}}
        onReset={() => {}}
        onSeek={() => {}}
        onLoopChange={() => {}}
        onRateChange={() => {}}
        isDarkMode={false}
        language="en"
        themeColor="#545454"
        secondaryThemeColor="#ed7e96"
        audioVolume={0.8}
        onAudioVolumeChange={() => {}}
        exportRangeStart={0}
        exportRangeEnd={1}
        defaultExportStart={0}
        defaultExportEnd={1}
        onExportRangeChange={() => {}}
      />
    </>);

    const startedAt = Date.now();
    let waveform = document.querySelector<HTMLElement>('[title="Click waveform to seek"]');
    while ((!waveform || waveform.style.visibility !== 'visible') && Date.now() - startedAt < 8000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      waveform = document.querySelector<HTMLElement>('[title="Click waveform to seek"]');
    }

    const shadowRoot = waveform?.firstElementChild?.shadowRoot;
    const result = {
      decodeFailures,
      fallbackCalls,
      visible: waveform?.style.visibility === 'visible',
      canvasCount: shadowRoot?.querySelectorAll('canvas').length ?? 0,
    };

    root.unmount();
    URL.revokeObjectURL(sourceUrl);
    AudioContext.prototype.decodeAudioData = originalDecode;
    return result;
  },
};

Object.defineProperty(window, 'PomChatWaveformFallbackTest', {
  configurable: true,
  value: waveformFallbackTest,
});
