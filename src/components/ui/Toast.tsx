import { createPortal } from 'react-dom';
export type ToastType = 'success' | 'info' | 'warning' | 'error';
export function Toast({ message, type = 'info', isDarkMode = false }: { message: string; type?: ToastType; isDarkMode?: boolean }) {
  const colors = { success: '#16a34a', info: '#2563eb', warning: '#b45309', error: '#dc2626' };
  const symbols = { success: '✓', info: 'ⓘ', warning: '⚠', error: '✕' };
  return createPortal(<div role={type === 'error' ? 'alert' : 'status'} className="fixed top-16 left-1/2 -translate-x-1/2 max-w-[90vw] rounded-xl border px-4 py-3 text-sm shadow-xl flex gap-2" style={{ zIndex: 10000, background: isDarkMode ? '#111827' : '#fff', color: isDarkMode ? '#f3f4f6' : '#111827', borderColor: colors[type] }}>
    <span aria-hidden="true" style={{ color: colors[type] }}>{symbols[type]}</span>{message}
  </div>, document.body);
}
