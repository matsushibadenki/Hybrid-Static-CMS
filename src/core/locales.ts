export const contentLocales = ["en", "ja", "zh"] as const;

export type ContentLocale = (typeof contentLocales)[number];

export const localeLabels: Record<ContentLocale, string> = {
  en: "English",
  ja: "日本語",
  zh: "简体中文",
};

export function isContentLocale(value: unknown): value is ContentLocale {
  return typeof value === "string" && contentLocales.includes(value as ContentLocale);
}

export function contentLocaleFrom(value: unknown, fallback: ContentLocale = "en") {
  return isContentLocale(value) ? value : fallback;
}

export function localeHtmlLang(locale: ContentLocale) {
  return locale === "zh" ? "zh-CN" : locale;
}

export function cmsLocalePath(locale: ContentLocale) {
  return locale === "en" ? "/cms" : `/cms/${locale}`;
}

export function cmsLocaleDirectory(locale: ContentLocale) {
  return locale === "en" ? "" : locale;
}
