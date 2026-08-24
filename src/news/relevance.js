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
    'transfer', 'wechsel', 'verpflicht', 'leihe', 'ablöse', 'unterschreib',
    'engagiert', 'gerücht', 'medizincheck', 'neuzugang', 'abgang', 'vertrag',
  ],
  skysports: [
    'transfer', 'sign', 'signing', 'deal', 'move to', 'joins', 'on loan',
    'loan move', 'fee', 'medical', 'agree terms', 'bid for', 'target',
    'linked with', 'rumour', 'rumor', 'new club',
  ],
  rmcsport: [
    'mercato', 'transfert', 'signe', "s'engage", 'prêt', 'officialise',
    'rumeur', 'piste', 'intérêt', 'contrat', 'recrue', 'transferts',
  ],
};

export function isTransferRelevant(sourceKey, text) {
  const keywords = RELEVANCE_KEYWORDS[sourceKey];
  if (!keywords) return true; // no rule defined -> fail open, don't filter
  const haystack = text.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}
