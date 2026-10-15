import { beginNumberEdit, endNumberEdit } from '../../utils/inputSession';
import React, { useEffect, useLayoutEffect, useId, useRef, useState, type InputHTMLAttributes } from 'react';
import { translate, type Language } from '../../i18n';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'step'> & {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  parseValue?: (raw: string) => number | null;
  language: Language;
};

export function NumberInput({ value, onValueChange, min = -Infinity, max = Infinity, step = 1, integer = false, parseValue, language, ...props }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const initial = useRef(value);
  const latest = useRef(value);
  const id = useId();
  const t = (key: string) => translate(language, key);
  const parse = (raw: string) => parseValue ? (parseValue(raw) ?? NaN) : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw.trim()) ? Number(raw) : NaN;
  useLayoutEffect(() => {
    if (props['aria-label'] || props['aria-labelledby']) return;
    const node = input.current;
    const label = node?.parentElement?.parentElement?.querySelector('span, label');
    if (label?.textContent && node) node.setAttribute('aria-label', label.textContent);
  });
  const accent = 'var(--podchat-accent, currentColor)';
  const stepperStyle = {
    color: accent,
    borderColor: `color-mix(in srgb, ${accent} 33%, transparent)`,
    backgroundColor: `color-mix(in srgb, ${accent} 9%, transparent)`,
  } as React.CSSProperties;
  const normalize = (next: number) => Math.max(min, Math.min(max, integer ? Math.round(next) : next));
  const publish = (next: number) => { latest.current = next; onValueChange(next); };
  const commit = () => {
    beginNumberEdit(input.current);
    const raw = input.current?.value ?? String(value);
    const parsed = parse(raw);
    const next = Number.isFinite(parsed) ? normalize(parsed) : latest.current;
    setMessage(!Number.isFinite(parsed) ? t('input.restored') : next !== parsed ? t('input.corrected') : '');
    setDraft(String(next));
    if (next !== value) publish(next);
    window.dispatchEvent(new Event('pomchat:input-commit')); endNumberEdit();
  };
  const changeBy = (direction: number) => {
    beginNumberEdit(input.current);
    const parsed = parse(input.current?.value ?? String(value));
    const next = normalize(Number(((Number.isFinite(parsed) ? parsed : value) + direction * step).toFixed(10)));
    setDraft(String(next)); setMessage(''); publish(next);
  };
  useEffect(() => () => { endNumberEdit(); }, []);
  useEffect(() => {
    const node = input.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (document.activeElement !== node || node.disabled || event.deltaY === 0) return;
      event.preventDefault(); event.stopPropagation(); changeBy(event.deltaY < 0 ? 1 : -1);
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  });
  return <div className="relative min-w-0">
    <input {...props} className={`${props.className ?? ''} pr-8`} ref={input} type="text" inputMode={parseValue ? 'text' : 'decimal'} role="spinbutton" data-number-draft="true"
      aria-valuenow={value} aria-valuemin={Number.isFinite(min) ? min : undefined} aria-valuemax={Number.isFinite(max) ? max : undefined}
      aria-describedby={message ? id : props['aria-describedby']} value={draft ?? String(value)}
      onFocus={(event) => { beginNumberEdit(input.current); initial.current = value; latest.current = value; setDraft(String(value)); props.onFocus?.(event); }}
      onChange={(event) => {
        beginNumberEdit(input.current);
        const raw = event.target.value; setDraft(raw); setMessage('');
        const next = parse(raw);
        if (Number.isFinite(next) && next >= min && next <= max && (!integer || Number.isInteger(next))) publish(next);
      }}
      onBlur={(event) => { commit(); setDraft(null); props.onBlur?.(event); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation(); beginNumberEdit(input.current); setDraft(String(initial.current)); setMessage(''); publish(initial.current);
          window.dispatchEvent(new Event('pomchat:input-commit')); endNumberEdit();
        } else if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); commit(); initial.current = latest.current; }
        else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); changeBy(event.key === 'ArrowUp' ? 1 : -1); }
        props.onKeyDown?.(event);
      }} />
    <div className="absolute inset-y-0 right-1 flex flex-col justify-center gap-0.5">
      {/* Centred and bounded by the input, matching the pre-0.5.1 control.
          The accent variable follows the app theme, so steppers keep the themed colours. */}
      <button type="button" aria-label={t('input.increase')} disabled={props.disabled} data-stepper="up" className="h-3.5 w-4 rounded border text-[0.5625rem] leading-none" style={stepperStyle} onMouseDown={(e) => e.preventDefault()} onClick={() => { input.current?.focus(); changeBy(1); }}>▲</button>
      <button type="button" aria-label={t('input.decrease')} disabled={props.disabled} data-stepper="down" className="h-3.5 w-4 rounded border text-[0.5625rem] leading-none" style={stepperStyle} onMouseDown={(e) => e.preventDefault()} onClick={() => { input.current?.focus(); changeBy(-1); }}>▼</button>
    </div>
    {message && <p id={id} role="status" className="text-xs mt-1 text-amber-600">{message}</p>}
  </div>;
}
