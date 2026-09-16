import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/** Setters update the transaction value immediately, including inside React batches. */
export function useLiveState<T>(initial: T | (() => T)) {
  const [value, render] = useState(initial);
  const live = useRef(value);
  const set = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    const next = typeof action === 'function' ? (action as (previous: T) => T)(live.current) : action;
    if (Object.is(live.current, next)) return;
    live.current = next;
    render(next);
  }, []);
  return [value, set, live] as const;
}
