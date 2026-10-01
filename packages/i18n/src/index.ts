import en from '../locales/en.json';
import si from '../locales/si.json';
import ta from '../locales/ta.json';

export type Locale = 'en' | 'si' | 'ta';

export const LOCALES: Record<Locale, { name: string; nativeName: string }> = {
  en: { name: 'English', nativeName: 'English' },
  si: { name: 'Sinhala', nativeName: 'සිංහල' },
  ta: { name: 'Tamil', nativeName: 'தமிழ்' },
};

export const dictionaries = {
  en,
  si,
  ta,
} as const;

export type TranslationSchema = typeof en;

export function getDictionary(locale: Locale): TranslationSchema {
  return (dictionaries[locale] || dictionaries.en) as TranslationSchema;
}

export function translatePath(
  locale: Locale,
  path: string,
  fallback = ''
): string {
  const dict = getDictionary(locale);
  const keys = path.split('.');
  let current: any = dict;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return fallback || path;
    }
  }

  return typeof current === 'string' ? current : fallback || path;
}

export { en, si, ta };
