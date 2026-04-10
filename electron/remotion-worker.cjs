const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { fileURLToPath } = require('node:url');

let cachedBundle = null;
let cachedPatchedBinariesDir = null;

const getBundledBrowserExecutable = () => {
  const manifestPaths = [
    process.resourcesPath ? path.join(process.resourcesPath, 'remotion-browser', 'manifest.json') : null,
    path.join(process.env.APP_ROOT || process.cwd(), 'build', 'remotion-browser', 'manifest.json'),
  ].filter(Boolean);

  for (const manifestPath of manifestPaths) {
    try {
      if (!fs.existsSync(manifestPath)) {
        continue;
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const executablePath = path.join(
        path.dirname(manifestPath),
        manifest.bundleDir || '',
        ...(typeof manifest.executableSubpath === 'string' ? manifest.executableSubpath.split('/') : []),
      );

      if (fs.existsSync(executablePath)) {
        return executablePath;
      }
    } catch (error) {
      console.warn('Failed to resolve bundled Remotion browser:', error);
    }
  }

  return null;
};

const resolveAppFilePath = (filePath) => {
  if (!filePath) {
    return filePath;
  }

  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.startsWith('/@fs/')) {
    const fsPath = normalized.slice('/@fs'.length);
    try {
      return decodeURIComponent(fsPath);
    } catch (_error) {
      return fsPath;
    }
  }

  if (normalized.startsWith('/projects/') || normalized.startsWith('projects/')) {
    return path.join(process.env.VITE_PUBLIC || process.env.APP_ROOT || process.cwd(), normalized.replace(/^\//, ''));
  }

  return filePath;
};

const getContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp3':
      return 'audio/mpeg';
    case '.aac':
      return 'audio/aac';
    case '.m4a':
      return 'audio/mp4';
    case '.wav':
      return 'audio/wav';
    case '.flac':
      return 'audio/flac';
    case '.mp4':
      return 'video/mp4';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
};

const getAvatarGifTranscodeDir = () => {
  const dir = path.join(os.homedir(), '.config', 'pomchat', 'cache', 'avatar-gif-transcodes');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const resolveLocalMediaPath = (value) => {
  if (!value) return null;
  if (/^file:/i.test(value)) {
    try {
      return fileURLToPath(value);
    } catch (_error) {
      return null;
    }
  }
  if (/^(https?:|data:)/i.test(value)) {
    return null;
  }
  const resolved = resolveAppFilePath(value);
  return path.isAbsolute(resolved) ? resolved : null;
};

const resolveFfmpegBinary = (binariesDirectory) => {
  const ffmpegName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  if (binariesDirectory) {
    const bundled = path.join(binariesDirectory, ffmpegName);
    if (fs.existsSync(bundled)) {
      return bundled;
    }
  }
  return ffmpegName;
};

const transcodeGifAvatarToMp4 = (gifPath, binariesDirectory) => {
  if (!gifPath || path.extname(gifPath).toLowerCase() !== '.gif' || !fs.existsSync(gifPath)) {
    return gifPath;
  }

  const stat = fs.statSync(gifPath);
  const hash = crypto.createHash('sha1').update(`${gifPath}:${stat.size}:${stat.mtimeMs}`).digest('hex');
  const outputPath = path.join(getAvatarGifTranscodeDir(), `${hash}.mp4`);
  if (fs.existsSync(outputPath)) {
    return outputPath;
  }

  try {
    execFileSync(resolveFfmpegBinary(binariesDirectory), [
      '-y',
      '-i', gifPath,
      '-movflags', '+faststart',
      '-pix_fmt', 'yuv420p',
      '-vf', 'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2',
      outputPath,
    ], { stdio: 'ignore' });
    return outputPath;
  } catch (_error) {
    return gifPath;
  }
};

const createLocalMediaServer = async () => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      });
      res.end();
      return;
    }

    if (url.pathname !== '/media') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const requestedPath = url.searchParams.get('path');
    if (!requestedPath) {
      res.writeHead(400);
      res.end('Missing path');
      return;
    }

    const resolvedPath = resolveAppFilePath(requestedPath);
    const stream = fs.createReadStream(resolvedPath);
    stream.on('open', () => {
      res.writeHead(200, {
        'Content-Type': getContentType(resolvedPath),
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      });
    });
    stream.on('error', () => {
      res.writeHead(404);
      res.end('Not found');
    });
    stream.pipe(res);
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not start local media server');
  }

  return {
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    urlForPath: (filePath) => `http://127.0.0.1:${address.port}/media?path=${encodeURIComponent(filePath)}`,
  };
};

const toMediaUrl = (value, mediaServer) => {
  if (!value) {
    return '';
  }

  if (/^file:/i.test(value)) {
    try {
      return mediaServer.urlForPath(fileURLToPath(value));
    } catch (_error) {
      return value;
    }
  }

  if (/^(https?:|data:)/i.test(value)) {
    return value;
  }

  const resolved = resolveAppFilePath(value);
  if (path.isAbsolute(resolved)) {
    return mediaServer.urlForPath(resolved);
  }

  return resolved;
};

const estimateRemainingMs = (elapsedMs, progress) => {
  if (progress <= 0 || progress >= 1) {
    return null;
  }

  return Math.max(0, Math.round(elapsedMs * ((1 - progress) / progress)));
};

const sendMessage = (message) => {
  if (typeof process.send === 'function') {
    process.send(message);
  }
};

const prepareInputProps = (config, mediaServer, binariesDirectory) => {
  const speakers = Object.fromEntries(
    Object.entries(config.speakers || {}).map(([key, speaker]) => [
      key,
      {
        ...speaker,
        avatar: (() => {
          const localPath = resolveLocalMediaPath(speaker.avatar);
          const mediaPath = transcodeGifAvatarToMp4(localPath, binariesDirectory);
          if (mediaPath && path.isAbsolute(mediaPath)) {
            return mediaServer.urlForPath(mediaPath);
          }
          return toMediaUrl(speaker.avatar, mediaServer);
        })(),
      },
    ]),
  );

  return {
    ...config,
    audioPath: toMediaUrl(config.audioPath, mediaServer),
    background: {
      ...config.background,
      image: toMediaUrl(config.background?.image, mediaServer),
      slides: Array.isArray(config.background?.slides)
        ? config.background.slides.map((slide) => ({
            ...slide,
            image: toMediaUrl(slide?.image, mediaServer),
          }))
        : [],
    },
    speakers,
  };
};

const getRenderConcurrency = () => {
  const cpuCount = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  return Math.max(2, Math.min(8, cpuCount - 1));
};

const patchMacCompositorBinaries = () => {
  if (process.platform !== 'darwin') {
    return null;
  }

  if (cachedPatchedBinariesDir) {
    return cachedPatchedBinariesDir;
  }

  const compositorPkgName = process.arch === 'arm64'
    ? '@remotion/compositor-darwin-arm64/package.json'
    : '@remotion/compositor-darwin-x64/package.json';
  const pkgJsonPath = require.resolve(compositorPkgName);
  const sourceDir = path.dirname(pkgJsonPath);
  const hash = crypto.createHash('sha1').update(sourceDir).digest('hex').slice(0, 8);
  const targetDir = path.join(os.tmpdir(), `pomchat-remotion-bin-${process.arch}-${hash}`);
  const marker = path.join(targetDir, '.patched-v2');

  if (!fs.existsSync(marker)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.cpSync(sourceDir, targetDir, { recursive: true });

    const dylibs = fs.readdirSync(targetDir).filter((name) => name.endsWith('.dylib'));
    const patchTarget = (filePath) => {
      dylibs.forEach((libName) => {
        execFileSync('install_name_tool', ['-change', libName, `@loader_path/${libName}`, filePath]);
      });
    };

    dylibs.forEach((libName) => {
      const dylibPath = path.join(targetDir, libName);
      execFileSync('install_name_tool', ['-id', `@loader_path/${libName}`, dylibPath]);
      patchTarget(dylibPath);
    });

    ['ffmpeg', 'ffprobe', 'remotion'].forEach((binary) => {
      const binaryPath = path.join(targetDir, binary);
      patchTarget(binaryPath);
    });

    const signTarget = (filePath) => {
      execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', filePath]);
    };

    dylibs.forEach((libName) => {
      signTarget(path.join(targetDir, libName));
    });
    ['ffmpeg', 'ffprobe', 'remotion'].forEach((binary) => {
      signTarget(path.join(targetDir, binary));
    });

    fs.writeFileSync(marker, 'ok');
  }

  cachedPatchedBinariesDir = targetDir;
  return cachedPatchedBinariesDir;
};

const getBundle = async (bundleFn) => {
  if (!cachedBundle) {
    const root = process.env.APP_ROOT || process.cwd();
    const candidates = [
      // asar unpacked paths (priority when asar: true)
      process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'src/remotion/Root.tsx') : null,
      path.join(root, 'app.asar.unpacked', 'src/remotion/Root.tsx'),
      // direct paths (dev mode or asar: false)
      path.join(root, 'src/remotion/Root.tsx'),
      process.resourcesPath ? path.join(process.resourcesPath, 'app', 'src/remotion/Root.tsx') : null,
    ].filter(Boolean);

    const entryPoint = candidates.find((candidate) => fs.existsSync(candidate));
    if (!entryPoint) {
      throw new Error(`Remotion entry not found. Tried: ${candidates.join(', ')}`);
    }

    cachedBundle = bundleFn({
      entryPoint,
      onProgress: () => undefined,
    });
  }

  return cachedBundle;
};

const runRender = async (config) => {
  const startedAt = Date.now();
  const { bundle } = await import('@remotion/bundler');
  const { renderMedia, selectComposition } = await import('@remotion/renderer');
  const mediaServer = await createLocalMediaServer();
  const binariesDirectory = patchMacCompositorBinaries();
  const browserExecutable = getBundledBrowserExecutable();
  const resolveHardwareStrategy = () => {
    const mode = config.exportHardware || 'auto';

    if (mode === 'cpu') {
      return {
        hardwareAcceleration: 'disable',
        gl: 'swiftshader',
      };
    }

    if (mode === 'gpu') {
      if (process.platform === 'win32') {
        // Remotion h264 on Windows does not support "required".
        // Keep GPU preference but allow fallback.
        return { hardwareAcceleration: 'if-possible', gl: 'angle' };
      }
      if (process.platform === 'darwin') {
        return { hardwareAcceleration: 'if-possible', gl: 'angle' };
      }
      return { hardwareAcceleration: 'if-possible', gl: 'angle' };
    }

    // Auto mode: platform-aware defaults
    if (process.platform === 'darwin') {
      return { hardwareAcceleration: 'disable', gl: 'swiftshader' };
    }
    if (process.platform === 'win32') {
      return { hardwareAcceleration: 'if-possible', gl: 'angle' };
    }
    return { hardwareAcceleration: 'if-possible', gl: 'angle' };
  };

  const hardwareStrategy = resolveHardwareStrategy();
  const cpuFallbackStrategy = { hardwareAcceleration: 'disable', gl: 'swiftshader' };
  const isHardwareAccelerationError = (error) => {
    const message = (error && error.message ? error.message : '').toLowerCase();
    return (
      message.includes('hardware acceleration') ||
      message.includes('gpu process') ||
      message.includes('angle') ||
      message.includes('swiftshader')
    );
  };

  try {
    const inputProps = prepareInputProps(config, mediaServer, binariesDirectory);
    const exportFormat = config.exportFormat === 'mov-alpha' || config.exportFormat === 'webm-alpha' ? config.exportFormat : 'mp4';
    const isMovAlpha = exportFormat === 'mov-alpha';
    const isWebmAlpha = exportFormat === 'webm-alpha';
    const isAlphaExport = isMovAlpha || isWebmAlpha;
    const renderCodec = isMovAlpha ? 'prores' : isWebmAlpha ? 'vp8' : 'h264';
    const renderAudioCodec = isMovAlpha ? null : isWebmAlpha ? 'opus' : 'aac';
    const renderPixelFormat = isMovAlpha ? 'yuva444p10le' : isWebmAlpha ? 'yuva420p' : 'yuv420p';
    const renderImageFormat = isAlphaExport ? 'png' : 'jpeg';
    const renderJpegQuality = isAlphaExport ? undefined : 92;

    inputProps.transparentBackground = isAlphaExport;
    if (isAlphaExport) {
      inputProps.background = {
        ...(inputProps.background || {}),
        image: '',
        blur: 0,
        brightness: 1,
      };
    }
    const durationSeconds = Math.max(0.1, inputProps.exportRange.end - inputProps.exportRange.start);

    let lastProgressSentAt = 0;
    let lastProgressValue = -1;
    let lastStage = '';

  const sendProgress = (progress, stage, force = false) => {
    const now = Date.now();
    const progressChanged = Math.abs(progress - lastProgressValue) >= 0.02;
    const stageChanged = stage !== lastStage;
    const intervalPassed = now - lastProgressSentAt >= 160;
    if (!force && !progressChanged && !stageChanged && !intervalPassed) {
      return;
    }

    lastProgressSentAt = now;
    lastProgressValue = progress;
    lastStage = stage;
    const elapsedMs = Date.now() - startedAt;
    sendMessage({
      type: 'progress',
      payload: {
        progress,
        elapsedMs,
        estimatedRemainingMs: estimateRemainingMs(elapsedMs, progress),
        stage,
      },
    });
  };

    sendProgress(0.02, 'Bundling Remotion composition', true);
    const serveUrl = await getBundle(bundle);

    const renderOnce = async (strategy) => {
      sendProgress(0.12, 'Resolving composition');
      const composition = await selectComposition({
        serveUrl,
        id: 'PodchatRender',
        inputProps,
        logLevel: 'error',
        binariesDirectory,
        browserExecutable,
        chromiumOptions: {
          disableWebSecurity: true,
          gl: strategy.gl,
          hardwareAcceleration: strategy.hardwareAcceleration,
        },
      });

      sendProgress(0.2, 'Frame-by-frame rendering');
      const qualityOptions = strategy.hardwareAcceleration === 'disable' && !isAlphaExport
        ? {
            x264Preset: config.x264Preset || 'veryfast',
            crf: config.crf || 20,
          }
        : {};

      await renderMedia({
        serveUrl,
        composition,
        codec: renderCodec,
        proResProfile: isMovAlpha ? '4444' : undefined,
        audioCodec: renderAudioCodec,
        outputLocation: config.outputPath,
        inputProps,
        overwrite: true,
        logLevel: 'error',
        concurrency: getRenderConcurrency(),
        imageFormat: renderImageFormat,
        jpegQuality: renderJpegQuality,
        ...qualityOptions,
        pixelFormat: renderPixelFormat,
        binariesDirectory,
        browserExecutable,
        chromiumOptions: {
          disableWebSecurity: true,
          gl: strategy.gl,
          hardwareAcceleration: strategy.hardwareAcceleration,
        },
        hardwareAcceleration: isAlphaExport ? 'disable' : strategy.hardwareAcceleration,
        onProgress: ({ progress, stitchStage, renderedFrames, encodedFrames }) => {
          const normalized = Math.max(0, Math.min(1, progress || 0));
          const totalFrames = Math.max(1, composition.durationInFrames || 1);
          const renderedRatio = Math.max(0, Math.min(1, (renderedFrames || 0) / totalFrames));
          const encodedRatio = Math.max(0, Math.min(1, (encodedFrames || 0) / totalFrames));

          let stage = 'Frame-by-frame rendering';
          // Use normalized progress as baseline to avoid long stalls
          // when encodedFrames updates are sparse on some platforms.
          let weightedProgress = 0.2 + Math.max(renderedRatio, normalized * 0.55) * 0.35;

          if (stitchStage === 'encoding') {
            stage = isMovAlpha ? 'Encoding MOV alpha (FFmpeg)' : isWebmAlpha ? 'Encoding WebM alpha (FFmpeg)' : 'Encoding video (FFmpeg)';
            weightedProgress = 0.55 + Math.max(encodedRatio, normalized) * 0.4;
          } else if (stitchStage === 'muxing') {
            stage = 'Muxing audio/video';
            weightedProgress = 0.95 + normalized * 0.03;
          } else if (normalized >= 0.99) {
            stage = 'Finalizing video';
            weightedProgress = 0.98;
          }

          sendProgress(Math.max(0.2, Math.min(0.99, weightedProgress)), stage);
        },
      });

      return composition;
    };

    let composition;
    let usedStrategy = hardwareStrategy;
    try {
      composition = await renderOnce(usedStrategy);
    } catch (error) {
      if (usedStrategy.hardwareAcceleration !== 'disable' && isHardwareAccelerationError(error)) {
        console.warn('GPU strategy failed, retrying CPU fallback:', error && error.message ? error.message : error);
        sendProgress(0.15, 'GPU unavailable, retrying with CPU');
        usedStrategy = cpuFallbackStrategy;
        composition = await renderOnce(usedStrategy);
      } else {
        throw error;
      }
    }

    const elapsedMs = Date.now() - startedAt;
    const realTimeFactor = elapsedMs / (durationSeconds * 1000);
    sendProgress(1, 'Done', true);
    sendMessage({
      type: 'result',
      payload: {
        success: true,
        outputPath: config.outputPath,
        elapsedMs,
        realTimeFactor,
        message: `Exported ${composition.width}x${composition.height} @ ${composition.fps}fps in ${(elapsedMs / 1000).toFixed(2)}s (${realTimeFactor.toFixed(2)}x realtime)`,
      },
    });
  } finally {
    await mediaServer.close();
  }
};

process.on('message', (message) => {
  if (!message || message.type !== 'render' || !message.payload) {
    return;
  }

  runRender(message.payload).catch((error) => {
    const errorMessage = error && error.message ? error.message : 'Unknown export error';
    const stack = error && error.stack ? error.stack : '';
    console.error('Export error:', errorMessage, stack);
    
    sendMessage({
      type: 'error',
      payload: {
        message: errorMessage,
      },
    });
  });
});
