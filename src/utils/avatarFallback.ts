import type { SyntheticEvent } from 'react';
export const AVATAR_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="#64748b"/><circle cx="40" cy="29" r="14" fill="#e2e8f0"/><path d="M12 76v-8a28 28 0 0 1 56 0v8" fill="#e2e8f0"/></svg>')}`;
export function handleAvatarError(event: SyntheticEvent<HTMLImageElement>) {
  if (event.currentTarget.src !== AVATAR_PLACEHOLDER) event.currentTarget.src = AVATAR_PLACEHOLDER;
}
