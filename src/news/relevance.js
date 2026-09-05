// Second-stage filter: sources are scoped to football (or, best-effort, to
// a transfer section) at fetch time, but that alone isn't reliable enough --
// confirmed live: Sky Sports' generic feed pulled golf/rugby/darts/F1, and
// even a football-only feed still mixes in match reports, injury news,
// press-conference quotes etc. This keyword gate runs on every source
// (defense in depth, not just the ones known to need it) so only items that
// actually look like transfer news reach the `transfers` table.
//
// Errs toward inclusion: a false positive (a borderline item let through)
// is cheaper than a false negative (a real transfer silently dropped).
// tuttomercatoweb has no entry here on purpose (see below the map) --
// unlike the others, its feed is already the site's own "calciomercato"
// section (?s=calciomercato), so a second keyword gate on top is
// redundant, and Italian transfer-market idioms turned out far too varied
// for a fixed list. Confirmed live: real transfer stories were being
// silently dropped for using totally standard phrasing the list didn't
// have -- "nel mirino" (targeted), "verso" (heading to), "spinge per"
// (pushing for), "in pugno" (close to sealing), "contatti"/"pista"
// (contacts/lead), "trattando" (negotiating, not a substring of the
// listed "trattativa"). The LLM step right after this filter already
// reliably rejects non-transfer items from this same feed (match
// reports, interviews, multi-player roundup round-ups) on its own, so
// nothing is gained by pre-filtering here -- only stories lost.
const RELEVANCE_KEYWORDS = {
  kicker: [
    'transfer', 'wechsel', 'verpflicht', 'leih', 'ablöse', 'unterschreib',
    'engagiert', 'gerücht', 'medizincheck', 'neuzugang', 'abgang', 'vertrag',
    'rückkehr',
  ],
  skysports: [
    'transfer', 'sign', 'signing', 'deal', 'move to', 'move', 'joins',
    'on loan', 'loan move', 'fee', 'medical', 'agree terms', 'bid for',
    'target', 'linked with', 'rumour', 'rumor', 'new club',
  ],
  // footmercato has no entry here on purpose, same reasoning as
  // tuttomercatoweb/marca below: its feed is already the site's own
  // dedicated Ligue 1 transfers section (/france/ligue-1/transfert), not
  // a general football feed, so a second keyword gate is redundant. Its
  // predecessor rmcsport.js *did* need one (a general "Transferts" hub,
  // not Ligue-1-scoped) -- replaced because that scope mismatch, not the
  // relevance gate, turned out to be the real problem: most of what it
  // fetched didn't involve a Ligue 1 club at all (confirmed live via
  // diagnoseLigue1Sources.js/diagnoseLigue1Volume.js), so it burned LLM
  // calls on pan-European stories that runNewsScraper.js's league gate
  // would just drop anyway.
  //
  // marca has no entry here on purpose, same reasoning: its feed is
  // already the site's own "Mercado de Fichajes" section, not a general
  // football feed, so a second keyword gate is redundant -- and
  // confirmed live (diagnoseMarca.js) actively harmful.
  // A first-draft Spanish keyword list here was dropping real transfer
  // stories wholesale: "El Barça ficha a Livakovic" (bare "ficha", not
  // "ficha por"), "Sivera renueva hasta 2030" ("renueva" vs. the listed
  // "renovacion"), "El Mallorca apuntala la delantera con... Buksa"
  // ("apuntala" not listed at all) -- the same "idioms too varied for a
  // fixed list" problem, just in Spanish this time. The LLM extraction
  // step right after this filter already reliably rejects genuine
  // non-transfer items on its own (evergreen live-blog hub pages etc.),
  // so nothing is gained by pre-filtering here, only stories lost.
};

// Diacritic-insensitive on both sides -- confirmed live: kicker's feed
// silently failed the "neuzugang" keyword against a real headline reading
// "Neuzugänge" (ä vs a breaks plain substring containment), and separately
// "Frankfurt verleiht Wahi erneut nach Nizza" (a real loan story) had no
// keyword hit at all until 'leihe' was shortened to the 'leih' stem so it
// also covers the conjugated "verleiht".
const COMBINING_DIACRITICS = /[\u0300-\u036f]/g;
function normalize(text) {
  return text.normalize('NFD').replace(COMBINING_DIACRITICS, '').toLowerCase();
}

export function isTransferRelevant(sourceKey, text) {
  const keywords = RELEVANCE_KEYWORDS[sourceKey];
  if (!keywords) return true; // no rule defined -> fail open, don't filter
  const haystack = normalize(text);
  return keywords.some((keyword) => haystack.includes(normalize(keyword)));
}

// Every tracked league is men's football, but a source's own transfer
// section routinely covers a club's women's team under the same feed --
// confirmed live: tuttomercatoweb's Parma page mixed in "Femminile" transfer
// stories, and one of them (Hawa Cissoko) produced a stray transfers row
// whose destination club, an English side entirely outside our tracked
// leagues, then collided with an unrelated La Liga club's short_name during
// resolveClub() (see clubMatch.js's own comment on that). Filtering here,
// language-independent (checked against every source, not a per-source
// map like RELEVANCE_KEYWORDS), stops that whole class of story before it
// ever reaches extraction/resolution, not just this one symptom of it.
// Word-boundary matched, not plain substring -- confirmed while writing
// this: a naive haystack.includes() check against "damen" (German for
// "ladies", meant to catch "Frauen/Damen-Mannschaft") also lit up on the
// perfectly ordinary Spanish word "funda-MEN-tal", which would have
// silently dropped a large fraction of real transfer stories the moment
// this shipped. Every one of these is a short, generic-looking token by
// itself, so the same risk applies to all of them, not just this one.
const WOMENS_FOOTBALL_KEYWORDS = [
  'femminile', // Italian
  'frauen', 'damen', // German
  'women', 'ladies', // English
  'feminine', 'feminin', // French (accents already stripped by normalize())
  'femenino', 'femenina', // Spanish
];

export function isWomensFootball(text) {
  const haystack = normalize(text);
  return WOMENS_FOOTBALL_KEYWORDS.some((keyword) => new RegExp(`\\b${normalize(keyword)}\\b`, 'i').test(haystack));
}
