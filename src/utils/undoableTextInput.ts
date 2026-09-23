export type EditableTextControl = HTMLInputElement | HTMLTextAreaElement;

export interface TextInsertionSnapshot {
  target: EditableTextControl;
  activeElement: Element | null;
  value: string;
  selectionStart: number;
  selectionEnd: number;
  selectionDirection: 'forward' | 'backward' | 'none';
}

export function captureTextInsertion(target: EditableTextControl): TextInsertionSnapshot {
  return {
    target,
    activeElement: document.activeElement,
    value: target.value,
    selectionStart: target.selectionStart ?? target.value.length,
    selectionEnd: target.selectionEnd ?? target.value.length,
    selectionDirection: target.selectionDirection ?? 'none',
  };
}

/**
 * Insert text through the browser editing command so Ctrl/Cmd+Z uses the
 * control's native undo stack and React receives a normal input event.
 */
export function insertTextUndoably(
  snapshot: TextInsertionSnapshot,
  text: string,
  options: { replaceAll?: boolean; abortIfChanged?: boolean; abortIfFocusChanged?: boolean } = {},
): boolean {
  const { target } = snapshot;
  if (!target.isConnected || target.disabled || target.readOnly) return false;

  const valueBefore = target.value;
  const activeBefore = document.activeElement;
  if (options.abortIfFocusChanged && activeBefore !== snapshot.activeElement) return false;
  const valueChangedWhilePending = valueBefore !== snapshot.value;
  if (options.abortIfChanged && valueChangedWhilePending) return false;
  const selectionChangedWhilePending =
    target.selectionStart !== snapshot.selectionStart || target.selectionEnd !== snapshot.selectionEnd;
  const useCurrentSelection = valueChangedWhilePending || selectionChangedWhilePending;
  const replaceAll = options.replaceAll;
  const start = replaceAll
    ? 0
    : useCurrentSelection
      ? (target.selectionStart ?? valueBefore.length)
      : Math.min(snapshot.selectionStart, valueBefore.length);
  const end = replaceAll
    ? valueBefore.length
    : useCurrentSelection
      ? (target.selectionEnd ?? start)
      : Math.min(snapshot.selectionEnd, valueBefore.length);
  const direction = useCurrentSelection ? (target.selectionDirection ?? 'none') : snapshot.selectionDirection;

  if (activeBefore !== target) target.focus({ preventScroll: true });
  target.setSelectionRange(start, end, direction);

  const commandAccepted = document.execCommand('insertText', false, text);
  let inserted = target.value !== valueBefore;
  if (!commandAccepted && !inserted) {
    target.setRangeText(text, start, end, 'end');
    const inputEvent = typeof InputEvent === 'undefined'
      ? new Event('input', { bubbles: true })
      : new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text });
    target.dispatchEvent(inputEvent);
    inserted = target.value !== valueBefore;
  }

  return inserted;
}
