import en from '../i18n/en.json';
import am from '../i18n/am.json';

export type Lang = 'en' | 'am';
const dict: Record<Lang, Record<string, string>> = { en, am };

export function t(lang: Lang, key: string, params: Record<string, string | number> = {}): string {
  const raw = dict[lang][key] ?? dict.en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ''));
}

export function pickLang(acceptLanguage?: string, query?: string): Lang {
  if (query === 'am' || query === 'en') return query;
  const first = (acceptLanguage ?? '').toLowerCase().split(',')[0]?.trim() ?? '';
  return first.startsWith('am') ? 'am' : 'en';
}
