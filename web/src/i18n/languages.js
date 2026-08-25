// The 5 supported UI languages. Labels are endonyms (each language's own
// name for itself, e.g. "Deutsch" not "German") -- shown as-is regardless
// of which language is currently active, since that's how every language
// picker works (iOS, WhatsApp, Instagram): a reader looks for the name of
// their own language, not a translation of it into whatever's currently
// selected. Order matches the app's original language (German) first,
// then the four added for this feature.
export const LANGUAGES = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
];

// Locale codes for Date.prototype.toLocaleDateString/toLocaleTimeString
// (weekday/month names, date order) -- separate from the UI string
// dictionary since these drive a browser API, not a lookup.
export const DATE_LOCALES = {
  de: 'de-DE',
  en: 'en-GB',
  it: 'it-IT',
  fr: 'fr-FR',
  es: 'es-ES',
};

export function isSupportedLanguage(code) {
  return LANGUAGES.some((l) => l.code === code);
}
