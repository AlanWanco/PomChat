/** Parse the entire input; colon components use clock notation. */
export function parseTimeInput(raw: string): number | null {
  const value = raw.trim();
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) {
    const seconds = Number(value);
    return Number.isFinite(seconds) ? seconds : null;
  }
  if (!/^\d+:\d{1,2}(?:\.\d+)?$|^\d+:\d{1,2}:\d{1,2}(?:\.\d+)?$/.test(value)) return null;
  const parts = value.split(':').map(Number);
  if (parts.slice(1).some((part) => part >= 60)) return null;
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return Number.isFinite(seconds) ? seconds : null;
}

export function correctTimeEndpoint(value: number, field: 'start' | 'end', start: number, end: number) {
  return field === 'start' ? Math.max(0, Math.min(value, end)) : Math.max(start, value, 0);
}
