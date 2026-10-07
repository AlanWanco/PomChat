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
  prepare: (format: string, projectName?: string) => Promise<BiliupUploadPlan | null>;
  upload: (plan: BiliupUploadPlan, filePath: string) => Promise<void>;
}

export type BiliupActionsContextValue = Omit<BiliupContextValue, 'state'> & {
  getState: () => BiliupState;
};
export type BiliupFlowState = Pick<BiliupState, 'busy' | 'kind' | 'phase' | 'qrImage' | 'captchaUrl' | 'captchaStatus' | 'error' | 'bvid'>;
export type BiliupProgressState = Pick<BiliupState, 'logs' | 'progress' | 'progressText'>;

type BiliupContextStore = typeof globalThis & {
  __pomchatBiliupContext?: Context<BiliupContextValue | null>;
  __pomchatBiliupActionsContext?: Context<BiliupActionsContextValue | null>;
  __pomchatBiliupFlowStateContext?: Context<BiliupFlowState | null>;
  __pomchatBiliupProgressContext?: Context<BiliupProgressState | null>;
};
const hotContextStore = globalThis as BiliupContextStore;
export const BiliupContext = hotContextStore.__pomchatBiliupContext || createContext<BiliupContextValue | null>(null);
export const BiliupActionsContext = hotContextStore.__pomchatBiliupActionsContext || createContext<BiliupActionsContextValue | null>(null);
export const BiliupFlowStateContext = hotContextStore.__pomchatBiliupFlowStateContext || createContext<BiliupFlowState | null>(null);
export const BiliupProgressContext = hotContextStore.__pomchatBiliupProgressContext || createContext<BiliupProgressState | null>(null);
hotContextStore.__pomchatBiliupContext = BiliupContext;
hotContextStore.__pomchatBiliupActionsContext = BiliupActionsContext;
hotContextStore.__pomchatBiliupFlowStateContext = BiliupFlowStateContext;
hotContextStore.__pomchatBiliupProgressContext = BiliupProgressContext;

export function unwrapBiliup<T>(result: BiliupResult<T>): T {
  if (!result.ok) throw new Error(result.error || 'input');
  return result.value as T;
}

export function useBiliup() {
  const context = useContext(BiliupContext);
  if (!context) throw new Error('BiliupProvider missing');
  return context;
}

export function useBiliupActions() {
  const context = useContext(BiliupActionsContext);
  if (!context) throw new Error('BiliupProvider missing');
  return context;
}

export function useBiliupFlowState() {
  const context = useContext(BiliupFlowStateContext);
  if (!context) throw new Error('BiliupProvider missing');
  return context;
}

export function useBiliupProgress() {
  const context = useContext(BiliupProgressContext);
  if (!context) throw new Error('BiliupProvider missing');
  return context;
}
