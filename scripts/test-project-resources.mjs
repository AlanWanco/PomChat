// node scripts/test-project-resources.mjs
// Executes the actual bounded App resource callbacks with synthetic IPC/filesystem stubs.
// No network access, real file copies, user configuration, or credentials.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const callbacks = [
  'collectProjectResources', 'resourceActionAvailability', 'updateConfigValueByPath',
  'handleCopyRemoteAssetsToProject', 'handleCopyLocalAssetsToProject', 'handleRefreshRemoteAssetCache',
];
const declarations = new Map();
let remoteEffect;
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && callbacks.includes(node.name.text)) {
    assert(!declarations.has(node.name.text), `Ambiguous callback: ${node.name.text}`);
    declarations.set(node.name.text, `const ${node.getText(ast)};`);
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'useEffect'
    && node.arguments[0]?.getText(ast).includes('const remoteResources = collectProjectResources(workingConfig)')) {
    assert(!remoteEffect, 'Remote cache effect must be unique');
    remoteEffect = node.arguments[0].getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(declarations.size, callbacks.length, 'All resource callbacks must be found');
assert(remoteEffect, 'Automatic remote cache effect must be found');
const dependencies = [
  't', 'config', 'fontPresets', 'subtitles', 'getCurrentConfigWithUi', 'projectPath', 'projectPathRef',
  'renderCacheInfo', 'getResolvedProjectAssetPath', 'isPathInsideDirectory', 'looksLikeLocalFsPath',
  'applyProjectResourceMigrationResult', 'captureProjectResourceOperation', 'importProjectAssetPath',
  'isProjectLifecycleCurrent', 'isProjectResourceOperationCurrent', 'projectResourceActionBusy',
  'showToast', 'setProjectResourceActionReport', 'setProjectResourceActionBusy', 'projectAssetsCacheEnabled',
  'setCachedRemoteAssets', 'cachedRemoteAssetsRef', 'setRenderCacheInfo', 'syncProjectResourceConfigState',
];
const temporary = mkdtempSync(path.join(tmpdir(), 'pomchat-resource-test-'));
const originalWindow = globalThis.window;
try {
  const outfile = path.join(temporary, 'resources.mjs');
  await build({
    stdin: {
      contents: `
        import { isProjectAssetResource } from './src/utils/projectResources';
        import { extractMarkdownImageLinks, replaceMarkdownImageLinkSrcAt } from './src/components/chat/SharedChatBubbles';
        const useCallback = (callback) => callback;
        const useMemo = (callback) => callback();
        export function createHarness(dependencies) {
          const { ${dependencies.join(', ')} } = dependencies;
          ${callbacks.map((name) => declarations.get(name)).join('\n')}
          const cacheRemoteResources = ${remoteEffect};
          return { ${callbacks.join(', ')}, cacheRemoteResources };
        }
      `,
      resolveDir: root, loader: 'tsx', sourcefile: 'project-resources-harness.tsx',
    },
    outfile, bundle: true, platform: 'node', format: 'esm',
  });
  const { createHarness } = await import(pathToFileURL(outfile).href);
  const fonts = {
    local: { name: 'Local Font', filePath: '/outside/font.ttf' },
    remote: { name: 'Remote Font', filePath: 'https://synthetic.invalid/font.woff2' },
    cached: { name: 'Cached Font', filePath: '/remote-cache/cached-font.otf' },
    relative: { name: 'Legacy Font', filePath: 'assets/legacy-font.ttf' },
  };
  const emptyProject = () => ({
    audioPath: '', assPath: '', background: { image: '', slides: [] }, speakers: {}, content: [],
    ui: { fontPresets: structuredClone(fonts) },
  });
  function setup(input) {
    const state = {
      config: structuredClone(input), imported: [], fetched: [], cached: {}, reports: [], busy: [],
      migrations: 0, synced: 0,
    };
    const projectPath = '/project/demo.pomchat';
    const renderCacheInfo = { remoteAssets: { path: '/remote-cache' }, presetAvatars: { path: '/preset-avatars' } };
    const noop = () => {};
    globalThis.window = { electron: {
      getRenderCacheInfo: async () => renderCacheInfo,
      cacheRemoteAsset: async (url) => {
        state.fetched.push(url);
        return `/remote-cache/${new URL(url).pathname.split('/').pop()}`;
      },
    } };
    const harness = createHarness({
      t: (key) => key, config: state.config, fontPresets: state.config.ui.fontPresets, subtitles: [],
      getCurrentConfigWithUi: () => state.config, projectPath, projectPathRef: { current: projectPath }, renderCacheInfo,
      getResolvedProjectAssetPath: (value) => value ? path.posix.resolve('/project', value) : '',
      isPathInsideDirectory: (value, directory) => value === directory || value.startsWith(`${directory}/`),
      looksLikeLocalFsPath: (value) => value.startsWith('/'),
      captureProjectResourceOperation: () => ({}),
      isProjectLifecycleCurrent: () => true, isProjectResourceOperationCurrent: () => true,
      projectResourceActionBusy: null, projectAssetsCacheEnabled: true,
      importProjectAssetPath: async (value) => {
        state.imported.push(value);
        const storedPath = `assets/${path.posix.basename(value)}`;
        return { storedPath, absolutePath: `/project/${storedPath}` };
      },
      applyProjectResourceMigrationResult: async (config) => {
        state.config = config;
        state.migrations++;
        return true;
      },
      syncProjectResourceConfigState: (config) => { state.config = config; state.synced++; },
      setProjectResourceActionReport: (report) => state.reports.push(report),
      setProjectResourceActionBusy: (busy) => state.busy.push(busy),
      showToast: noop,
      cachedRemoteAssetsRef: { current: {} },
      setCachedRemoteAssets: (update) => { state.cached = update(state.cached); },
      setRenderCacheInfo: noop,
    });
    return { harness, state };
  }
  function assertFontsUnchanged(state) {
    assert.deepEqual(state.config.ui.fontPresets, fonts, 'Migration must never rewrite global font references');
    assert(!state.imported.some((value) => /font\.(ttf|otf|woff2)$/.test(value)), 'Fonts must never enter project asset IPC');
  }
  const onlyFonts = setup(emptyProject());
  assert.equal(onlyFonts.harness.collectProjectResources(onlyFonts.state.config).length, 4, 'Fonts still participate in missing-resource inspection');
  assert.deepEqual(onlyFonts.harness.resourceActionAvailability, {
    copyRemoteAssetsCount: 0, copyLocalAssetsCount: 0, refreshRemoteAssetCacheCount: 1,
  }, 'Global fonts do not increase copy badges, but remote font cache can still be refreshed');
  await onlyFonts.harness.handleCopyLocalAssetsToProject();
  await onlyFonts.harness.handleCopyRemoteAssetsToProject();
  assert.deepEqual(onlyFonts.state.imported, []);
  assert.equal(onlyFonts.state.migrations, 0, 'A font-only project is a no-op for both copy actions');
  assertFontsUnchanged(onlyFonts.state);
  console.log('PASS 字体专属项目：本地/远程复制数量为零，检查仍保留字体，不触发复制');

  const mixed = emptyProject();
  mixed.audioPath = '/outside/audio.wav';
  mixed.assPath = '/outside/source.ass';
  mixed.background = {
    image: 'assets/already-inside.png',
    slides: [
      { type: 'image', name: 'Local', image: '/outside/photo.png' },
      { type: 'image', name: 'Remote', image: 'https://synthetic.invalid/image.png' },
      { type: 'image', name: 'Cached', image: '/remote-cache/cached-image.png' },
      { type: 'text', text: 'Not an image resource' },
    ],
  };
  mixed.speakers = {
    A: { name: 'A', avatar: '/outside/avatar.png' },
    B: { name: 'B', avatar: '/preset-avatars/global.png', lockPreset: true, preset: 'global' },
  };
  mixed.content = [{ type: 'text', text: '![图](/outside/embed.png)' }];
  const local = setup(mixed);
  assert.deepEqual(local.harness.resourceActionAvailability, {
    copyRemoteAssetsCount: 2, copyLocalAssetsCount: 5, refreshRemoteAssetCacheCount: 2,
  });
  await local.harness.handleCopyLocalAssetsToProject();
  assert.deepEqual(local.state.imported.sort(), [
    '/outside/audio.wav', '/outside/source.ass', '/outside/photo.png', '/outside/avatar.png', '/outside/embed.png',
  ].sort(), 'Regular audio, subtitle, image, avatar, and Markdown files still copy');
  assert.equal(local.state.config.speakers.B.lockPreset, true, 'Global preset avatar retains its lock');
  assertFontsUnchanged(local.state);
  assert.equal(setup(local.state.config).harness.resourceActionAvailability.copyLocalAssetsCount, 0, 'Copy badge reaches zero after project files migrate');
  console.log('PASS 混合项目：正常素材仍复制，迁移后本地数量归零，全局字体与预设头像不受影响');

  const remote = setup(mixed);
  await remote.harness.handleCopyRemoteAssetsToProject();
  assert.deepEqual(remote.state.imported.sort(), ['/remote-cache/image.png', '/remote-cache/cached-image.png'].sort());
  assert(!remote.state.fetched.includes(fonts.remote.filePath), 'Remote copy does not fetch global fonts');
  assertFontsUnchanged(remote.state);
  console.log('PASS 远程素材复制：仅迁移项目 URL/缓存资源，不迁移远程字体');

  const refreshed = setup(mixed);
  await refreshed.harness.handleRefreshRemoteAssetCache();
  assert.deepEqual(refreshed.state.imported, ['/remote-cache/image.png']);
  assert.equal(refreshed.state.cached[fonts.remote.filePath], '/remote-cache/font.woff2', 'Remote font refresh uses only global cache');
  assertFontsUnchanged(refreshed.state);
  console.log('PASS 手动刷新：项目图片可进入 assets，远程字体仅保留在全局缓存');

  const automatic = setup(mixed);
  const cleanup = automatic.harness.cacheRemoteResources();
  for (let attempt = 0; automatic.state.synced === 0 && attempt < 50; attempt++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  cleanup();
  assert.equal(automatic.state.synced, 1, 'Automatic cache migration completes');
  assert.deepEqual(automatic.state.imported, ['/remote-cache/image.png']);
  assert.equal(automatic.state.cached[fonts.remote.filePath], '/remote-cache/font.woff2');
  assertFontsUnchanged(automatic.state);
  console.log('PASS 自动缓存：开启项目缓存时仍不把字体复制到 assets 或改写预设');
} finally {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  rmSync(temporary, { recursive: true, force: true });
}
