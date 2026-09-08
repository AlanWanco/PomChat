import { stripVTControlCharacters } from 'node:util';
import type { BiliupTemplate } from '../src/biliup';
import { validateBiliupSchedule, validateBiliupTemplate } from '../src/biliup';

export function plainTerminalLine(text: string): string {
  // Strip remaining terminal control bytes, keeping tab/newline/carriage return.
  return Array.from(stripVTControlCharacters(text)).filter((character) => {
    const code = character.charCodeAt(0);
    return code !== 127 && (code >= 32 || code === 9 || code === 10 || code === 13);
  }).join('');
}

export function parseBiliupProgress(text: string): number | null {
  const line = plainTerminalLine(text);
  const match = line.match(/([\d.]+)\s*(B|[KMGT]i?B)\s*\/\s*([\d.]+)\s*(B|[KMGT]i?B)/i);
  if (match) {
    const bytes = (value: string, unit: string) => Number(value) * (unit.toLowerCase().includes('i') ? 1024 : 1000) ** Math.max(0, 'bkmgt'.indexOf(unit[0].toLowerCase()));
    const total = bytes(match[3], match[4]);
    const ratio = bytes(match[1], match[2]) / total;
    if (total > 0 && Number.isFinite(ratio)) return Math.min(100, Math.max(0, ratio * 100));
  }
  const percent = line.match(/(?:^|\s)(\d+(?:\.\d+)?)%/);
  return percent ? Math.min(100, Math.max(0, Number(percent[1]))) : null;
}

export function buildBiliupUploadArgs(template: BiliupTemplate, filename: string, cookieFile: string, help: string): string[] {
  const error = validateBiliupTemplate(template);
  if (error) throw new Error(error);
  const scheduleError = validateBiliupSchedule(template.dtime);
  if (scheduleError) throw new Error(scheduleError);
  const title = Array.from(template.title.trim()).slice(0, 80).join('');
  if (!title) throw new Error('template');
  const args = ['--user-cookie', cookieFile, 'upload'];
  const add = (flag: string, value?: string | number) => {
    if (!new RegExp(`${flag}(?:[\\s=,]|$)`).test(help)) throw new Error('unsupported');
    args.push(flag);
    if (value !== undefined) args.push(String(value));
  };
  add('--title', title);
  add('--tid', template.tid);
  add('--tag', template.tag.replaceAll('，', ','));
  add('--copyright', template.copyright);
  add('--limit', template.limit);
  for (const [flag, value] of [
    ['--source', template.source], ['--desc', template.desc.replace(/\r\n?/g, '\n')], ['--dynamic', template.dynamic],
    ['--cover', template.cover], ['--dtime', template.dtime], ['--line', template.line], ['--submit', template.submit],
  ]) if (value) add(flag, value);
  for (const [flag, enabled] of [['--no-reprint', template.noReprint], ['--dolby', template.dolby], ['--hires', template.hires], ['--charging-pay', template.chargingPay], ['--up-selection-reply', template.upSelectionReply]] as const) {
    if (enabled) add(flag, 1);
  }
  if (template.interactive) add('--interactive', template.interactive);
  if (template.missionId) add('--mission-id', template.missionId);
  if (template.isOnlySelf) add('--is-only-self', template.isOnlySelf);
  if (template.closeReply) add('--up-close-reply');
  if (template.closeDanmu) add('--up-close-danmu');
  args.push('--', filename);
  return args;
}

export function redactBiliupLine(line: string, secrets: string[]): string {
  let safe = plainTerminalLine(line);
  for (const secret of secrets) if (secret.length > 2) safe = safe.split(secret).join('[redacted]');
  if (/(?:sessdata|bili_jct|access_token|refresh_token|cookie_info|cookie:|authorization|auth_code)/i.test(safe)) {
    return '[credential output hidden]';
  }
  return safe.slice(0, 2000);
}
