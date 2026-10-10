import { useId, useRef, useState, type InputHTMLAttributes } from 'react';
import { parseTimeInput, correctTimeEndpoint } from '../../utils/timeInput';
import { translate, type Language } from '../../i18n';
export function TimeInput({ value, onValueChange, field, start, end, language, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string; onValueChange: (value: string) => void; field: 'start' | 'end'; start: number; end: number; language: Language;
}) {
  const [error, setError] = useState('');
  const original = useRef(value);
  const id = useId();
  const t = (key: string) => translate(language, key);
  const commit = () => {
    const parsed = parseTimeInput(value);
    if (parsed === null) { onValueChange(original.current); setError(t('input.timeInvalid')); return; }
    const next = correctTimeEndpoint(parsed, field, start, end);
    onValueChange(String(next)); setError(next === parsed ? '' : t('input.timeRange'));
    original.current = String(next);
  };
  return <label className="min-w-0 flex flex-col gap-1 text-xs">
    <span>{t(`input.${field}`)}</span>
    <input {...props} value={value} type="text" aria-describedby={id} onFocus={() => { original.current = value; }}
      onChange={e => { onValueChange(e.target.value); setError(''); }} onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onValueChange(original.current); setError(''); }
      }} />
    <span id={id} role={error ? 'status' : undefined}>{error || t('input.timeHint')}</span>
  </label>;
}
