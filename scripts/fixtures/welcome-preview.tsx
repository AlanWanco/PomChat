import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { WelcomeScreen } from '../../src/components/WelcomeScreen';
import type { Language } from '../../src/i18n';
let root: Root | undefined;
export async function renderWelcomePreview(language: Language, isDarkMode: boolean) {
  root ??= createRoot(document.getElementById('root')!);
  flushSync(() => root!.render(<WelcomeScreen language={language} isDarkMode={isDarkMode} themeColor={isDarkMode ? '#545454' : '#9ca4b8'} secondaryThemeColor="#ed7e96" onNewProject={() => {}} onOpenProject={() => {}} />));
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  await new Promise(resolve => setTimeout(resolve, 350)); // Let the theme transition finish before capturing.
  const cards = [...document.querySelectorAll('button')].filter(node => node.querySelector('h2'));
  return { overflow: document.documentElement.scrollWidth > innerWidth, titleTop: document.querySelector('h1')!.getBoundingClientRect().top, cards: cards.map(card => ({ top: card.getBoundingClientRect().top, left: card.getBoundingClientRect().left, bottom: card.getBoundingClientRect().bottom })) };
}
