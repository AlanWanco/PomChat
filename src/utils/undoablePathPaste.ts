import {
  captureTextInsertion,
  insertTextUndoably,
  type EditableTextControl,
  type TextInsertionSnapshot,
} from './undoableTextInput';

export interface UndoablePathPasteOptions<TIdentity> {
  identityRef: { current: TIdentity };
  extractPath: (event: React.ClipboardEvent<HTMLInputElement>) => string;
  extractImageFile: (event: React.ClipboardEvent<HTMLInputElement>) => File | null;
  canSaveImage: () => boolean;
  targetOwner?: string;
  saveImage: (file: File, identity: TIdentity) => Promise<string>;
  afterInsert?: (path: string, identity: TIdentity, target: EditableTextControl) => void | Promise<void>;
}

export function handleUndoablePathPaste<TIdentity>(
  event: React.ClipboardEvent<HTMLInputElement>,
  options: UndoablePathPasteOptions<TIdentity>,
) {
  const path = options.extractPath(event);
  const imageFile = options.extractImageFile(event);
  if (!path && (!imageFile || !options.canSaveImage())) return;

  const insertion: TextInsertionSnapshot = captureTextInsertion(event.currentTarget);
  const identity = options.identityRef.current;
  event.preventDefault();

  const applyPath = (value: string, isAsync: boolean) => {
    if (options.identityRef.current !== identity) return;
    if (isAsync && options.targetOwner && insertion.target.dataset.pasteOwner !== options.targetOwner) return;
    const inserted = insertTextUndoably(insertion, value, {
      replaceAll: true,
      abortIfChanged: isAsync,
      abortIfFocusChanged: isAsync,
    });
    if (!inserted) return;
    void Promise.resolve(options.afterInsert?.(value, identity, insertion.target)).catch((error: unknown) => {
      console.error('Failed to complete pasted path:', error);
    });
  };

  if (path) {
    applyPath(path, false);
    return;
  }

  void options.saveImage(imageFile!, identity).then((savedPath) => {
    if (savedPath) applyPath(savedPath, true);
  }).catch((error: unknown) => {
    console.error('Failed to paste clipboard image:', error);
  });
}
