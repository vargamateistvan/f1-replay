export const SUPPORTED_LANGUAGES = [
  "en",
  "de",
  "es",
  "pt",
  "it",
  "fr",
  "zh-Hans",
  "ja",
  "hu",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const FALLBACK_LANGUAGE: SupportedLanguage = "en";

const CHINESE_SIMPLIFIED_HINTS = ["zh-hans", "zh-cn", "zh-sg"];

type LanguageOption = {
  readonly code: SupportedLanguage;
  readonly label: string;
};

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Espanol" },
  { code: "pt", label: "Portugues" },
  { code: "it", label: "Italiano" },
  { code: "fr", label: "Francais" },
  { code: "zh-Hans", label: "Simplified Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "hu", label: "Magyar" },
] as const;

function normalizeLocale(input: string): string {
  return input.trim().toLowerCase();
}

export function languageFromLocale(input: string): SupportedLanguage {
  const locale = normalizeLocale(input);

  if (!locale) return FALLBACK_LANGUAGE;
  if (locale.startsWith("de")) return "de";
  if (locale.startsWith("es")) return "es";
  if (locale.startsWith("pt")) return "pt";
  if (locale.startsWith("it")) return "it";
  if (locale.startsWith("fr")) return "fr";
  if (locale.startsWith("ja")) return "ja";
  if (locale.startsWith("hu")) return "hu";

  if (
    locale.startsWith("zh") ||
    CHINESE_SIMPLIFIED_HINTS.some((hint) => locale.includes(hint))
  ) {
    return "zh-Hans";
  }

  return FALLBACK_LANGUAGE;
}

export function detectDefaultLanguage(): SupportedLanguage {
  if (typeof navigator === "undefined") return FALLBACK_LANGUAGE;

  const locales = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ].filter((value): value is string => typeof value === "string");

  for (const locale of locales) {
    const guessed = languageFromLocale(locale);
    if (guessed !== FALLBACK_LANGUAGE) return guessed;
  }

  return FALLBACK_LANGUAGE;
}
