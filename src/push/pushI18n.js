// Push notification strings for the 5 languages web/src/i18n/languages.js
// supports -- a separate, backend-only module rather than importing the
// frontend's web/src/i18n/translations.js directly, since the two are
// independent npm packages (kickradar-backend at the repo root,
// kickradar-web under web/) and this only needs a handful of strings, not
// the whole UI dictionary.
//
// Never translated here, same policy as the frontend's own translations.js:
// club/player names and league names stay as-is regardless of language.
//
// lineupTitle: confirmed live (web search) that football media in every
// one of these languages announces a match's lineups as a plural,
// "official" noun phrase -- "formazioni ufficiali" (Soccerway/Goal.it),
// "les compositions officielles" (Footmercato/Soccerway), "alineaciones
// oficiales/confirmadas" (LaLiga coverage), German outlets' "(offizielle)
// Aufstellungen" -- not the singular "confirmed X" phrasing this
// originally used (caught live: Italian "Formazione confermata" isn't
// real usage, "Formazioni ufficiali" is). Reuses each language's own
// "official" adjective from web/src/i18n/translations.js's
// lineup.official field, just pluralized, for consistency with the rest
// of the app's own word choice.
//
// rumor: also confirmed live -- and also caught the same mistake as
// lineupTitle originally had. This first read "Neues Gerücht"/"New
// rumor"/"Nuova voce di mercato"/"Nouvelle rumeur"/"Nuevo rumor", a "new
// X" prefix invented without checking real usage, inconsistent with
// `official` right next to it (which was already bare). Real transfer
// coverage uses the bare noun as a category tag, not "new + noun": kicker.de
// and sport1.de's own transfer tickers are literally headed "Transfers &
// Gerüchte"; RMC Sport/Foot Mercato (the exact sites this project scrapes
// -- see footmercato.js) label their own stories "RUMEUR" bare, alongside
// "INFO" and "OFFICIEL"; Italian transfer sites use "voce/voci di
// mercato" bare; Spanish coverage the same ("Rumores y noticias de
// fichajes"). Now reuses each language's own bare noun from
// translations.js's transfers.rumor field, matching `official` being
// bare too.
export const PUSH_STRINGS = {
  de: {
    official: 'Offiziell',
    rumor: 'Gerücht',
    summaryTitle: (n) => `${n} neue Transfer-Meldungen`,
    lineupTitle: 'Offizielle Aufstellungen',
  },
  en: {
    official: 'Official',
    rumor: 'Rumor',
    summaryTitle: (n) => `${n} new transfer updates`,
    lineupTitle: 'Official lineups',
  },
  it: {
    official: 'Ufficiale',
    rumor: 'Voce di mercato',
    summaryTitle: (n) => `${n} nuovi aggiornamenti di mercato`,
    lineupTitle: 'Formazioni ufficiali',
  },
  fr: {
    official: 'Officiel',
    rumor: 'Rumeur',
    summaryTitle: (n) => `${n} nouvelles infos transferts`,
    lineupTitle: 'Compositions officielles',
  },
  es: {
    official: 'Oficial',
    rumor: 'Rumor',
    summaryTitle: (n) => `${n} nuevas noticias de fichajes`,
    lineupTitle: 'Alineaciones oficiales',
  },
};

export const SUPPORTED_PUSH_LANGUAGES = Object.keys(PUSH_STRINGS);

export function pushStringsFor(language) {
  return PUSH_STRINGS[language] ?? PUSH_STRINGS.de;
}
