import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { AUDIO_VIZ_SAMPLE_RATE, createAudioVizGridBuilder, encodeAudioVizGrid, type AudioVizGrid } from '../src/remotion/audioVizGrid';

/** Audio decoding is bounded so a stalled or huge input cannot run away. */
const FFMPEG_TIMEOUT_MS = 10 * 60_000;
/** Longest input the analysis reads; beyond this the grid simply stops. */
const ANALYSIS_LIMIT_HOURS = 2;

const createTimeout = (ffmpeg: ReturnType<typeof spawn>, reject: (error: Error) => void) => setTimeout(() => {
  ffmpeg.kill('SIGKILL');
  reject(new Error('Audio analysis timed out.'));
}, FFMPEG_TIMEOUT_MS);

/** Locate the PCM payload inside a streaming WAV header, or -1 while it is incomplete. */
const findWavDataOffset = (buffer: Buffer): number => {
  if (buffer.length < 12) return -1;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('FFmpeg returned an invalid WAV stream.');
  }
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'data') return offset + 8;
    if (chunkSize === 0xffffffff || chunkSize === 0) return -1;
    const next = offset + 8 + chunkSize + (chunkSize % 2);
    if (next <= offset || next > buffer.length) return -1;
    offset = next;
  }
  return -1;
};

/**
 * Convert a streamed 16-bit mono WAV into float samples. The bundled FFmpeg build
 * only offers container output, so the header is parsed instead of skipped blindly.
 */
const createWavSampleReader = (onSamples: (samples: Float32Array) => void) => {
  let headerBuffer = Buffer.alloc(0);
  let headerDone = false;
  let tail: Uint8Array = new Uint8Array(0);
  return (chunk: Buffer) => {
    let payload: Buffer;
    if (headerDone) {
      payload = chunk;
    } else {
      headerBuffer = Buffer.concat([headerBuffer, chunk]);
      const dataOffset = findWavDataOffset(headerBuffer);
      if (dataOffset < 0) {
        if (headerBuffer.length > 256 * 1024) throw new Error('FFmpeg returned an unreadable WAV header.');
        return;
      }
      headerDone = true;
      payload = headerBuffer.subarray(dataOffset);
      headerBuffer = Buffer.alloc(0);
    }

    const data: Buffer = tail.length ? Buffer.concat([Buffer.from(tail), payload]) : payload;
    const usable = data.length - (data.length % 2);
    tail = usable === data.length ? new Uint8Array(0) : new Uint8Array(data.subarray(usable));
    const sampleCount = usable / 2;
    if (!sampleCount) return;
    const samples = new Float32Array(sampleCount);
    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] = data.readInt16LE(index * 2) / 32768;
    }
    onSamples(samples);
  };
};

/**
 * Stream mono PCM out of FFmpeg and into a compact analysis grid.
 * The PCM is never buffered as a whole, so long episodes stay cheap.
 */
export function buildAudioVizGridFromAudio(ffmpegPath: string, inputPath: string, signal?: AbortSignal): Promise<AudioVizGrid> {
  return new Promise<AudioVizGrid>((resolve, reject) => {
    if (typeof inputPath !== 'string' || !inputPath.trim()) {
      reject(new Error('An audio path is required for analysis.'));
      return;
    }

    const builder = createAudioVizGridBuilder(AUDIO_VIZ_SAMPLE_RATE);
    const ffmpeg = spawn(ffmpegPath, [
      '-hide_banner',
      '-loglevel', 'error',
      '-nostdin',
      '-i', inputPath,
      '-map', '0:a:0',
      '-vn',
      '-ac', '1',
      '-ar', String(AUDIO_VIZ_SAMPLE_RATE),
      '-c:a', 'pcm_s16le',
      '-f', 'wav',
      'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    let settled = false;
    const timeout = createTimeout(ffmpeg, (error) => finish(() => reject(error)));

    const detach = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    };

    function onAbort() {
      ffmpeg.kill('SIGKILL');
      finish(() => reject(new Error('Audio analysis was cancelled.')));
    }

    function finish(callback: () => void) {
      if (settled) return;
      settled = true;
      detach();
      callback();
    }

    signal?.addEventListener('abort', onAbort, { once: true });

    ffmpeg.once('error', () => {
      finish(() => reject(new Error('Unable to start FFmpeg for audio analysis.')));
    });

    const readSamples = createWavSampleReader((samples) => {
      try {
        builder.push(samples);
      } catch (error) {
        ffmpeg.kill('SIGKILL');
        finish(() => reject(error instanceof Error ? error : new Error('Audio analysis failed.')));
      }
    });

    ffmpeg.stdout?.on('data', (chunk: Buffer) => {
      try {
        readSamples(chunk);
      } catch (error) {
        ffmpeg.kill('SIGKILL');
        finish(() => reject(error instanceof Error ? error : new Error('Audio analysis failed.')));
      }
    });

    ffmpeg.once('close', (code) => {
      finish(() => {
        if (code !== 0) {
          reject(new Error('FFmpeg could not decode this audio for analysis.'));
          return;
        }
        try {
          resolve(builder.finish());
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Audio analysis failed.'));
        }
      });
    });
  });
}

export function encodeAudioVizGridForIpc(grid: AudioVizGrid): Uint8Array {
  return new Uint8Array(encodeAudioVizGrid(grid));
}

/** Analysis is reused while the audio file itself does not change. */
const gridCache = new Map<string, { key: string; grid: AudioVizGrid }>();
const gridPending = new Map<string, Promise<AudioVizGrid>>();
const MAX_CACHED_GRIDS = 3;

const getGridCacheKey = (source: string) => {
  try {
    const stat = fs.statSync(source);
    return `${source}|${stat.mtimeMs}|${stat.size}`;
  } catch {
    return source;
  }
};

/** Cached, de-duplicated analysis of one audio source. */
export function getAudioVizGrid(ffmpegPath: string, source: string): Promise<AudioVizGrid> {
  const key = getGridCacheKey(source);
  const cached = gridCache.get(source);
  if (cached?.key === key) {
    gridCache.delete(source);
    gridCache.set(source, cached);
    return Promise.resolve(cached.grid);
  }

  const pending = gridPending.get(source);
  if (pending) return pending;

  const task = buildAudioVizGridFromAudio(ffmpegPath, source)
    .then((grid) => {
      gridCache.set(source, { key, grid });
      while (gridCache.size > MAX_CACHED_GRIDS) {
        gridCache.delete(gridCache.keys().next().value!);
      }
      return grid;
    })
    .finally(() => {
      gridPending.delete(source);
    });
  gridPending.set(source, task);
  return task;
}

/** Write the analysis next to the export so the Remotion worker can serve it. */
export async function writeAudioVizGridFile(ffmpegPath: string, source: string, directory: string): Promise<string> {
  const grid = await getAudioVizGrid(ffmpegPath, source);
  const filePath = path.join(directory, `pomchat-audio-viz-${process.pid}-${Date.now()}.bin`);
  await fs.promises.writeFile(filePath, Buffer.from(encodeAudioVizGrid(grid)));
  return filePath;
}

export const AUDIO_VIZ_ANALYSIS_LIMIT_SECONDS = ANALYSIS_LIMIT_HOURS * 60 * 60;
