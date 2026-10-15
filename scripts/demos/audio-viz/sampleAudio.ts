/** Deterministic synthetic tones. No recording or user audio is bundled in the demo. */
export function createSampleAudio() {
  const sampleRate = 24000;
  const duration = 12;
  const samples = new Float32Array(sampleRate * duration);
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const beat = time % 0.5;
    const phrase = time % 6;
    const envelope = phrase > 4.8 ? 0 : Math.exp(-beat * 12) * (0.35 + 0.65 * Math.pow(Math.sin(time * 2.3), 2));
    samples[index] = envelope * (
      0.28 * Math.sin(2 * Math.PI * 180 * time)
      + 0.12 * Math.sin(2 * Math.PI * 720 * time)
      + 0.06 * Math.sin(2 * Math.PI * 2400 * time)
    );
  }
  const wav = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(wav);
  const text = (offset: number, value: string) => {
    [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  };
  text(0, 'RIFF');
  view.setUint32(4, wav.byteLength - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.round(sample * 32767), true));
  return { samples, sampleRate, blob: new Blob([wav], { type: 'audio/wav' }) };
}
