import i18next from "i18next";
import type { SupportedLanguage } from "@/i18n/language";
import { FALLBACK_LANGUAGE } from "@/i18n/language";

import de from "@/i18n/locales/de.json";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import hu from "@/i18n/locales/hu.json";
import it from "@/i18n/locales/it.json";
import ja from "@/i18n/locales/ja.json";
import pt from "@/i18n/locales/pt.json";
import zhHans from "@/i18n/locales/zh-Hans.json";

export type TranslationKey = string;

const resources = {
  en: { translation: en },
  de: { translation: de },
  es: { translation: es },
  pt: { translation: pt },
  it: { translation: it },
  fr: { translation: fr },
  "zh-Hans": { translation: zhHans },
  ja: { translation: ja },
  hu: { translation: hu },
} as const;

void i18next.init({
  resources,
  lng: FALLBACK_LANGUAGE,
  fallbackLng: FALLBACK_LANGUAGE,
  defaultNS: "translation",
  ns: ["translation"],
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
});

export function t(
  language: SupportedLanguage | undefined,
  key: TranslationKey,
  options?: Record<string, string | number>,
): string {
  const selected = language ?? FALLBACK_LANGUAGE;
  return i18next.t(key, { ...options, lng: selected, defaultValue: key });
}
