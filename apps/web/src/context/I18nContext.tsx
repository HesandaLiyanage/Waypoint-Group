import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Locale, translatePath, LOCALES } from '@waypoint/i18n';

interface I18nContextType {
  locale: Locale;
  setLocale: (loc: Locale) => void;
  t: (path: string, fallback?: string) => string;
  translateAsync: (text: string) => Promise<string>;
  locales: typeof LOCALES;
}

const I18nContext = createContext<I18nContextType | null>(null);

// Apply Google Translate by updating cookies and firing DOM events on the Google Translate widget
function applyGoogleTranslate(target: Locale) {
  const cookieValue = `/en/${target}`;
  const hostname = window.location.hostname;

  // Set cookies for both current host and parent domain
  document.cookie = `googtrans=${cookieValue}; path=/;`;
  document.cookie = `googtrans=${cookieValue}; path=/; domain=${hostname};`;
  if (hostname.includes('.')) {
    const rootDomain = hostname.split('.').slice(-2).join('.');
    document.cookie = `googtrans=${cookieValue}; path=/; domain=.${rootDomain};`;
  }

  // If selecting English, clear the translate cookie to restore original text
  if (target === 'en') {
    document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${hostname};`;
  }

  const triggerWidget = () => {
    const combo = document.querySelector('.goog-te-combo') as HTMLSelectElement | null;
    if (combo) {
      combo.value = target;
      combo.dispatchEvent(new Event('change'));
      return true;
    }
    return false;
  };

  if (!triggerWidget()) {
    // Retry shortly in case widget script is finishing load
    const interval = setInterval(() => {
      if (triggerWidget()) clearInterval(interval);
    }, 200);
    setTimeout(() => clearInterval(interval), 2000);
  }
}

// Memory and localStorage cache for programmatic translations
const memoryCache: Record<string, string> = {};

export async function translateTextWithGoogle(text: string, targetLang: Locale): Promise<string> {
  if (targetLang === 'en' || !text || text.trim() === '') return text;
  const key = `${targetLang}:${text}`;
  if (memoryCache[key]) return memoryCache[key];

  try {
    const cached = localStorage.getItem(`gt_${key}`);
    if (cached) {
      memoryCache[key] = cached;
      return cached;
    }
  } catch {
    // ignore localStorage errors
  }

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = data[0].map((item: any) => item[0]).join('');
        if (translated) {
          memoryCache[key] = translated;
          try {
            localStorage.setItem(`gt_${key}`, translated);
          } catch {
            // ignore storage quota errors
          }
          return translated;
        }
      }
    }
  } catch (err) {
    console.warn('[GoogleTranslate] Translation fallback warning:', err);
  }
  return text;
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(() => {
    return (localStorage.getItem('wp_locale') as Locale) || 'en';
  });

  useEffect(() => {
    if (locale && locale !== 'en') {
      applyGoogleTranslate(locale);
    }
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem('wp_locale', newLocale);
    } catch {
      // ignore
    }
    applyGoogleTranslate(newLocale);
  }, []);

  const t = useCallback((path: string, fallback?: string): string => {
    return translatePath(locale, path, fallback);
  }, [locale]);

  const translateAsync = useCallback((text: string): Promise<string> => {
    return translateTextWithGoogle(text, locale);
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, translateAsync, locales: LOCALES }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
};
