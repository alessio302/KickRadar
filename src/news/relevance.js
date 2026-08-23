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
const RELEVANCE_KEYWORDS = {
  tuttomercatoweb: [
    'mercato', 'trasferiment', 'cession', 'cede', 'cedut', 'acquist',
    'prestito', 'firma', 'firmat', 'ingaggi', 'obiettivo', 'colpo',
    'trattativa', 'sondaggio', 'rinnovo', 'clausola', 'affare',
  ],
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
