import { usePersistedState } from './usePersistedState.js';
import { getTranslations } from '../i18n/translations.js';
import { isSupportedLanguage } from '../i18n/languages.js';

// Best-effort guess from the browser's own language list on first launch
// (before the user has ever picked one explicitly) -- falls back to German,
// the app's original/default language, if none of navigator.languages
// matches a supported one.
function detectDefaultLanguage() {
  if (typeof navigator === 'undefined') return 'de';
  for (const tag of navigator.languages || [navigator.language]) {
    const code = tag?.slice(0, 2).toLowerCase();
    if (isSupportedLanguage(code)) return code;
  }
  return 'de';
}

export function useLanguage() {
  const [language, setLanguage] = usePersistedState('kickradar.language', detectDefaultLanguage());
  return { language, setLanguage, t: getTranslations(language) };
}
