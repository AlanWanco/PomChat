import { spawn } from 'node:child_process';

const SAMPLE_RATE = 1024;
const MAX_WAVEFORM_WAV_BYTES = 32 * 1024 * 1024;
const FFMPEG_TIMEOUT_MS = 60_000;

export function parsePcm16WavSamples(input: Uint8Array): Float32Array {
  const wav = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('FFmpeg returned an invalid WAV stream.');
  }

  let audioFormat = 0;
  let channelCount = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataLength = 0;

  for (let offset = 12; offset + 8 <= wav.length;) {
    const chunkId = wav.toString('ascii', offset, offset + 4);
    const chunkSize = wav.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;

    if (chunkId === 'fmt ' && chunkSize >= 16 && chunkDataOffset + 16 <= wav.length) {
      audioFormat = wav.readUInt16LE(chunkDataOffset);
      channelCount = wav.readUInt16LE(chunkDataOffset + 2);
      bitsPerSample = wav.readUInt16LE(chunkDataOffset + 14);
    } else if (chunkId === 'data') {
      dataOffset = chunkDataOffset;
      dataLength = chunkSize === 0xffffffff
        ? wav.length - chunkDataOffset
        : Math.min(chunkSize, wav.length - chunkDataOffset);
      break;
    }

    if (chunkSize === 0xffffffff) break;
    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (audioFormat !== 1 || channelCount !== 1 || bitsPerSample !== 16 || dataOffset < 0) {
    throw new Error('FFmpeg returned an unsupported WAV format.');
  }

  const sampleCount = Math.floor(dataLength / 2);
  if (sampleCount === 0) {
    throw new Error('FFmpeg returned an empty WAV stream.');
  }

  const samples = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = wav.readInt16LE(dataOffset + index * 2) / 32768;
  }

  return samples;
}

export function decodeAudioWaveform(ffmpegPath: string, inputPath: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, [
      '-hide_banner',
      '-loglevel', 'error',
      '-nostdin',
      '-i', inputPath,
      '-map', '0:a:0',
      '-vn',
      '-ac', '1',
      '-ar', String(SAMPLE_RATE),
      '-c:a', 'pcm_s16le',
      '-f', 'wav',
      'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    const chunks: Buffer[] = [];
    let outputLength = 0;
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };

    const timeout = setTimeout(() => {
      ffmpeg.kill('SIGKILL');
      finish(() => reject(new Error('Audio waveform decoding timed out.')));
    }, FFMPEG_TIMEOUT_MS);

    ffmpeg.once('error', () => {
      finish(() => reject(new Error('Unable to start FFmpeg for waveform decoding.')));
    });

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      outputLength += chunk.length;
      if (outputLength > MAX_WAVEFORM_WAV_BYTES) {
        ffmpeg.kill('SIGKILL');
        finish(() => reject(new Error('Audio is too long to generate waveform data.')));
        return;
      }
      chunks.push(chunk);
    });

    ffmpeg.once('close', (code) => {
      finish(() => {
        if (code !== 0) {
          reject(new Error('FFmpeg could not decode audio for the waveform.'));
          return;
        }

        try {
          resolve(parsePcm16WavSamples(Buffer.concat(chunks, outputLength)));
        } catch (error) {
          reject(error);
        }
      });
    });
  });
}
