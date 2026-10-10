import { createPortal, flushSync } from 'react-dom';
import { useLayoutEffect, useRef, type HTMLAttributes } from 'react';

import { dialogs } from '../../utils/dialogStack';
const focusable = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], [tabindex]')).filter(node => !node.matches(':disabled, [tabindex="-1"]') && node.getClientRects().length > 0);

/** The shared boundary owns focus and consumes Escape after field editors. */
export function Dialog({ children, onClose, onSave, ...props }: HTMLAttributes<HTMLDivElement> & { onClose?: () => void; onSave?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const save = useRef(onSave);
  useLayoutEffect(() => { close.current = onClose; save.current = onSave; });
  useLayoutEffect(() => {
    const node = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialogs.push(node);
    const frame = requestAnimationFrame(() => {
      if (dialogs.at(-1) === node) (focusable(node)[0] || node).focus();
    });
    const handleKey = (event: KeyboardEvent) => {
      if (dialogs.at(-1) !== node || event.defaultPrevented) return;
      const isComposing = event.isComposing || event.keyCode === 229;
      if (!isComposing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && save.current) {
        event.preventDefault(); event.stopImmediatePropagation();
        const activeInput = document.activeElement instanceof HTMLInputElement ? document.activeElement : null;
        flushSync(() => activeInput?.blur());
        if (dialogs.at(-1) === node) {
          const targets = focusable(node);
          (activeInput && targets.includes(activeInput) ? activeInput : targets[0] || node).focus({ preventScroll: true });
        }
        save.current();
      }
      if (event.key === 'Escape') {
        if (isComposing) return;
        event.preventDefault(); event.stopImmediatePropagation(); close.current?.();
      }
      if (event.key === 'Tab') {
        const listbox = document.querySelector<HTMLElement>('[data-dialog-popup="true"]');
        const items = [...focusable(node), ...(listbox ? focusable(listbox) : [])];
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (!items.length) { event.preventDefault(); node.focus(); }
        else if (event.shiftKey ? index <= 0 : index === items.length - 1 || index < 0) {
          event.preventDefault(); items[event.shiftKey ? items.length - 1 : 0].focus();
        }
      }
    };
    const handleFocus = (event: FocusEvent) => {
      if (dialogs.at(-1) !== node) return;
      const target = event.target as HTMLElement;
      if (!node.contains(target) && !target.closest('[data-dialog-popup="true"]')) (focusable(node)[0] || node).focus();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('focusin', handleFocus);
    return () => {
      cancelAnimationFrame(frame);
      dialogs.splice(dialogs.indexOf(node), 1);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('focusin', handleFocus);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<div {...props} ref={ref} role="dialog" aria-modal="true" tabIndex={-1} aria-label={props['aria-label'] || 'PomChat'}>{children}</div>, document.body);
}
