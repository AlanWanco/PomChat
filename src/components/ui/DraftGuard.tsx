import { Dialog } from './Dialog';
import { translate, type Language } from '../../i18n';
export function DraftGuard({ language, isDarkMode = false, busy, error, onSave, onDiscard, onCancel }: {
  language: Language; isDarkMode?: boolean; busy?: boolean; error?: string; onSave: () => void; onDiscard: () => void; onCancel: () => void;
}) {
  const t = (key: string) => translate(language, key);
  return <Dialog aria-label={t('draft.title')} onClose={busy ? undefined : onCancel} className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4">
    <div className="max-w-md rounded-xl border p-5 shadow-2xl space-y-4" style={{ backgroundColor: isDarkMode ? '#111827' : '#fff', color: isDarkMode ? '#f3f4f6' : '#111827' }}>
      <p>{t('draft.title')}</p>
      <p className="text-sm opacity-80">{t('draft.description')}</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} onClick={onSave}>{t('action.save')}</button>
        <button disabled={busy} onClick={onDiscard}>{t('draft.discard')}</button>
        <button disabled={busy} onClick={onCancel}>{t('common.cancel')}</button>
      </div>
    </div>
  </Dialog>;
}
