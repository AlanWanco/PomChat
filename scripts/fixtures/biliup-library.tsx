import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { BiliupLibraryBrowser } from '../../src/components/BiliupLibraryBrowser';
import type { BiliupApi } from '../../src/biliup';

let root: Root | undefined;
let api: BiliupApi;
const noop = () => {};
const successful = <T,>(value: T) => Promise.resolve({ ok: true, value });

export function renderBiliupLibraryFixture(supported: boolean, mode: 'new' | 'append' = 'new', hasSeasons = true, hasSections = true) {
  const calls: string[] = [];
  api = {
    load: async () => successful({} as never), save: async () => successful({} as never), check: async () => successful({} as never),
    inspect: async () => successful({ version: supported ? '1.2.9' : '1.2.8', seasonsSupported: supported }),
    seasons: async () => { calls.push('seasons'); return successful(hasSeasons ? [{ id: 10, title: 'Synthetic collection', sections: hasSections ? [{ id: 20, title: 'Main' }] : [] }] : []); },
    seasonContents: async (_directory, seasonId) => { calls.push(`contents:${seasonId}`); return successful({ id: seasonId, title: 'Synthetic collection', sections: [{ id: 20, title: 'Main', episodes: [{ id: 30, aid: 40, cid: 50, title: 'Synthetic episode' }] }] }); },
    videoParts: async (videoId) => { calls.push(`parts:${videoId}`); return successful({ aid: 40, bvid: 'BV1abC2deF34', title: 'Synthetic video', pages: [{ cid: 50, page: 1, part: 'Part one', duration: 90 }, { cid: 51, page: 2, part: 'Part two', duration: 30 }] }); },
    testLines: async () => successful([]), login: async () => successful(undefined), attachCaptchaView: async () => successful(undefined),
    dismissCaptchaView: async () => successful(undefined), input: async () => successful(undefined), upload: async () => successful(undefined),
    cancel: async () => successful(undefined), state: async () => successful({} as never), onState: () => noop,
  } as BiliupApi;
  root ??= createRoot(document.getElementById('root')!);
  let selectedSectionId = '';
  const render = () => <BiliupLibraryBrowser api={api} directory="/synthetic/biliup" capabilities={{ version: supported ? '1.2.9' : '1.2.8', seasonsSupported: supported }} mode={mode} onTargetVideoChange={noop} isDarkMode={false} themeColor="#9ca4b8" secondaryThemeColor="#ed7e96" t={(key) => key} selectedSectionId={selectedSectionId} onSelectedSectionIdChange={(value) => { selectedSectionId = value; flushSync(render); }} onSelectedSectionLabelChange={(value) => { calls.push(`section-label:${value}`); }} />;
  flushSync(() => root!.render(render()));
  return calls;
}

export async function runBiliupLibraryTests() {
  const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
  const settle = async () => { for (let i = 0; i < 5; i += 1) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); };
  const clickButton = (label: string) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.includes(label));
    assert(button, `Missing library control ${label}`);
    flushSync(() => button!.click());
  };
  renderBiliupLibraryFixture(false, 'new');
  assert(document.documentElement.scrollWidth <= window.innerWidth, 'The library browser must fit a narrow viewport');
  await settle();
  const collectionLoad = [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.includes('biliup.library.loadSeasons'));
  assert(collectionLoad?.disabled, 'Collection browser must be disabled below v1.2.9');
  closeBiliupLibraryFixture();

  const calls = renderBiliupLibraryFixture(false, 'append');
  await settle();
  const appendInput = document.querySelector<HTMLInputElement>('input[aria-label="biliup.library.appendVideoId"]')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(appendInput, 'BV1abC2deF34');
  flushSync(() => appendInput.dispatchEvent(new Event('input', { bubbles: true })));
  clickButton('biliup.library.findAppendTarget');
  await settle();
  assert(document.body.textContent?.includes('Part one') && document.body.textContent?.includes('Part two'), 'Append mode must show all current P parts');
  assert(calls.includes('parts:BV1abC2deF34'), 'Append target lookup receives the BVID');
  closeBiliupLibraryFixture();

  const supportedCalls = renderBiliupLibraryFixture(true);
  assert(document.documentElement.scrollWidth <= window.innerWidth, 'The collection list must fit a narrow viewport');
  clickButton('biliup.library.loadSeasons'); await settle();
  clickButton('biliup.library.viewContents'); await settle();
  assert(document.body.textContent?.includes('Synthetic episode'), 'The collection viewer must list section episodes');
  const contentsNode = document.querySelector<HTMLElement>('[data-testid="biliup-season-contents"]')!;
  assert(contentsNode?.classList.contains('max-h-80') && contentsNode.classList.contains('overflow-y-auto'), 'Collection contents are contained within a bounded scroll area');
  const collapseButton = [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.includes('biliup.library.collapseContents'));
  assert(collapseButton?.getAttribute('aria-expanded') === 'true', 'Expanded contents expose their state and a collapse action');
  const collapseSelect = document.querySelector<HTMLSelectElement>('select[aria-label="biliup.library.seasons"]')!;
  assert(collapseSelect.classList.contains('h-9') && collapseButton!.classList.contains('h-9') && collapseSelect.parentElement?.classList.contains('items-center'), 'Season selector and view/collapse button share a fixed height and aligned row');
  clickButton('biliup.library.collapseContents');
  assert(!document.querySelector('[data-testid="biliup-season-contents"]'), 'Clicking collapse hides the collection contents');
  assert(supportedCalls.includes('seasons') && supportedCalls.includes('contents:10'), 'Collection browsing loads the owner seasons and selected season contents');
  const destinationSelect = document.querySelector<HTMLSelectElement>('select[aria-label="biliup.library.uploadDestination"]')!;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(destinationSelect, '20');
  flushSync(() => destinationSelect.dispatchEvent(new Event('change', { bubbles: true })));
  assert(supportedCalls.includes('section-label:Synthetic collection / Main'), 'Selecting a section exposes the collection and section name for upload confirmation');
  closeBiliupLibraryFixture();

  const noSeasonCalls = renderBiliupLibraryFixture(true, 'new', false);
  clickButton('biliup.library.loadSeasons'); await settle();
  assert(document.body.textContent?.includes('biliup.library.noSeasons'), 'An account with no collections gets a create-and-reload hint');
  assert(!document.querySelector('select[aria-label="biliup.library.uploadDestination"]'), 'No collection destination selector appears when the account has none');
  assert(noSeasonCalls.includes('seasons'), 'The empty fallback follows an actual empty collection response');
  closeBiliupLibraryFixture();

  renderBiliupLibraryFixture(true, 'new', true, false);
  clickButton('biliup.library.loadSeasons'); await settle();
  assert(document.body.textContent?.includes('biliup.library.noSections'), 'Collections without sections get a selectable-section fallback');
  assert(!document.querySelector('select[aria-label="biliup.library.uploadDestination"]'), 'No upload destination selector appears when no section is available');
  closeBiliupLibraryFixture();

  renderBiliupLibraryFixture(true, 'append');
  assert(!document.body.textContent?.includes('biliup.library.seasons'), 'Append mode must hide collection selection');
  assert(document.body.textContent?.includes('biliup.library.appendVideoId'), 'Append mode must provide target-video part lookup');
  assert(document.body.textContent?.includes('biliup.library.appendBrowserHint'), 'Append mode explains target verification');
  closeBiliupLibraryFixture();
  return ['biliup GUI：1.2.8 禁用合集，新建投稿可浏览合集，补充分P隐藏合集并显示目标分P查询'];
}

export function closeBiliupLibraryFixture() {
  if (root) flushSync(() => root!.unmount());
  root = undefined;
}
