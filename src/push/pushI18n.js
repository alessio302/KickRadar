// Push notification strings for the 5 languages web/src/i18n/languages.js
// supports -- a separate, backend-only module rather than importing the
// frontend's web/src/i18n/translations.js directly, since the two are
// independent npm packages (kickradar-backend at the repo root,
// kickradar-web under web/) and this only needs a handful of strings, not
// the whole UI dictionary.
//
// Never translated here, same policy as the frontend's own translations.js:
// club/player names and league names stay as-is regardless of language.
export const PUSH_STRINGS = {
  de: {
    official: 'Offiziell',
    rumor: 'Neues Gerücht',
    summaryTitle: (n) => `${n} neue Transfer-Meldungen`,
    lineupTitle: 'Aufstellung bestätigt',
  },
  en: {
    official: 'Official',
    rumor: 'New rumor',
    summaryTitle: (n) => `${n} new transfer updates`,
    lineupTitle: 'Lineup confirmed',
  },
  it: {
    official: 'Ufficiale',
    rumor: 'Nuova voce di mercato',
    summaryTitle: (n) => `${n} nuovi aggiornamenti di mercato`,
    lineupTitle: 'Formazione confermata',
  },
  fr: {
    official: 'Officiel',
    rumor: 'Nouvelle rumeur',
    summaryTitle: (n) => `${n} nouvelles infos transferts`,
    lineupTitle: 'Composition confirmée',
  },
  es: {
    official: 'Oficial',
    rumor: 'Nuevo rumor',
    summaryTitle: (n) => `${n} nuevas noticias de fichajes`,
    lineupTitle: 'Alineación confirmada',
  },
};

export const SUPPORTED_PUSH_LANGUAGES = Object.keys(PUSH_STRINGS);

export function pushStringsFor(language) {
  return PUSH_STRINGS[language] ?? PUSH_STRINGS.de;
}
