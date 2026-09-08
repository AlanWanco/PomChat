// Run with: node scripts/test-biliup.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

const temporary = mkdtempSync(path.join(tmpdir(), 'pomchat-biliup-test-'));
try {
  const compile = async (entry, name) => {
    const outfile = path.join(temporary, `${name}.mjs`);
    buildSync({ entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'esm' });
    return import(pathToFileURL(outfile).href);
  };
  const { extractBiliupProgressDetails, parseBiliupProgress, buildBiliupUploadArgs, redactBiliupLine, plainTerminalLine } = await compile('electron/biliupProtocol.ts', 'protocol');
  const { BILIUP_MAX_TAGS, BILIUP_SCHEDULE_MAX_AHEAD_SECONDS, BILIUP_SCHEDULE_MIN_LEAD_SECONDS, newBiliupTemplate, normalizeBiliupPreferences, validateBiliupSchedule, validateBiliupTemplate } = await compile('src/biliup.ts', 'model');
  assert.equal(parseBiliupProgress('\x1b[32m[00:12] 512 KiB/1 MiB (32 KiB/s, 12s)\x1b[0m'), 50);
  assert.equal(parseBiliupProgress('500 MB/1 GB (1 MB/s)'), 50);
  assert.equal(parseBiliupProgress(' 12.5% '), 12.5);
  assert.equal(parseBiliupProgress('waiting for upload'), null);
  assert.equal(parseBiliupProgress('0 B/0 B'), null);
  assert.equal(parseBiliupProgress('1.1 GiB/1 GiB'), 100);
  assert.equal(extractBiliupProgressDetails('⠓ [00:00:23] [████░░] 114.10 MiB/117.97 MiB (4.90 MiB/s, 1s)'), '114.10 MiB/117.97 MiB · 4.90 MiB/s · 1s');
  assert.equal(extractBiliupProgressDetails('waiting for upload'), '');
  assert.equal(plainTerminalLine('\x1b[2Khello\x00\r'), 'hello\r');
  assert(!redactBiliupLine('token=privatevalue', ['privatevalue']).includes('privatevalue'));
  assert(!redactBiliupLine('access_token: xyz', []).includes('xyz'));

  assert.equal(newBiliupTemplate().tid, 5);
  assert.equal(newBiliupTemplate().submit, 'app');
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
  assert(args.includes('$(touch unsafe); & echo test'));
  assert.equal(args[args.indexOf('--title') + 1], '固定标题');
  const originalWithSource = buildBiliupUploadArgs({ ...template, source: 'should-not-be-submitted' }, file, 'cookies.json', help);
  assert(!originalWithSource.includes('--source'));
  const repost = buildBiliupUploadArgs({ ...template, copyright: 2, source: 'source-name' }, file, 'cookies.json', help);
  assert.equal(repost[repost.indexOf('--source') + 1], 'source-name');
  const multiline = buildBiliupUploadArgs({ ...template, desc: '第一行\r\n第二行' }, file, 'cookies.json', help);
  assert.equal(multiline[multiline.indexOf('--desc') + 1], '第一行\n第二行');
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
  assert.deepEqual(normalizeBiliupPreferences(null), { directory: '', autoUpload: false, selectedAccountId: '', accounts: [], selectedTemplateId: '', templates: [], tagHistory: [] });
  const normalized = normalizeBiliupPreferences({ directory: '/app', autoUpload: true, selectedTemplateId: 'one', templates: [{ ...template, secret: 'not-a-setting' }] });
  assert.equal(normalized.autoUpload, true);
  assert.equal(normalized.templates.length, 1);
  assert(!('secret' in normalized.templates[0]));
  assert.deepEqual(normalized.accounts, [{ id: 'default', name: 'Default account', directory: '/app' }]);
  assert.equal(normalized.selectedAccountId, 'default');
  assert.deepEqual(normalized.tagHistory, ['one', 'two']);
  console.log('biliup tests passed: byte progress, ANSI, redaction, args, title limits, tags, validation, preferences, accounts');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
