import { normalize } from '../util/normalize.js';

// Resolves a free-text club name (from LLM/regex extraction) against the
// league's curated `clubs` table, so from_club/to_club can carry a real FK
// (badges, filtering) instead of being free-standing text that's
// inconsistent across articles (confirmed live: the same club showed up as
// both "OM" and "Olympique de Marseille" in different rows).
//
// Deliberately conservative: exact match or a substring match in either
// direction against the club's curated name/aliases. No fuzzy/edit-distance
// matching -- a wrong match (mixing up two different clubs) is worse than
// no match, and a miss just means the raw string is kept as-is, so nothing
// is lost, only the FK/canonical-name upgrade.
export function resolveClub(candidateName, clubs) {
  if (!candidateName) return null;
  const candidate = normalize(candidateName);
  if (candidate.length < 3) return null; // too short to match safely (e.g. "OM")

  for (const club of clubs) {
    const names = [club.name, ...(club.aliases || [])];
    for (const name of names) {
      const normName = normalize(name);
      if (normName.length < 3) continue;
      if (candidate === normName || candidate.includes(normName) || normName.includes(candidate)) {
        return club;
      }
    }
  }
  return null;
}
