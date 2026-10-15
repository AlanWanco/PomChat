export interface SpectrumBarOptions {
  count?: number;
  gain?: number;
  smoothingSeconds?: number;
}

export interface AudioSpectrumSampler {
  getLevels: (time: number, options?: SpectrumBarOptions) => number[];
}

export const SPECTRUM_FFT_SIZE = 2048;
export const SPECTRUM_LOW_HZ = 60;
export const SPECTRUM_HIGH_HZ = 10000;
export const SPECTRUM_BIN_COUNT = SPECTRUM_FFT_SIZE / 2 + 1;

const FRAME_RATE = 60;
const MAX_CACHED_FRAMES = 240;
const clamp = (value: number, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

// Fixed FFT plan: shared across audio sources. No random or accumulated playback state.
const window = Float64Array.from({ length: SPECTRUM_FFT_SIZE }, (_, index) =>
  0.5 * (1 - Math.cos(2 * Math.PI * index / (SPECTRUM_FFT_SIZE - 1))),
);
const reversed = Uint16Array.from({ length: SPECTRUM_FFT_SIZE }, (_, index) => {
  let bits = index;
  let reverse = 0;
  for (let bit = 0; bit < 11; bit += 1) {
    reverse = (reverse << 1) | (bits & 1);
    bits >>= 1;
  }
  return reverse;
});
const cosines = Float64Array.from({ length: SPECTRUM_FFT_SIZE / 2 }, (_, index) => Math.cos(-2 * Math.PI * index / SPECTRUM_FFT_SIZE));
const sines = Float64Array.from({ length: SPECTRUM_FFT_SIZE / 2 }, (_, index) => Math.sin(-2 * Math.PI * index / SPECTRUM_FFT_SIZE));
const real = new Float64Array(SPECTRUM_FFT_SIZE);
const imaginary = new Float64Array(SPECTRUM_FFT_SIZE);

/**
 * Per-bin power for one Hann-windowed frame, summed across the supplied channel windows.
 * Every window must be exactly SPECTRUM_FFT_SIZE long; missing samples must already be zero.
 * Channels are combined as power so opposite-phase stereo does not cancel.
 */
export function computeSpectrumFramePowers(windows: readonly Float32Array[], sampleRate: number): Float32Array {
  const channels = windows.length;
  if (!channels || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error('At least one channel window and a positive sample rate are required.');
  }
  if (windows.some((channel) => channel.length !== SPECTRUM_FFT_SIZE)) {
    throw new Error('Every channel window must be exactly SPECTRUM_FFT_SIZE samples long.');
  }
  const power = new Float32Array(SPECTRUM_BIN_COUNT);
  const normalization = ((SPECTRUM_FFT_SIZE - 1) / 4) ** 2 * channels;
  for (const channel of windows) {
    imaginary.fill(0);
    for (let index = 0; index < SPECTRUM_FFT_SIZE; index += 1) {
      const sample = Number.isFinite(channel[index]) ? channel[index] : 0;
      real[reversed[index]] = sample * window[index];
    }
    for (let size = 2; size <= SPECTRUM_FFT_SIZE; size *= 2) {
      const half = size / 2;
      const stride = SPECTRUM_FFT_SIZE / size;
      for (let block = 0; block < SPECTRUM_FFT_SIZE; block += size) {
        for (let offset = 0; offset < half; offset += 1) {
          const even = block + offset;
          const odd = even + half;
          const twiddle = offset * stride;
          const re = real[odd] * cosines[twiddle] - imaginary[odd] * sines[twiddle];
          const im = real[odd] * sines[twiddle] + imaginary[odd] * cosines[twiddle];
          real[odd] = real[even] - re;
          imaginary[odd] = imaginary[even] - im;
          real[even] += re;
          imaginary[even] += im;
        }
      }
    }
    for (let bin = 0; bin < SPECTRUM_BIN_COUNT; bin += 1) {
      power[bin] += (real[bin] ** 2 + imaginary[bin] ** 2) / normalization;
    }
  }
  return power;
}

/** Log-spaced band edges in FFT bins, from SPECTRUM_LOW_HZ up to the Nyquist limit. */
export function getSpectrumBandBins(sampleRate: number, index: number, count: number): readonly [number, number] {
  const lowHz = Math.min(SPECTRUM_LOW_HZ, sampleRate / 8);
  const highHz = Math.min(SPECTRUM_HIGH_HZ, sampleRate / 2);
  const ratio = highHz / lowHz;
  const first = Math.max(1, Math.floor(lowHz * ratio ** (index / count) * SPECTRUM_FFT_SIZE / sampleRate));
  const end = Math.min(SPECTRUM_BIN_COUNT, Math.max(first + 1,
    Math.ceil(lowHz * ratio ** ((index + 1) / count) * SPECTRUM_FFT_SIZE / sampleRate)));
  return [first, end] as const;
}

/** Band amplitude from per-bin power, before any display mapping. */
export function getSpectrumBandAmplitude(power: ArrayLike<number>, bandCount: number, index: number, sampleRate: number): number {
  const [first, end] = getSpectrumBandBins(sampleRate, index, bandCount);
  let bandPower = 0;
  for (let bin = first; bin < end; bin += 1) bandPower += power[bin];
  return Math.sqrt(Math.max(0, bandPower / (end - first)));
}

/** dB mapping used for display: -60 dB and below is the baseline. */
export const getSpectrumDisplayLevel = (amplitude: number) => {
  const db = 20 * Math.log10(Math.max(1e-12, amplitude));
  return clamp((db + 60) / 60, 0, 1, 0);
};

const silence = new Float32Array(SPECTRUM_BIN_COUNT);

/**
 * Sample a causal Hann-window FFT at an absolute time. Retains the decoded PCM;
 * callers must keep the supplied arrays immutable. A bounded cache avoids decoding
 * or analyzing the entire file again when seeking, changing gain or changing count.
 */
export function createAudioSpectrumSampler(channels: readonly Float32Array[], sampleRate: number): AudioSpectrumSampler {
  if (!channels.length || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error('Audio channels and a positive sample rate are required.');
  }
  const length = channels[0].length;
  if (channels.some((channel) => channel.length !== length)) {
    throw new Error('Audio channels must have equal lengths.');
  }
  const duration = length / sampleRate;
  const cache = new Map<number, Float32Array>();
  const windows = channels.map(() => new Float32Array(SPECTRUM_FFT_SIZE));

  const powerAtFrame = (frame: number): Float32Array => {
    if (frame <= 0 || frame / FRAME_RATE > duration) return silence;
    const cached = cache.get(frame);
    if (cached) return cached;
    const end = Math.floor(frame * sampleRate / FRAME_RATE);
    for (let index = 0; index < SPECTRUM_FFT_SIZE; index += 1) {
      const sourceIndex = end - SPECTRUM_FFT_SIZE + index;
      const valid = sourceIndex >= 0 && sourceIndex < length;
      for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
        const sample = valid ? channels[channelIndex][sourceIndex] : 0;
        windows[channelIndex][index] = Number.isFinite(sample) ? sample : 0;
      }
    }
    const power = computeSpectrumFramePowers(windows, sampleRate);
    cache.set(frame, power);
    if (cache.size > MAX_CACHED_FRAMES) cache.delete(cache.keys().next().value!);
    return power;
  };

  return {
    getLevels(time, { count = 48, gain = 5, smoothingSeconds = 0.04 } = {}) {
      const safeCount = Math.round(clamp(count, 4, 128, 48));
      const safeGain = clamp(gain, 0, 20, 5);
      if (!Number.isFinite(time) || time < 0 || time >= duration || safeGain === 0) {
        return Array(safeCount).fill(0);
      }
      const position = time * FRAME_RATE;
      const frame = Math.floor(position);
      const fraction = position - frame;
      const smoothingFrames = 1 + Math.round(clamp(smoothingSeconds, 0, 0.18, 0.04) * FRAME_RATE);
      const power = new Float64Array(SPECTRUM_BIN_COUNT);
      for (let offset = 0; offset < smoothingFrames; offset += 1) {
        const left = powerAtFrame(frame - offset);
        const right = fraction > 0 ? powerAtFrame(frame - offset + 1) : left;
        for (let bin = 0; bin < SPECTRUM_BIN_COUNT; bin += 1) {
          power[bin] += (left[bin] + (right[bin] - left[bin]) * fraction) / smoothingFrames;
        }
      }
      return Array.from({ length: safeCount }, (_, index) => {
        const amplitude = getSpectrumBandAmplitude(power, safeCount, index, sampleRate) * safeGain;
        return getSpectrumDisplayLevel(amplitude);
      });
    },
  };
}
