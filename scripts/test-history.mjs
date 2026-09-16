import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const temporary = mkdtempSync(path.join(tmpdir(), 'pomchat-history-test-'));
try {
  const outfile = path.join(temporary, 'controller.mjs');
  await build({ entryPoints: ['src/history/HistoryController.ts'], outfile, bundle: true, platform: 'node', format: 'esm' });
  const { HistoryController, MediaUrlRegistry } = await import(pathToFileURL(outfile).href);
  const subtitleOutfile = path.join(temporary, 'subtitle-source.mjs');
  await build({ entryPoints: ['src/hooks/useAssSubtitle.ts'], outfile: subtitleOutfile, bundle: true, platform: 'node', format: 'esm' });
  globalThis.window = { electron: undefined };
  const { parseSubtitleSource } = await import(pathToFileURL(subtitleOutfile).href);
  const assWithComments = `[Script Info]\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nComment: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,hidden before\nDialogue: 0,0:00:02.00,0:00:03.00,Default,A,0,0,0,,visible\nComment: 0,0:00:04.00,0:00:05.00,Default,,0,0,0,,hidden after`;
  const parsedAssItems = parseSubtitleSource({ assPath: '', assContentOverride: assWithComments, projectContent: [], subtitleFormat: 'ass' }, { A: { name: 'A' } });
  assert.deepEqual(parsedAssItems?.map((item) => ({ visible: item.visible, sourceLineIndex: item.sourceLineIndex })), [
    { visible: false, sourceLineIndex: 3 },
    { visible: true, sourceLineIndex: 4 },
    { visible: false, sourceLineIndex: 5 },
  ]);
  const serializedProjectItems = parseSubtitleSource({
    assPath: '/old/project.ass',
    projectContent: [{ type: 'text', start: 0, end: 1, text: 'serialized text', speaker: 'A' }],
    subtitleFormat: 'ass',
  }, { A: { name: 'A' } });
  assert.equal(serializedProjectItems?.[0]?.text, 'serialized text', 'web project content must win over an ASS path');
  assert.deepEqual(parseSubtitleSource({ assPath: '', assContentOverride: null, projectContent: [], subtitleFormat: 'ass' }, { A: { name: 'A' } }), [], 'an emptied ASS project must not reload stale content');
  const revoked = [];
  const mutableInput = { value: 0 };
  const mutableHistory = new HistoryController(mutableInput);
  mutableInput.value = 1;
  assert.equal(mutableHistory.sync(mutableInput), true, 'external mutable inputs must not be cached as immutable');
  assert.equal(mutableHistory.current.value, 1);
  const history = new HistoryController({ value: 0 });
  assert.equal(history.commit({ value: 0 }), false);
  for (let value = 1; value <= 90; value++) history.commit({ value });
  assert.equal(history.past.length, 80);
  assert.equal(history.undo().value, 89);
  assert.equal(history.redo().value, 90);
  history.undo();
  history.commit({ value: 89 });
  assert.equal(history.canRedo, true, 'unchanged action retains redo');
  history.preview('slider', { value: 91 });
  history.preview('slider', { value: 92 });
  assert.equal(history.canRedo, false);
  assert.equal(history.undo().value, 89, 'pending preview can be undone immediately');
  history.preview('first', { value: 100 });
  history.preview('second', { value: 101 });
  assert.equal(history.undo().value, 100, 'independent controls have separate baselines');
  history.redo();
  history.undo();
  assert.equal(history.canRedo, true);
  history.sync({ value: 99 });
  assert.equal(history.canRedo, false, 'derived state changes invalidate redo');
  const save = history.saveToken();
  history.preview('typing', { value: 102 });
  assert.equal(history.isSaveCurrent(save), false);
  history.reset({ value: 0 });
  assert.equal(history.canUndo, false);
  assert.equal(history.isSaveCurrent(save), false);

  const lifecycleHistory = new HistoryController({ value: 0 });
  let currentProjectPath = 'project-a';
  const lifecycle = { epoch: lifecycleHistory.epoch, projectPath: currentProjectPath, revision: lifecycleHistory.revision };
  const isCurrent = (token) => token.epoch === lifecycleHistory.epoch
    && token.projectPath === currentProjectPath
    && token.revision === lifecycleHistory.revision;
  assert.equal(isCurrent(lifecycle), true);
  lifecycleHistory.preview('edit', { value: 1 });
  assert.equal(isCurrent(lifecycle), false, 'an edit invalidates stale async work');
  const nextLifecycle = { epoch: lifecycleHistory.epoch, projectPath: 'project-b', revision: lifecycleHistory.revision };
  currentProjectPath = 'project-b';
  lifecycleHistory.reset({ value: 0 });
  assert.equal(isCurrent(nextLifecycle), false, 'a project reset invalidates the previous project path and epoch');

  let currentOperation = 0;
  const firstOperation = ++currentOperation;
  const secondOperation = ++currentOperation;
  assert.notEqual(firstOperation, secondOperation, 'a newer export owns cancellation and completion state');
  const media = new MediaUrlRegistry(url => revoked.push(url));
  media.add('blob:past'); media.add('blob:future'); media.add('blob:unused');
  media.retain([{ audio: 'blob:past' }, { audio: 'blob:future' }]);
  assert(revoked.includes('blob:unused'));
  assert(!revoked.includes('blob:past'));
  media.dispose();
  assert(revoked.includes('blob:future'));
  const mediaHistory = new HistoryController({ audio: 'blob:evicted' }, 2);
  media.add('blob:evicted');
  mediaHistory.commit({ audio: 'one' }); mediaHistory.commit({ audio: 'two' });
  media.retain(mediaHistory.snapshots);
  assert(!revoked.includes('blob:evicted'));
  mediaHistory.commit({ audio: 'three' }); media.retain(mediaHistory.snapshots);
  assert(revoked.includes('blob:evicted'), 'eviction releases the last reference');
  console.log('History controller and media URL tests passed.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
