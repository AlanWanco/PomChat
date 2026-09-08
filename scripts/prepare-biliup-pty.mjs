// node-pty's published macOS spawn-helper may not carry its executable bit.
// Fix it before packaging/signing, not inside an installed application bundle.
import { chmodSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve('node-pty/package.json'));
if (process.platform !== 'win32') {
  for (const relative of ['build/Release/spawn-helper', 'build/Debug/spawn-helper', 'prebuilds/darwin-arm64/spawn-helper', 'prebuilds/darwin-x64/spawn-helper', 'prebuilds/linux-arm64/spawn-helper', 'prebuilds/linux-x64/spawn-helper']) {
    const file = path.join(root, relative);
    if (existsSync(file)) chmodSync(file, 0o755);
  }
}
