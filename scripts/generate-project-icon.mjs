// Regenerate on macOS with `brew install imagemagick librsvg`.
// Uses the existing application artwork; no dependencies are added to the app.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'build');
const temporary = mkdtempSync(path.join(tmpdir(), 'pomchat-document-icon-'));
const run = (command, args) => execFileSync(command, args, { stdio: 'pipe' });

try {
  mkdirSync(output, { recursive: true });
  const logoPath = path.join(temporary, 'logo.png');
  run('magick', [path.join(root, 'podchat-icon.png'), '-resize', '640x640', logoPath]);
  const logo = readFileSync(logoPath).toString('base64');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024">
  <title>PomChat project document</title>
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#f1f5f9"/>
    </linearGradient>
    <linearGradient id="fold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e2e8f0"/>
      <stop offset="1" stop-color="#cbd5e1"/>
    </linearGradient>
  </defs>
  <path d="M350 96 H786 Q844 96 844 154 V878 Q844 936 786 936 H238 Q180 936 180 878 V266 Z" fill="#0f172a" opacity="0.12" transform="translate(0 14)"/>
  <path d="M350 80 H786 Q844 80 844 138 V862 Q844 920 786 920 H238 Q180 920 180 862 V250 Z" fill="url(#paper)" stroke="#94a3b8" stroke-width="18" stroke-linejoin="round"/>
  <path d="M180 250 H318 Q350 250 350 218 V80 Z" fill="url(#fold)" stroke="#94a3b8" stroke-width="18" stroke-linejoin="round"/>
  <image x="252" y="322" width="520" height="520" xlink:href="data:image/png;base64,${logo}"/>
</svg>
`;
  const svgPath = path.join(output, 'pomchat-document.svg');
  const pngPath = path.join(output, 'pomchat-document.png');
  writeFileSync(svgPath, svg);
  run('rsvg-convert', ['--width', '1024', '--height', '1024', '--output', pngPath, svgPath]);
  run('magick', [pngPath, '-define', 'icon:auto-resize=256,128,64,48,32,24,16', path.join(output, 'pomchat-document.ico')]);

  if (process.platform === 'darwin') {
    const iconset = path.join(temporary, 'document.iconset');
    mkdirSync(iconset);
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        const name = `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`;
        run('magick', [pngPath, '-resize', `${size * scale}x${size * scale}`, path.join(iconset, name)]);
      }
    }
    run('iconutil', ['-c', 'icns', iconset, '-o', path.join(output, 'pomchat-document.icns')]);
  }
  console.log('Generated build/pomchat-document.{svg,png,ico} (and .icns on macOS)');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
