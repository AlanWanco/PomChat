const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { fileURLToPath } = require('node:url');

let cachedBundle = null;
let cachedPatchedBinariesDir = null;

const resolveAppFilePath = (filePath) => {
  if (!filePath) {
    return filePath;
  }

  const normalized = filePath.replace(/\\/g, '/');
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
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
};

const createLocalMediaServer = async () => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
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

const prepareInputProps = (config, mediaServer) => {
  const speakers = Object.fromEntries(
    Object.entries(config.speakers || {}).map(([key, speaker]) => [
      key,
      {
        ...speaker,
        avatar: toMediaUrl(speaker.avatar, mediaServer),
      },
    ]),
  );

  return {
    ...config,
    audioPath: toMediaUrl(config.audioPath, mediaServer),
    background: {
      ...config.background,
      image: toMediaUrl(config.background?.image, mediaServer),
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
  const marker = path.join(targetDir, '.patched');

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

    fs.writeFileSync(marker, 'ok');
  }

  cachedPatchedBinariesDir = targetDir;
  return cachedPatchedBinariesDir;
};

const getBundle = async (bundleFn) => {
  if (!cachedBundle) {
    const entryPoint = path.join(process.env.APP_ROOT || process.cwd(), 'src/remotion/Root.tsx');
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

  try {
    const inputProps = prepareInputProps(config, mediaServer);
    const durationSeconds = Math.max(0.1, inputProps.exportRange.end - inputProps.exportRange.start);

  const sendProgress = (progress, stage) => {
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

    sendProgress(0.02, 'Bundling Remotion composition');
    const serveUrl = await getBundle(bundle);

    sendProgress(0.12, 'Resolving composition');
    const composition = await selectComposition({
      serveUrl,
      id: 'PodchatRender',
      inputProps,
      logLevel: 'error',
      binariesDirectory,
      chromiumOptions: {
        disableWebSecurity: true,
        gl: 'angle',
      },
    });

    sendProgress(0.2, 'Rendering frames');
     await renderMedia({
      serveUrl,
      composition,
      codec: 'h264',
      audioCodec: 'aac',
      outputLocation: config.outputPath,
      inputProps,
      overwrite: true,
      logLevel: 'error',
      concurrency: getRenderConcurrency(),
      imageFormat: 'jpeg',
      jpegQuality: 92,
      x264Preset: config.x264Preset || 'veryfast',
      crf: config.crf || 20,
      pixelFormat: 'yuv420p',
      binariesDirectory,
      chromiumOptions: {
        disableWebSecurity: true,
        gl: 'angle',
      },
      hardwareAcceleration: 'if-possible',
      onProgress: ({ progress }) => {
        sendProgress(0.2 + progress * 0.78, progress >= 1 ? 'Finalizing video' : 'Rendering frames');
      },
    });

    const elapsedMs = Date.now() - startedAt;
    const realTimeFactor = elapsedMs / (durationSeconds * 1000);
    sendProgress(1, 'Done');
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
