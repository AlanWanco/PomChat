// Run with: node scripts/test-biliup.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';
import './test-biliup-runtime.mjs';

const temporary = mkdtempSync(path.join(tmpdir(), 'pomchat-biliup-test-'));
try {
  const compile = async (entry, name) => {
    const outfile = path.join(temporary, `${name}.mjs`);
    buildSync({ entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'esm' });
    return import(pathToFileURL(outfile).href);
  };
  const { extractBiliupBvid, extractBiliupFailureDetail, extractBiliupProgressDetails, parseBiliupJsonOutput, parseBiliupProgress, buildBiliupUploadArgs, redactBiliupLine, plainTerminalLine } = await compile('electron/biliupProtocol.ts', 'protocol');
  const { BILIUP_MAX_TAGS, BILIUP_SCHEDULE_MAX_AHEAD_SECONDS, BILIUP_SCHEDULE_MIN_LEAD_SECONDS, isBiliupVideoPath, newBiliupTemplate, normalizeBiliupPreferences, validateBiliupSchedule, validateBiliupTemplate, getBiliupUploadTitle, supportsBiliupSeasons } = await compile('src/biliup.ts', 'model');
  assert.equal(parseBiliupProgress('\x1b[32m[00:12] 512 KiB/1 MiB (32 KiB/s, 12s)\x1b[0m'), 50);
  assert.equal(parseBiliupProgress('500 MB/1 GB (1 MB/s)'), 50);
  assert.equal(parseBiliupProgress(' 12.5% '), 12.5);
  assert.equal(parseBiliupProgress('waiting for upload'), null);
  assert.equal(parseBiliupProgress('0 B/0 B'), null);
  assert.equal(parseBiliupProgress('1.1 GiB/1 GiB'), 100);
  assert.equal(extractBiliupProgressDetails('⠓ [00:00:23] [████░░] 114.10 MiB/117.97 MiB (4.90 MiB/s, 1s)'), '114.10 MiB/117.97 MiB · 4.90 MiB/s · 1s');
  assert.equal(extractBiliupProgressDetails('waiting for upload'), '');
  assert.equal(extractBiliupBvid('投稿成功：BV1abC2deF34'), 'BV1abC2deF34');
  assert.equal(extractBiliupBvid('upload finished'), null);
  assert.equal(plainTerminalLine('\x1b[2Khello\x00\r'), 'hello\r');
  const seasonJson = `[\n  {"season":{"id":123,"title":"synthetic"},"sections":{"sections":[]}}\n]`;
  assert.deepEqual(parseBiliupJsonOutput(`\x1b[2m2026-10-18 INFO biliup_cli::uploader: user: Synthetic account\x1b[0m\n${seasonJson}`), [{ season: { id: 123, title: 'synthetic' }, sections: { sections: [] } }], 'Season JSON parsing skips biliup informational output before the document');
  assert.deepEqual(parseBiliupJsonOutput('\x1b[32m{"ok":true}\x1b[0m\n'), { ok: true }, 'ANSI-wrapped JSON is parsed');
  assert.throws(() => parseBiliupJsonOutput('informational output without JSON'), /invalid-json/);
  assert(!redactBiliupLine('token=privatevalue', ['privatevalue']).includes('privatevalue'));
  assert(!redactBiliupLine('access_token: xyz', []).includes('xyz'));
  const failureDetail = extractBiliupFailureDetail([
    'biliup upload synthetic.mp4',
    '\x1b[31mERROR upload failed: connection reset\x1b[0m',
    '100 MiB/100 MiB (1 MiB/s)',
  ]);
  assert.equal(failureDetail, 'ERROR upload failed: connection reset', 'The failure summary must retain the useful terminal error');
  assert.equal(extractBiliupFailureDetail(['100 MiB/100 MiB', 'finished']), '');
  assert.equal(extractBiliupFailureDetail(['投稿失败：分区无效']), '投稿失败：分区无效');
  assert.equal(extractBiliupFailureDetail(['ERROR first', 'Error: last partial line']), 'Error: last partial line');
  assert.equal(extractBiliupFailureDetail([redactBiliupLine('ERROR network privatevalue', ['privatevalue'])]), 'ERROR network [redacted]');
  assert.equal(extractBiliupFailureDetail([redactBiliupLine('ERROR access_token: xyz', [])]), '', 'Hidden credentials must not become the failure summary');
  assert.equal(extractBiliupFailureDetail(['ERROR ' + 'x'.repeat(3000)]).length, 2000);

  assert(isBiliupVideoPath('C:\\Videos\\clip.mp4'));
  assert(isBiliupVideoPath('/tmp/clip.mkv'));
  assert(isBiliupVideoPath('/tmp/clip.webm'));
  assert(isBiliupVideoPath('/Volumes/SSK/LocalSend/「鬼頭明里のふくみみラジオ」#066.mp4'));
  assert(!isBiliupVideoPath('/tmp/clip.txt'));
  assert.equal(newBiliupTemplate().tid, 5);
  assert.equal(newBiliupTemplate().submit, 'app');
  assert.equal(supportsBiliupSeasons('biliup 1.2.8'), false);
  assert.equal(supportsBiliupSeasons('biliup 1.2.9'), true);
  assert.equal(supportsBiliupSeasons('biliup 1.2.10'), true);
  assert.equal(supportsBiliupSeasons('1.3.0'), true);
  assert.equal(supportsBiliupSeasons('1.2.9-rc.1'), false);
  assert.equal(supportsBiliupSeasons('unknown'), false);
  const template = { ...newBiliupTemplate(), id: 'one', name: 'Test', title: '固定标题', tag: 'one,two' };
  const help = '--title --tid --tag --copyright --limit --desc --source --line --submit --no-reprint --cover';
  assert.equal(validateBiliupTemplate(template), null);
  assert.equal(validateBiliupTemplate({ ...template, tag: Array.from({ length: BILIUP_MAX_TAGS + 1 }, (_, index) => `tag-${index}`).join(',') }), 'template');
  assert.equal(validateBiliupTemplate({ ...template, copyright: 2 }), 'template');
  assert.equal(validateBiliupTemplate({ ...template, limit: -1 }), 'template');
  assert.equal(validateBiliupTemplate({ ...template, interactive: 2 }), 'template');
  assert.equal(validateBiliupTemplate({ ...template, title: '\0' }), 'template');
  const file = path.resolve('video with spaces.mp4');
  const args = buildBiliupUploadArgs({ ...template, desc: '$(touch unsafe); & echo test' }, file, path.resolve('cookies.json'), help);
  assert.deepEqual(args.slice(-2), ['--', file]);
  const multiFiles = [file, path.resolve('second video.mp4')];
  const multiArgs = buildBiliupUploadArgs(template, multiFiles, 'cookies.json', help);
  assert.deepEqual(multiArgs.slice(-3), ['--', ...multiFiles], 'Each ordered file is a positional P input');
  assert(args.includes('$(touch unsafe); & echo test'));
  assert.equal(args[args.indexOf('--title') + 1], '固定标题');
  const originalWithSource = buildBiliupUploadArgs({ ...template, source: 'should-not-be-submitted' }, file, 'cookies.json', help);
  assert(!originalWithSource.includes('--source'));
  const repost = buildBiliupUploadArgs({ ...template, copyright: 2, source: 'source-name' }, file, 'cookies.json', help);
  assert.equal(repost[repost.indexOf('--source') + 1], 'source-name');
  const repostNoReprint = buildBiliupUploadArgs({ ...template, copyright: 2, source: 'source-name', noReprint: true }, file, 'cookies.json', help);
  assert(!repostNoReprint.includes('--no-reprint'));
  const multiline = buildBiliupUploadArgs({ ...template, desc: '第一行\r\n第二行' }, file, 'cookies.json', help);
  assert.equal(multiline[multiline.indexOf('--desc') + 1], '第一行\n第二行');
  const appendFiles = [file, path.resolve('part two.mp4')];
  const appendArgs = buildBiliupUploadArgs(newBiliupTemplate(), appendFiles, 'cookies.json', '--vid --line --limit --submit', { mode: 'append', targetVideoId: 'BV1abC2deF34' });
  assert(appendArgs.includes('append') && appendArgs.includes('--vid') && appendArgs[appendArgs.indexOf('--vid') + 1] === 'BV1abC2deF34');
  assert.deepEqual(appendArgs.slice(-3), ['--', ...appendFiles], 'Append mode preserves each selected file as a P');
  assert.throws(() => buildBiliupUploadArgs(newBiliupTemplate(), file, 'cookies.json', '--vid', { mode: 'append', targetVideoId: '' }), /input/);
  assert.throws(() => buildBiliupUploadArgs(newBiliupTemplate(), file, 'cookies.json', '--line --limit --submit', { mode: 'append', targetVideoId: 'BV1abC2deF34' }), /unsupported/, 'Append mode must check flags against append --help');
  const extended = buildBiliupUploadArgs({ ...template, interactive: 1, missionId: '123', isOnlySelf: '1', chargingPay: true, upSelectionReply: true }, file, 'cookies.json', `${help} --interactive --mission-id --is-only-self --charging-pay --up-selection-reply`);
  assert(extended.includes('--interactive') && extended.includes('--mission-id'));
  const long = buildBiliupUploadArgs({ ...template, title: '中'.repeat(120) }, file, 'cookies.json', help);
  assert.equal(Array.from(long[long.indexOf('--title') + 1]).length, 80);
  assert.throws(() => buildBiliupUploadArgs({ ...template, hires: true }, file, 'cookies.json', help), /unsupported/);
  const now = Math.floor(Date.now() / 1000);
  assert.equal(validateBiliupSchedule(String(now + BILIUP_SCHEDULE_MIN_LEAD_SECONDS + 60), now), null);
  assert.equal(validateBiliupSchedule(String(now + BILIUP_SCHEDULE_MIN_LEAD_SECONDS - 1), now), 'schedule');
  assert.equal(validateBiliupSchedule(String(now + BILIUP_SCHEDULE_MAX_AHEAD_SECONDS + 1), now), 'schedule');
  assert.throws(() => buildBiliupUploadArgs({ ...template, dtime: '1000000000' }, file, 'cookies.json', help), /schedule/);
  assert.deepEqual(normalizeBiliupPreferences(null), {
    directory: '', autoUpload: false, selectedAccountId: '', accounts: [], selectedTemplateId: '', templates: [], tagHistory: [],
    createProjectFolder: false, projectFolderDirectory: '', projectFolderTemplate: '{$yyyyMMdd}_{$BVID}_{$ProjectName}', checkSubmission: false,
  });
  const normalized = normalizeBiliupPreferences({ directory: '/app', autoUpload: true, selectedTemplateId: 'one', templates: [{ ...template, secret: 'not-a-setting' }] });
  assert.equal(normalized.autoUpload, true);
  assert.equal(normalized.templates.length, 1);
  assert(!('secret' in normalized.templates[0]));
  assert.deepEqual(normalized.accounts, [{ id: 'default', name: 'Default account', directory: '/app', seasonSectionId: '' }]);
  assert.equal(normalized.selectedAccountId, 'default');
  const accountSeason = normalizeBiliupPreferences({ accounts: [{ id: 'season-user', name: 'Season user', directory: '/biliup', seasonSectionId: '8081933' }] });
  assert.equal(accountSeason.accounts[0].seasonSectionId, '8081933', 'Collection destination belongs to its login account');
  const invalidAccountSeason = normalizeBiliupPreferences({ accounts: [{ id: 'season-user', name: 'Season user', directory: '/biliup', seasonSectionId: '../20' }] });
  assert.equal(invalidAccountSeason.accounts[0].seasonSectionId, '', 'Invalid section IDs cannot be persisted');
  assert.deepEqual(normalized.tagHistory, ['one', 'two']);
  assert.equal(normalized.projectFolderTemplate, '{$yyyyMMdd}_{$BVID}_{$ProjectName}');
  assert.equal(normalized.checkSubmission, false);
  // The export panel must show the same title the upload will send.
  assert.deepEqual(getBiliupUploadTitle({ title: '  合成标题  ' }), { raw: '合成标题', effective: '合成标题', shortened: false });
  assert.deepEqual(getBiliupUploadTitle(undefined), { raw: '', effective: '', shortened: false });
  assert.deepEqual(getBiliupUploadTitle({ title: '\0' }), { raw: '\0', effective: '\0', shortened: false });
  const capsTitle = getBiliupUploadTitle({ title: '中'.repeat(120) });
  assert.equal(Array.from(capsTitle.effective).length, 80, 'The panel must cap the title exactly like the upload');
  assert(capsTitle.shortened, 'A capped title must be flagged as shortened');

  console.log('biliup tests passed: byte progress, ANSI, redaction, new/append CLI modes and P ordering, season version gate, title limits, tags, validation, preferences, accounts');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
