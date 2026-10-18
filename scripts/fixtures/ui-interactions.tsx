import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { NumberInput } from '../../src/components/ui/NumberInput';
import { TimeInput } from '../../src/components/ui/TimeInput';
import { Dialog } from '../../src/components/ui/Dialog';
import { NameInput } from '../../src/components/ui/NameInput';
import { StyleManagerModal } from '../../src/components/StyleManagerModal';
import { SpeakerPicker } from '../../src/components/SpeakerPicker';
import { ExportModal } from '../../src/components/ExportModal';
import { BiliupModal } from '../../src/components/BiliupModal';
import { BiliupProvider } from '../../src/components/BiliupProvider';
import { parseTimeInput, correctTimeEndpoint } from '../../src/utils/timeInput';
import { AVATAR_PLACEHOLDER, handleAvatarError } from '../../src/utils/avatarFallback';
import { translate } from '../../src/i18n';
import { emptyBiliupPreferences, idleBiliupState, newBiliupTemplate, type BiliupState } from '../../src/biliup';
import { useBiliupActions } from '../../src/components/BiliupContext';
import { createThemeTokens } from '../../src/theme';

// Uses only synthetic props. No file writes, network upload, or real account access.
export async function runUiInteractionTests() {
  const root = createRoot(document.getElementById('root')!);
  const results: string[] = [];
  const t = (key: string) => translate('en', key);
  const appearance = { language: 'en' as const, isDarkMode: false, themeColor: '#9ca4b8', secondaryThemeColor: '#ed7e96' };
  const noop = () => {};
  const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
  const settle = async () => { for (let i = 0; i < 4; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); };
  const render = async (node: ReactNode) => { flushSync(() => root.render(<StrictMode>{node}</StrictMode>)); await settle(); };
  const input = () => document.querySelector<HTMLInputElement>('input')!;
  const change = (target: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, value);
    flushSync(() => target.dispatchEvent(new Event('input', { bubbles: true })));
  };
  const key = (target: Element, value: string, shiftKey = false, options: KeyboardEventInit = {}) => flushSync(() => target.dispatchEvent(new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true, ...options })));
  const click = (target: HTMLElement) => flushSync(() => target.click());
  const button = (text: string) => {
    const node = [...document.querySelectorAll('button')].find(el => el.textContent?.trim() === text);
    if (!node) throw new Error(`Missing button: ${text}`);
    return node;
  };
  const focus = (target: HTMLElement) => flushSync(() => target.focus());
  const blur = (target: HTMLElement) => flushSync(() => target.blur());
  const originalConfirm = window.confirm;
  try {
    let number = 1.2;
    function Numeric() {
      const [value, setValue] = useState(number);
      return <NumberInput language="en" value={value} min={0.8} max={3} step={0.05} onValueChange={next => { number = next; setValue(next); }} />;
    }
    await render(<Numeric />);
    focus(input()); change(input(), '');
    assert(number === 1.2 && input().value === '', 'Empty numeric draft does not write zero');
    change(input(), '0'); assert(number === 1.2 && input().value === '0', 'Out-of-range prefix stays editable');
    change(input(), '0.'); change(input(), '0.85');
    assert(number === 0.85 && input().value === '0.85', 'Decimal input previews without rounding');
    key(input(), 'Escape'); assert(number === 1.2 && input().value === '1.2', 'Escape restores this edit');
    change(input(), '-5'); key(input(), 'Enter');
    assert(number === 0.8 && input().value === '0.8', 'Commit clamps and refreshes display');
    change(input(), '0'); blur(input());
    assert(number === 0.8 && input().value === '0.8', 'Same-value correction still restores the field');
    focus(input()); change(input(), '0.85');
    input().dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true })); await settle();
    assert(number === 0.9, 'Focused wheel steps with decimal precision');
    blur(input()); input().dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true })); await settle();
    assert(number === 0.9, 'Unfocused wheel leaves value unchanged');
    results.push('数字草稿：空值、小数、越界、同值修正、Esc 与滚轮');

    for (const [raw, expected] of [['01:30', 90], ['1:02:03.5', 3723.5], ['90.25', 90.25], ['1::2', null], ['1:99', null], ['1x', null], ['', null]] as const) assert(parseTimeInput(raw) === expected, `Full time parsing: ${raw}`);
    assert(correctTimeEndpoint(5, 'end', 10, 20) === 10, 'End conflict leaves start unchanged');
    let end = '20';
    function TimeEditor() { const [value, setValue] = useState(end); return <TimeInput language="en" value={value} field="end" start={10} end={20} onValueChange={next => { end = next; setValue(next); }} />; }
    await render(<TimeEditor />); focus(input()); change(input(), '5'); blur(input());
    assert(end === '10' && document.body.textContent?.includes(t('input.timeRange')), 'Time correction is visible near the field');
    focus(input()); change(input(), '01:30'); key(input(), 'Enter'); assert(end === '90', 'Colon input is parsed fully');
    results.push('时间输入：完整解析、范围冲突与就地提示');

    let names = ['A', 'B']; let nameDirty = false; let allowed = false; let confirmations = 0;
    function Rename() {
      const [name, setName] = useState('B');
      return <NameInput key={name} value={name} onDraftChange={dirty => { nameDirty = dirty; }} onCommit={next => {
        if (names.includes(next)) { confirmations++; if (!allowed) return false; }
        names = names.filter(item => item !== name && item !== next).concat(next); setName(next); return true;
      }} />;
    }
    await render(<Rename />); focus(input()); change(input(), 'A');
    assert(names.length === 2 && confirmations === 0, 'Typing a collision does not overwrite');
    key(input(), 'Enter', false, { isComposing: true });
    assert(names.length === 2 && confirmations === 0 && input().value === 'A', 'IME Enter accepts a candidate without committing the name');
    key(input(), 'Escape', false, { isComposing: true });
    assert(input().value === 'A' && nameDirty, 'IME Escape cancels composition without discarding the draft');
    blur(input()); assert(names.length === 2 && nameDirty && input().value === 'A', 'Cancelled overwrite preserves draft');
    allowed = true; key(input(), 'Enter'); assert(names.length === 1 && !nameDirty, 'Confirmed rename commits once');
    results.push('预设名称：逐字输入不覆盖，取消保留草稿');

    let closes = 0; let dialogSaves = 0;
    const opener = document.createElement('button'); opener.textContent = 'opener'; document.body.append(opener); opener.focus();
    await render(<Dialog aria-label="Test dialog" onClose={() => closes++} onSave={() => dialogSaves++}><input aria-label="plain field" /><NumberInput language="en" value={1} onValueChange={noop} /><button>last</button></Dialog>);
    const plainInput = document.querySelector<HTMLInputElement>('input:not([data-number-draft])')!;
    const numberInput = document.querySelector<HTMLInputElement>('[data-number-draft="true"]')!;
    focus(plainInput); key(plainInput, 's', false, { ctrlKey: true });
    assert(dialogSaves === 1 && document.querySelector('[role="dialog"]')?.contains(document.activeElement), 'Ctrl+S invokes a dialog-specific save handler without losing modal focus');
    key(plainInput, 's', false, { ctrlKey: true, isComposing: true });
    assert(dialogSaves === 1, 'IME composition does not trigger dialog save');
    const imeEscapeEvent = new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true });
    flushSync(() => plainInput.dispatchEvent(imeEscapeEvent));
    assert(closes === 0 && document.activeElement === plainInput, `IME Escape does not close the dialog (closes=${closes}, active=${document.activeElement?.tagName}, composing=${imeEscapeEvent.isComposing})`);
    focus(numberInput); key(numberInput, 'Escape'); assert(closes === 0, 'Field Escape is consumed');
    focus(button('last')); key(button('last'), 'Tab'); assert(document.activeElement === plainInput, 'Tab wraps inside modal');
    opener.focus(); assert(document.activeElement === plainInput, 'Background cannot steal modal focus');
    focus(button('last')); key(button('last'), 'Escape'); assert(closes === 1, 'Modal Escape requests close once');
    await render(null); assert(document.activeElement === opener, 'Closing restores opener focus'); opener.remove();
    results.push('弹窗：IME Esc、焦点限制、Esc 关闭和焦点归还');

    let speaker = 'A';
    await render(<Dialog aria-label="Picker"><SpeakerPicker options={['A', 'B', 'C'].map(id => [id, { name: id }])} value="A" onChange={id => { speaker = id; }} accentColor="#888" theme={{ inputBg: '#fff', border: '#aaa', text: '#111', panelBgElevated: '#fff', hoverBg: '#eee', textMuted: '#666' }} /></Dialog>);
    key(document.querySelector('[role="combobox"]')!, 'ArrowDown'); await settle();
    key(document.activeElement!, 'End'); key(document.activeElement!, 'Enter');
    assert(speaker === 'C' && document.activeElement?.getAttribute('role') === 'combobox', 'Picker navigation commits and returns focus');
    results.push('说话人选择器：方向键、首尾和 Enter');

    const speakers = { A: { name: 'Alice', avatar: AVATAR_PLACEHOLDER, type: 'speaker' as const }, B: { name: 'Bob', avatar: AVATAR_PLACEHOLDER, type: 'speaker' as const } };
    let draftClosed = false;
    await render(<StyleManagerModal key="draft-failure" {...appearance} isOpen speakers={speakers} onClose={() => { draftClosed = true; }} onSave={async () => { throw new Error('Synthetic save failure'); }} />);
    click([...document.querySelectorAll('span')].find(el => el.textContent === 'Alice')!.parentElement!);
    const basics = [...document.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find(el => el.textContent?.trim() === t('speakers.title'))!;
    if (basics.getAttribute('aria-expanded') === 'false') click(basics);
    const speakerName = [...document.querySelectorAll('input')].find(el => el.value === 'Alice')!;
    focus(speakerName); change(speakerName, 'Edited Alice'); blur(speakerName);
    click(document.querySelector<HTMLElement>('[role="dialog"]')!);
    assert(!draftClosed, 'Backdrop does not discard style drafts');
    click(button(t('common.close'))); await settle();
    let guard = document.querySelector('[aria-label="'+t('draft.title')+'"]')!;
    const guardSave = [...guard.querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent === t('action.save'))!;
    focus(guardSave); key(guardSave, 's', false, { ctrlKey: true }); await settle();
    assert(!draftClosed && document.body.textContent?.includes('Synthetic save failure'), 'Ctrl+S saves through the active draft guard and preserves failures');
    click(button(t('common.cancel')));
    assert([...document.querySelectorAll('input')].some(el => el.value === 'Edited Alice'), 'Cancel retains style draft');
    click(button(t('common.close'))); await settle();
    guard = document.querySelector('[aria-label="'+t('draft.title')+'"]')!;
    click([...guard.querySelectorAll('button')].find(el => el.textContent === t('draft.discard'))!);
    assert(draftClosed, 'Discard closes without requiring save');
    results.push('样式草稿：遮罩保护、保存失败保留、取消和不保存');

    let saved: Parameters<NonNullable<React.ComponentProps<typeof StyleManagerModal>['onSave']>> | null = null;
    let overwriteAccepted = false; let overwriteMessage = '';
    window.confirm = message => { overwriteMessage = String(message); return overwriteAccepted; };
    await render(<StyleManagerModal key="preset-collision" {...appearance} isOpen initialPresetName="B"
      speakers={{ ...speakers, A: { ...speakers.A, preset: 'A', lockPreset: true }, ANNOTATION: { name: 'Note', type: 'annotation', preset: 'B', lockPreset: true } }}
      speakerPresets={{ A: { style: { bgColor: '#111111' }, avatar: AVATAR_PLACEHOLDER }, B: { style: { bgColor: '#222222' }, avatar: AVATAR_PLACEHOLDER } }}
      annotationPresets={{ B: { style: { bgColor: '#333333' } } }} onClose={noop} onSave={(...args) => { saved = args; }} />);
    const presetSection = [...document.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find(el => el.textContent?.trim() === t('style.presetConfig'))!;
    if (presetSection.getAttribute('aria-expanded') === 'false') click(presetSection);
    const presetName = [...document.querySelectorAll('input')].find(el => el.value === 'B')!;
    focus(presetName); change(presetName, 'A'); assert(!overwriteMessage, 'Style manager does not confirm on each key');
    blur(presetName); assert(presetName.value === 'A' && overwriteMessage.includes('Alice'), 'Overwrite identifies affected speakers and retains rejected draft');
    overwriteAccepted = true; key(presetName, 'Enter'); click(button(t('action.save'))); await settle();
    const renamed = saved as unknown as [Record<string, { preset?: string; style?: { bgColor?: string } }>, Record<string, unknown>, Record<string, unknown>];
    assert(renamed[1].A && !renamed[1].B && renamed[0].A.style?.bgColor === '#222222', 'Confirmed overwrite updates locked target users');
    assert(renamed[0].ANNOTATION.preset === 'B' && renamed[2].B, 'Ordinary preset rename preserves annotation namespace');
    results.push('样式预设覆盖：确认列出角色，同名注释预设不受影响');

    await render(<StyleManagerModal key="delete" {...appearance} isOpen speakers={speakers} subtitleSpeakerIds={['A']} onClose={noop} onSave={(...args) => { saved = args; }} />);
    const alice = [...document.querySelectorAll('span')].find(el => el.textContent === 'Alice')!; click(alice.parentElement!);
    click(button(t('common.delete'))); await settle();
    assert(document.querySelectorAll('[role="dialog"]').length === 2, 'Referenced speaker requires reassignment');
    const nested = document.querySelector('[aria-label="'+t('speakers.reassign')+'"]')!;
    click([...nested.querySelectorAll('button')].find(el => el.textContent === t('common.delete'))!);
    click(button(t('action.save'))); await settle();
    const payload = saved as unknown as [typeof speakers, unknown, unknown, Record<string, string>];
    assert(payload && !payload[0].A && payload[3].A === 'B', 'Deletion and reassignment are passed together on save');
    const bob = [...document.querySelectorAll('span')].find(el => el.textContent === 'Bob')!; click(bob.parentElement!); click(button(t('common.delete')));
    assert(document.body.textContent?.includes(t('speakers.keepOne')), 'Cannot remove the final ordinary speaker');
    results.push('角色删除：字幕改绑与样式一起保存，保留最后角色');

    await render(<BiliupProvider><ExportModal {...appearance} isOpen outputPath="" quickSaveDir="" rangeStart={10} rangeEnd={10} defaultRangeStart={0} isExporting={false} exportSucceeded={false} statusMessage={null} onClose={noop} onCancelExport={noop} onOutputPathChange={noop} onChoosePath={noop} onQuickSave={noop} onRangeChange={noop} onStartExport={noop} onRevealOutput={noop} /></BiliupProvider>);
    assert(button(t('export.startButton')).disabled, 'Zero-duration export is disabled');
    results.push('导出：零时长不能提交');

    // The export panel must name the title this upload will use.
    const globalWindow = window as unknown as { electron?: unknown };
    const previousElectron = globalWindow.electron;
    const ok = (value: unknown) => Promise.resolve({ ok: true, value });
    const biliupStateListeners = new Set<(state: BiliupState) => void>();
    let currentBiliupState = idleBiliupState;
    const notifications: { title: string; body: string }[] = [];
    const emitBiliupState = async (state: BiliupState) => {
      currentBiliupState = state;
      flushSync(() => { for (const listener of biliupStateListeners) listener(state); });
      await settle();
    };
    const installBiliupMock = (title: string, uploadError = '') => {
      const preferences = {
        ...emptyBiliupPreferences,
        directory: '/tmp/synthetic-biliup',
        autoUpload: true,
        selectedAccountId: 'acc-1',
        selectedTemplateId: 'tpl-1',
        accounts: [{ id: 'acc-1', name: 'Synthetic account', directory: '' }],
        templates: [{ ...newBiliupTemplate(), id: 'tpl-1', name: 'Synthetic template', title, tag: 'synthetic' }],
      };
      currentBiliupState = idleBiliupState;
      globalWindow.electron = {
        showNotification: (payload: { title: string; body: string }) => { notifications.push(payload); return Promise.resolve(true); },
        biliup: {
          load: () => ok(preferences),
          state: () => ok(currentBiliupState),
          onState: (callback: (state: BiliupState) => void) => { biliupStateListeners.add(callback); return () => { biliupStateListeners.delete(callback); }; },
          save: (next: unknown) => ok(next),
          upload: () => Promise.resolve(uploadError ? { ok: false, error: uploadError } : { ok: true }),
          open: () => {},
        },
      };
    };
    const exportModal = (
      <ExportModal {...appearance} isOpen outputPath="" quickSaveDir="" rangeStart={0} rangeEnd={1} defaultRangeStart={0} isExporting={false} exportSucceeded={false} statusMessage={null} onClose={noop} onCancelExport={noop} onOutputPathChange={noop} onChoosePath={noop} onQuickSave={noop} onRangeChange={noop} onStartExport={noop} onRevealOutput={noop} />
    );
    try {
      installBiliupMock('  合成投稿标题  ');
      // A fresh key forces the provider to reload the mocked preferences.
      await render(<BiliupProvider key="biliup-title-ready">{exportModal}</BiliupProvider>);
      for (let attempt = 0; attempt < 40 && !document.querySelector('[data-testid="biliup-upload-title"]'); attempt += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      const titleLine = document.querySelector('[data-testid="biliup-upload-title"]');
      assert(titleLine, `The export panel must show the upload title. Body: ${document.body.textContent?.slice(0, 200)}`);
      assert(titleLine.textContent?.includes('合成投稿标题'), `Upload title must be visible: ${titleLine.textContent}`);
      assert(titleLine.getAttribute('data-title-state') === 'ready', 'A valid template title must be marked ready');

      installBiliupMock('   ');
      await render(<BiliupProvider key="biliup-title-missing">{exportModal}</BiliupProvider>);
      const missingLine = document.querySelector('[data-testid="biliup-upload-title"]');
      assert(missingLine?.getAttribute('data-title-state') === 'missing', 'A template without a title must be flagged');
      assert(missingLine?.textContent?.includes(t('biliup.uploadTitleMissing')), 'The missing title must be explained');
      results.push('导出面板：显示本次上传标题及缺失提示');

      installBiliupMock('Synthetic upload');
      await render(<BiliupProvider key="biliup-upload-failure">{exportModal}</BiliupProvider>);
      await emitBiliupState({ ...idleBiliupState, kind: 'upload', busy: true, phase: 'uploading' });
      const failed: BiliupState = { ...idleBiliupState, kind: 'upload', phase: 'failed', error: 'upload', errorDetail: 'ERROR: Synthetic connection reset', logs: ['ERROR: Synthetic connection reset'] };
      await emitBiliupState(failed);
      assert(document.querySelector('[data-testid="biliup-error"]')?.textContent?.includes(failed.errorDetail!), 'A failure after upload starts must appear in the export panel');
      assert(notifications.length === 1 && notifications[0].body === translate('zh-CN', 'biliup.uploadFailed'), 'A background failure must emit one system notification');
      assert([...document.querySelectorAll('[role="alert"]')].some((node) => node.textContent?.includes(translate('zh-CN', 'biliup.uploadFailed'))), 'A background failure must also show an in-app alert');
      await emitBiliupState({ ...failed, logs: [...failed.logs, 'trailing output'] });
      assert(notifications.length === 1, 'Repeated log updates must not repeat the failure notification');
      click(button(t('biliup.viewUploadError'))); await settle();
      const uploadDialog = document.querySelector('[aria-label="'+translate('zh-CN', 'biliup.settings')+'"]')!;
      assert(uploadDialog?.querySelector('[data-testid="biliup-error"]')?.textContent?.includes(failed.errorDetail!), 'Opening a failed upload must show its error inside the dialog');
      click(uploadDialog.querySelector<HTMLButtonElement>('button[aria-label="'+translate('zh-CN', 'settings.close')+'"]')!);
      await settle();
      assert(!document.querySelector('[aria-label="'+translate('zh-CN', 'biliup.settings')+'"]'), 'The failed upload dialog can close');
      assert(document.querySelector('[data-testid="biliup-error"]')?.textContent?.includes(failed.errorDetail!), 'Closing the upload dialog must retain the error in the export panel');
      await emitBiliupState({ ...idleBiliupState, kind: 'upload', busy: true, phase: 'starting' });
      assert(!document.querySelector('[data-testid="biliup-error"]'), 'A new upload must clear the previous task error');
      await emitBiliupState({ ...idleBiliupState, kind: 'upload', phase: 'cancelled' });
      assert(notifications.length === 1, 'Cancelling must not be reported as an upload failure');
      await emitBiliupState({ ...idleBiliupState, kind: 'upload', busy: true, phase: 'starting' });
      await emitBiliupState({ ...idleBiliupState, kind: 'upload', phase: 'failed' });
      assert(document.querySelector('[data-testid="biliup-error"]')?.textContent?.includes(t('biliup.error.upload')), 'A failed phase must show a useful message even if no error code arrived');
      assert(notifications.length === 2, 'A later failed upload must notify again');
      results.push('biliup：异步失败在导出面板、设置窗口和通知中可见，取消不报失败');

      installBiliupMock('Synthetic upload', 'binary');
      function UploadStartFailure() {
        const actions = useBiliupActions();
        return <button type="button" onClick={() => void actions.upload({ directory: '/synthetic', template: { ...newBiliupTemplate(), name: 'Synthetic', title: 'Synthetic', tag: 'synthetic' } }, '/synthetic.mp4').catch(noop)}>Synthetic upload start</button>;
      }
      await render(<BiliupProvider key="biliup-start-failure">{exportModal}<UploadStartFailure /></BiliupProvider>);
      click(button('Synthetic upload start')); await settle();
      const startDialog = document.querySelector('[aria-label="'+translate('zh-CN', 'biliup.settings')+'"]')!;
      assert(startDialog?.querySelector('[data-testid="biliup-error"]')?.textContent?.includes(translate('zh-CN', 'biliup.error.binary')), 'Immediate IPC errors must also appear at the top of the upload dialog');
      results.push('biliup：上传启动失败显示具体错误');
    } finally {
      if (previousElectron === undefined) delete globalWindow.electron;
      else globalWindow.electron = previousElectron;
    }

    let uploadClosed = false;
    await render(<BiliupProvider><BiliupModal {...appearance} onClose={() => { uploadClosed = true; }} /></BiliupProvider>);
    const modeGroup = document.querySelector<HTMLElement>(`[data-testid="biliup-mode-selector"][role=group][aria-label="${t('biliup.uploadMode')}"]`)!;
    const accentProbe = document.createElement('div');
    accentProbe.style.backgroundColor = `${appearance.secondaryThemeColor}10`;
    const accentSlider = document.createElement('div');
    accentSlider.style.backgroundColor = appearance.secondaryThemeColor;
    assert(modeGroup.style.backgroundColor === accentProbe.style.backgroundColor, 'Mode switch uses the existing secondary-accent color treatment');
    assert(modeGroup.querySelector<HTMLElement>('[data-testid="biliup-mode-slider"]')?.style.backgroundColor === accentSlider.style.backgroundColor, 'Selected mode slider uses the established secondary theme color');
    const newMode = modeGroup.querySelector<HTMLButtonElement>('[aria-pressed="true"]')!;
    assert(newMode.textContent === t('biliup.uploadMode.new'), 'New submission is the initial mode');
    click(modeGroup.querySelector<HTMLButtonElement>(`button:not([aria-pressed="true"])`)!); await settle();
    assert(document.body.textContent?.includes(t('biliup.appendTargetRequired')), 'Append mode requires a verified target video');
    assert(![...document.querySelectorAll('label')].some(el => el.textContent?.includes(t('biliup.field.title'))), 'Append mode hides new-submission metadata');
    assert(!document.querySelector('[data-testid="biliup-new-submission-options"]'), 'Append mode hides new-submission template and collection controls');
    click(modeGroup.querySelector<HTMLButtonElement>(`button:not([aria-pressed="true"])`)!); await settle();
    assert([...document.querySelectorAll('label')].some(el => el.textContent?.includes(t('biliup.field.title'))), 'New mode restores its template fields');
    assert(document.querySelector('[data-testid="biliup-new-submission-options"]'), 'New mode groups its template and collection controls together');
    const titleLabel = [...document.querySelectorAll('label')].find(el => el.textContent?.includes(t('biliup.field.title')))!;
    const titleInput = titleLabel.querySelector('input')!; focus(titleInput); change(titleInput, 'Unsaved synthetic title');
    const closeButton = document.querySelector<HTMLButtonElement>(`button[aria-label="${t('common.close')}"]`) || [...document.querySelectorAll('button')].find(el => el.querySelector('.lucide-x'))!;
    click(closeButton); await settle();
    assert(!uploadClosed && document.body.textContent?.includes(t('draft.title')), 'Upload drafts get three-way protection');
    const uploadGuard = document.querySelector<HTMLElement>('[aria-label="'+t('draft.title')+'"]')!;
    const saveDraftButton = [...uploadGuard.querySelectorAll<HTMLButtonElement>('button')].find((node) => node.textContent === t('action.save'))!;
    const theme = createThemeTokens(appearance.themeColor, false);
    const expectedSurface = document.createElement('div');
    expectedSurface.style.color = theme.text;
    assert((uploadGuard.firstElementChild as HTMLElement).style.color === expectedSurface.style.color, 'The draft guard must use the application text colour');
    expectedSurface.style.backgroundColor = appearance.secondaryThemeColor;
    assert(saveDraftButton.style.backgroundColor === expectedSurface.style.backgroundColor && (uploadGuard.firstElementChild as HTMLElement).style.background.includes('linear-gradient'), 'The draft guard must use the secondary theme button and the shared save-dialog surface');
    assert([...uploadGuard.querySelectorAll('button')].map((node) => node.textContent).join('|') === [t('common.cancel'), t('draft.discard'), t('action.save')].join('|'), 'Draft buttons must match the project save prompt order');
    click(button(t('common.cancel'))); assert(!uploadClosed, 'Cancel retains upload editor');
    results.push('投稿模板：关闭草稿保护和取消');

    await render(<img src={AVATAR_PLACEHOLDER} onError={handleAvatarError} />);
    const avatar = document.querySelector('img')!; avatar.dispatchEvent(new Event('error')); avatar.dispatchEvent(new Event('error'));
    assert(avatar.src === AVATAR_PLACEHOLDER, 'Avatar fallback stays local after repeated errors');
    results.push('头像：本地占位无远程重试');
  } finally {
    window.confirm = originalConfirm;
    flushSync(() => root.unmount());
  }
  return results;
}
