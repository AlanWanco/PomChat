import { useId } from 'react';
import { Dialog } from './Dialog';
import { translate, type Language } from '../../i18n';
import { createThemeTokens } from '../../theme';

interface DraftGuardProps {
  language: Language;
  isDarkMode?: boolean;
  themeColor?: string;
  secondaryThemeColor?: string;
  busy?: boolean;
  error?: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function DraftGuard({
  language,
  isDarkMode = false,
  themeColor = '#9ca4b8',
  secondaryThemeColor = '#ed7e96',
  busy,
  error,
  onSave,
  onDiscard,
  onCancel,
}: DraftGuardProps) {
  const t = (key: string) => translate(language, key);
  const theme = createThemeTokens(themeColor, isDarkMode);
  const descriptionId = useId();
  const buttonClass = 'rounded-xl border px-4 py-2 text-sm transition-opacity hover:opacity-80 disabled:opacity-40';

  return <Dialog aria-label={t('draft.title')} aria-describedby={descriptionId} onClose={busy ? undefined : onCancel} onSave={busy ? undefined : onSave} className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4">
    <div className="w-full max-w-md overflow-hidden rounded-[28px] border shadow-2xl" style={{ background: `linear-gradient(180deg, ${theme.panelBgElevated} 0%, ${theme.panelBg} 68%, ${secondaryThemeColor}14 100%)`, borderColor: theme.border, color: theme.text }}>
      <div className="border-b px-6 py-5" style={{ borderColor: theme.border, backgroundColor: `${themeColor}10` }}>
        <h2 className="text-lg font-semibold">{t('draft.title')}</h2>
        <p id={descriptionId} className="mt-1 text-sm" style={{ color: theme.textMuted }}>{t('draft.description')}</p>
        {error && <p role="alert" className="mt-2 text-sm text-red-500">{error}</p>}
      </div>
      <div className="flex flex-wrap justify-end gap-2 px-6 py-4">
        <button type="button" disabled={busy} onClick={onCancel} className={buttonClass} style={{ borderColor: theme.border, backgroundColor: theme.panelBgSubtle, color: theme.textMuted }}>{t('common.cancel')}</button>
        <button type="button" disabled={busy} onClick={onDiscard} className={buttonClass} style={{ borderColor: `${secondaryThemeColor}55`, backgroundColor: `${secondaryThemeColor}12`, color: secondaryThemeColor }}>{t('draft.discard')}</button>
        <button type="button" disabled={busy} onClick={onSave} className={buttonClass} style={{ borderColor: secondaryThemeColor, backgroundColor: secondaryThemeColor, color: '#ffffff' }}>{t('action.save')}</button>
      </div>
    </div>
  </Dialog>;
}
