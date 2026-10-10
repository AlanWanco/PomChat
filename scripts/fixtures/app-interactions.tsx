import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import App from '../../src/App';
import { BiliupProvider } from '../../src/components/BiliupProvider';
import { AVATAR_PLACEHOLDER } from '../../src/utils/avatarFallback';
import { translate } from '../../src/i18n';

export async function runAppInteractionTests() {
  localStorage.clear();
  localStorage.setItem('pomchat_config', JSON.stringify({
    language: 'en', projectTitle: 'Synthetic UI project', projectId: 'synthetic', fps: 30,
    dimensions: { width: 640, height: 360 }, audioPath: '', assPath: '', subtitleFormat: 'srt',
    background: { type: 'color', color: '#ffffff', image: AVATAR_PLACEHOLDER, slides: [] },
    speakers: { A: { name: 'Alice', type: 'speaker', avatar: AVATAR_PLACEHOLDER, side: 'left' }, B: { name: 'Bob', type: 'speaker', avatar: AVATAR_PLACEHOLDER, side: 'right' } },
    content: [{ type: 'text', start: 0, end: 10, text: 'Synthetic subtitle', speaker: 'A' }],
    ui: { recentProject: 'Synthetic UI project', autoSaveProject: false, presets: {}, annotationPresets: {}, fontPresets: {} },
  }));
  localStorage.setItem('pomchat_config_recent_project', 'Synthetic UI project');
  let renderError: unknown;
  const root = createRoot(document.getElementById('root')!, { onUncaughtError: error => { renderError = error; } });
  const t = (key: string) => translate('en', key);
  const settle = async () => { for (let i = 0; i < 6; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); };
  const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
  const click = (target: HTMLElement) => {
    if (!target) throw new Error(`Missing app click target. Visible text: ${document.body.textContent?.slice(0, 3000)}`);
    flushSync(() => target.click());
  };
  const button = (text: string) => {
    const node = [...document.querySelectorAll('button')].find(el => el.textContent?.trim() === text);
    if (!node) throw new Error(`Missing app button: ${text}`);
    return node;
  };
  const shortcut = (key: string, target: Element = document.body) => flushSync(() => target.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true })));
  const stored = () => JSON.parse(localStorage.getItem('pomchat_config')!);
  const change = (target: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, value);
    flushSync(() => target.dispatchEvent(new Event('input', { bubbles: true })));
  };
  try {
    flushSync(() => root.render(<BiliupProvider><App /></BiliupProvider>)); await settle();
    if (renderError) throw renderError;
    const recent = [...document.querySelectorAll<HTMLElement>('[role="button"]')].find(el => el.textContent?.includes('Synthetic UI project'))!;
    click(recent); await settle();
    click(document.querySelector<HTMLButtonElement>(`button[title="${t('menu.settings')}"]`)!); await settle();
    click(button(t('tab.project'))); await settle();
    const fps = () => [...document.querySelectorAll<HTMLInputElement>('input[aria-label]')].find(el => el.getAttribute('aria-label')?.startsWith(t('project.fps')))!;
    assert(fps()?.value === '30', `Loaded synthetic project FPS: ${[...document.querySelectorAll('input')].map(el => `${el.getAttribute('aria-label')}: ${el.value}`).join('; ')}`);
    flushSync(() => fps().focus()); change(fps(), '40');
    await new Promise(resolve => setTimeout(resolve, 1100));
    change(fps(), '45'); flushSync(() => fps().blur()); await settle();
    shortcut('z'); await settle(); assert(fps().value === '30', 'One undo restores entire edit, including a typing pause');
    shortcut('y'); await settle(); assert(fps().value === '45', 'Redo restores committed input');
    flushSync(() => fps().focus()); change(fps(), '-5'); shortcut('s', fps()); await settle();
    assert(fps().value === '1' && stored().fps === 1, 'Save shortcut commits active invalid draft before serializing');
    click(button(t('menu.subtitle'))); click(button(t('menu.styleManager'))); await settle();
    const modal = document.querySelector('[aria-label="'+t('speakers.title')+'"]')!;
    const alice = [...modal.querySelectorAll('span')].find(el => el.textContent === 'Alice')!; click(alice.parentElement!);
    click([...modal.querySelectorAll('button')].find(el => el.textContent?.trim() === t('common.delete'))!); await settle();
    const reassign = document.querySelector('[aria-label="'+t('speakers.reassign')+'"]')!;
    click([...reassign.querySelectorAll('button')].find(el => el.textContent === t('common.delete'))!);
    click(button(t('action.save'))); await settle();
    click([...modal.querySelectorAll('button')].find(el => el.textContent === t('common.close'))!); await settle();
    shortcut('s'); await settle();
    assert(!stored().speakers.A && stored().content[0].speaker === 'B', 'Style save serializes speaker deletion and subtitle reassignment together');
    shortcut('z'); await settle(); shortcut('s'); await settle();
    assert(stored().speakers.A && stored().content[0].speaker === 'A', 'One undo restores both the speaker and its subtitle references');
    await new Promise(resolve => setTimeout(resolve, 1700)); shortcut('s'); await settle();
    await new Promise(resolve => setTimeout(resolve, 1500));
    assert([...document.querySelectorAll('[role="status"]')].some(node => node.textContent?.includes(t('app.projectSaved'))), 'A previous toast timer cannot clear the latest repeated message');
    return ['完整应用：一次输入一次撤销、保存提交草稿、角色删除与字幕改绑原子撤销', '提示消息：连续相同提示重新计时'];
  } finally { flushSync(() => root.unmount()); localStorage.clear(); }
}
