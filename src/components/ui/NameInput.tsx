import { useLayoutEffect, useState, type InputHTMLAttributes, type RefObject } from 'react';
export function NameInput({ value, onCommit, onDraftChange, commitRef, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string; onCommit: (name: string) => boolean; onDraftChange: (dirty: boolean) => void; commitRef?: RefObject<(() => boolean) | null>;
}) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    if (draft === value) return true;
    const accepted = onCommit(draft);
    if (accepted) onDraftChange(false);
    return accepted;
  };
  useLayoutEffect(() => {
    if (commitRef) commitRef.current = commit;
    return () => { if (commitRef) commitRef.current = null; };
  });
  return <input {...props} value={draft} onChange={(e) => { setDraft(e.target.value); onDraftChange(e.target.value !== value); }}
    onBlur={commit} onKeyDown={(e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDraft(value); onDraftChange(false); }
    }} />;
}
