import fs from 'node:fs';
import path from 'node:path';
import { ensureBrowser } from '@remotion/renderer';

const outputRoot = path.join(process.cwd(), 'build', 'remotion-browser');

const main = async () => {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });

  const status = await ensureBrowser({
    chromeMode: 'headless-shell',
    logLevel: 'error',
  });

  if (!status || typeof status.path !== 'string' || !status.path) {
    throw new Error('Failed to resolve Remotion browser executable');
  }

  const executablePath = path.resolve(status.path);
  const executableDir = path.dirname(executablePath);
  const bundleDir = `${process.platform}-${process.arch}`;
  const targetDir = path.join(outputRoot, bundleDir);

  fs.cpSync(executableDir, targetDir, { recursive: true, force: true });

  const manifest = {
    platform: process.platform,
    arch: process.arch,
    chromeMode: 'headless-shell',
    bundleDir,
    executableSubpath: path.relative(executableDir, executablePath).replace(/\\/g, '/'),
  };

  fs.writeFileSync(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Prepared offline Remotion browser: ${targetDir}`);
};

main().catch((error) => {
  console.error('Failed to prepare offline Remotion browser:', error);
  process.exitCode = 1;
});
