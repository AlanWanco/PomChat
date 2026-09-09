import { createContext, useContext, type Context } from 'react';
import type { Language } from '../i18n';
import type {
  BiliupPreferences,
  BiliupResult,
  BiliupState,
  BiliupUploadPlan,
} from '../biliup';

export interface BiliupAppearance {
  language: Language;
  isDarkMode: boolean;
  themeColor: string;
  secondaryThemeColor: string;
}

export interface BiliupContextValue {
  preferences: BiliupPreferences;
  state: BiliupState;
  loaded: boolean;
  autoUpload: boolean;
  error: string;
  canAutoUpload: boolean;
  open: () => void;
  setAutoUpload: (enabled: boolean) => void;
  setError: (error: string) => void;
  setAppearance: (appearance: BiliupAppearance) => void;
  save: (preferences: BiliupPreferences) => Promise<void>;
  prepare: (format: string) => Promise<BiliupUploadPlan | null>;
  upload: (plan: BiliupUploadPlan, filePath: string) => Promise<void>;
}

const hotContextStore = globalThis as typeof globalThis & { __pomchatBiliupContext?: Context<BiliupContextValue | null> };
export const BiliupContext = hotContextStore.__pomchatBiliupContext || createContext<BiliupContextValue | null>(null);
hotContextStore.__pomchatBiliupContext = BiliupContext;

export function unwrapBiliup<T>(result: BiliupResult<T>): T {
  if (!result.ok) throw new Error(result.error || 'input');
  return result.value as T;
}

export function useBiliup() {
  const context = useContext(BiliupContext);
  if (!context) throw new Error('BiliupProvider missing');
  return context;
}
