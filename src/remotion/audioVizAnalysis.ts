import { AUDIO_VIZ_MAX_DURATION, createAudioVizGridBuilder, type AudioVizGrid } from './audioVizGrid';

const CHUNK_SAMPLES = 1024;
const TIME_SLICE_MS = 6;

interface AudioVizAnalysisOptions {
  signal?: AbortSignal;
  /** Desktop supplies setImmediate; browsers prefer scheduler.yield when available. */
  yieldToMain?: () => Promise<void>;
}

const yieldToBrowser = () => {
  const scheduler = (globalThis as typeof globalThis & {
    scheduler?: { yield?: () => Promise<void> };
  }).scheduler;
  return scheduler?.yield ? scheduler.yield() : new Promise<void>((resolve) => setTimeout(resolve, 0));
};

/** Keep the shared analysis deterministic while allowing input, painting and IPC between batches. */
export function createAsyncAudioVizGridBuilder(sampleRate: number, {
  signal,
  yieldToMain = yieldToBrowser,
}: AudioVizAnalysisOptions = {}) {
  const builder = createAudioVizGridBuilder(sampleRate);
  let sliceStarted = 0;
  let started = false;

  const yieldAnalysis = async () => {
    signal?.throwIfAborted();
    await yieldToMain();
    signal?.throwIfAborted();
    sliceStarted = performance.now();
  };

  return {
    async push(samples: Float32Array): Promise<boolean> {
      signal?.throwIfAborted();
      if (!started) {
        started = true;
        // The new asset and its analyzing status can paint before the first FFT.
        await yieldAnalysis();
      }
      for (let offset = 0; offset < samples.length; offset += CHUNK_SAMPLES) {
        signal?.throwIfAborted();
        if (builder.push(samples.subarray(offset, offset + CHUNK_SAMPLES))) return true;
        if (performance.now() - sliceStarted >= TIME_SLICE_MS) await yieldAnalysis();
      }
      return false;
    },
    finish(): AudioVizGrid {
      signal?.throwIfAborted();
      return builder.finish();
    },
  };
}

/** Downmix in small batches, without allocating another episode-sized PCM buffer. */
export async function buildAudioVizGridAsync(
  channels: readonly Float32Array[],
  sampleRate: number,
  options: AudioVizAnalysisOptions = {},
): Promise<AudioVizGrid> {
  if (!channels.length || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error('Audio channels and a positive sample rate are required.');
  }
  const length = channels[0].length;
  if (channels.some((channel) => channel.length !== length)) {
    throw new Error('Audio channels must have equal lengths.');
  }
  options.signal?.throwIfAborted();
  const builder = createAsyncAudioVizGridBuilder(sampleRate, options);
  const mono = channels.length > 1 ? new Float32Array(CHUNK_SAMPLES) : null;
  const limit = Math.min(length, Math.ceil(sampleRate * AUDIO_VIZ_MAX_DURATION));
  for (let offset = 0; offset < limit; offset += CHUNK_SAMPLES) {
    const end = Math.min(limit, offset + CHUNK_SAMPLES);
    let samples: Float32Array;
    if (mono) {
      samples = mono.subarray(0, end - offset);
      for (let index = 0; index < samples.length; index += 1) {
        let total = 0;
        for (const channel of channels) {
          const value = channel[offset + index];
          total += Number.isFinite(value) ? value : 0;
        }
        samples[index] = total / channels.length;
      }
    } else {
      samples = channels[0].subarray(offset, end);
    }
    if (await builder.push(samples)) break;
  }
  return builder.finish();
}
