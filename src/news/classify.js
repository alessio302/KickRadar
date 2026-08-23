// Per-source "official vs. rumor" keyword rules (briefing: each source needs
// its own classification rules, since headline conventions differ by outlet
// and language). Matching is case-insensitive on title + summary.
const RULES = {
  tuttomercatoweb: {
    official: [
      'ufficiale', 'è ufficiale', 'comunicato ufficiale', 'ha firmato',
      'firma con', 'firma fino al', 'annuncio ufficiale', 'accordo raggiunto',
    ],
  },
  kicker: {
    official: [
      'offiziell', 'ist perfekt', 'ist fix', 'unterschreibt', 'wechselt fest zu',
      'unterschreibt bis', 'bestätigt den wechsel', 'vollzogen',
    ],
  },
  skysports: {
    official: [
      'confirmed', 'official', 'signs for', 'signs a', 'completes move',
      'done deal', 'have signed', 'has signed', 'announce the signing',
    ],
  },
  rmcsport: {
    official: [
      'officiel', "c'est officiel", "s'engage", 'a signé', 'signe',
      'officialise', "en passe de s'engager",
    ],
  },
};

export function classifyOfficial(sourceKey, text) {
  const rules = RULES[sourceKey];
  if (!rules) return false;
  const haystack = text.toLowerCase();
  return rules.official.some((needle) => haystack.includes(needle));
}
