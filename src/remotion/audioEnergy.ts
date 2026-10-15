/** Time-domain energy only, not a frequency spectrum. No playback state is required. */
export interface AudioEnergyEnvelope {
  values: Float32Array;
  samplesPerSecond: number;
  duration: number;
}

const finiteClamp = (value: number, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Compute RMS before reducing the sample rate; average channel power, not channel amplitudes. */
export function analyzeAudioEnergy(
  channels: readonly Float32Array[],
  sampleRate: number,
  samplesPerSecond = 120,
): AudioEnergyEnvelope {
  if (!channels.length || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error('Audio channels and a positive sample rate are required.');
  }
  const length = channels[0].length;
  if (channels.some((channel) => channel.length !== length)) {
    throw new Error('Audio channels must have equal lengths.');
  }
  const rate = finiteClamp(samplesPerSecond, 1, Math.min(sampleRate, 1000), Math.min(sampleRate, 120));
  const duration = length / sampleRate;
  const values = new Float32Array(Math.ceil(duration * rate));
  for (let bin = 0; bin < values.length; bin += 1) {
    const start = Math.floor(bin * sampleRate / rate);
    const end = Math.min(length, Math.floor((bin + 1) * sampleRate / rate));
    let power = 0;
    for (const channel of channels) {
      for (let index = start; index < end; index += 1) {
        const sample = Number.isFinite(channel[index]) ? channel[index] : 0;
        power += sample * sample;
      }
    }
    values[bin] = Math.sqrt(power / Math.max(1, (end - start) * channels.length));
  }
  return { values, samplesPerSecond: rate, duration };
}

/** Precompute a causal moving average, so seeking backwards yields exactly the same bars. */
export function smoothAudioEnergy(envelope: AudioEnergyEnvelope, seconds: number): AudioEnergyEnvelope {
  const windowSize = Math.max(1, Math.round(finiteClamp(seconds, 0, 0.5, 0.06) * envelope.samplesPerSecond));
  const values = new Float32Array(envelope.values.length);
  let total = 0;
  for (let index = 0; index < values.length; index += 1) {
    total += envelope.values[index];
    if (index >= windowSize) total -= envelope.values[index - windowSize];
    values[index] = Math.max(0, total / Math.min(index + 1, windowSize));
  }
  return { ...envelope, values };
}

export function energyAtTime(envelope: AudioEnergyEnvelope, time: number): number {
  if (!Number.isFinite(time) || time < 0 || time >= envelope.duration || !envelope.values.length) return 0;
  const position = time * envelope.samplesPerSecond;
  const index = Math.min(envelope.values.length - 1, Math.floor(position));
  const next = Math.min(envelope.values.length - 1, index + 1);
  return envelope.values[index] + (envelope.values[next] - envelope.values[index]) * (position - index);
}

/** Bars read recent time windows from left to right; they are not separate frequency bands. */
export function getEnergyBarLevels(
  envelope: AudioEnergyEnvelope,
  time: number,
  count = 48,
  gain = 4,
  historySeconds = 0.6,
): number[] {
  const safeCount = Math.round(finiteClamp(count, 4, 128, 48));
  const safeGain = finiteClamp(gain, 0, 20, 4);
  const history = finiteClamp(historySeconds, 0, 2, 0.6);
  return Array.from({ length: safeCount }, (_, index) => {
    const sampleTime = time - history * (1 - index / (safeCount - 1));
    return Math.pow(Math.min(1, Math.max(0, energyAtTime(envelope, sampleTime) * safeGain)), 0.8);
  });
}
