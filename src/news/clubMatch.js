import { normalize } from '../util/normalize.js';

// Casual media references routinely drop a club's founding-year/number
// token even when it sits in the middle of the name, not just at the end
// ("Bayer Leverkusen" for official "Bayer 04 Leverkusen") -- confirmed
// live: this broke plain substring matching in both directions (neither
// string contains the other once "04" sits between "bayer" and
// "leverkusen"), which meant Facundo Medina's Bundesliga side never
// resolved to a club_id at all. Stripping standalone number tokens before
// a second comparison pass tolerates that without loosening the actual
// word-boundary matching.
function stripNumbers(text) {
  return text.replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function namesMatch(candidate, candidateNoNum, normName) {
  if (candidate === normName || candidate.includes(normName) || normName.includes(candidate)) {
    return true;
  }
  const normNameNoNum = stripNumbers(normName);
  if (candidateNoNum.length < 3 || normNameNoNum.length < 3) return false;
  return candidateNoNum === normNameNoNum || candidateNoNum.includes(normNameNoNum) || normNameNoNum.includes(candidateNoNum);
}

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
//
// Picks the BEST substring match, not the first one found -- confirmed
// live: "Barcelona" (Laporta being quoted as Barça's own president, a
// completely standard short reference) is also a literal substring of RCD
// Espanyol de Barcelona's full name, so a single greedy first-match pass
// mismatched a Barcelona transfer story to Espanyol purely because of
// clubs-table iteration order. Among every club whose name/alias contains
// (or is contained by) the candidate, the one whose length is closest to
// the candidate's is preferred -- "FC Barcelona" over "RCD Espanyol de
// Barcelona" for a "Barcelona" candidate -- since an accidental substring
// hit on a much longer, unrelated name is essentially always the wrong
// answer. An exact match (candidate === normName) always wins outright,
// no need to compare lengths.
export function resolveClub(candidateName, clubs) {
  if (!candidateName) return null;
  const candidate = normalize(candidateName);
  if (candidate.length < 3) return null; // too short to match safely (e.g. "OM")
  const candidateNoNum = stripNumbers(candidate);

  let bestMatch = null;
  let bestDiff = Infinity;

  for (const club of clubs) {
    // short_name matters here for the exact same reason aliases does: a
    // real colloquial name in everyday use ("Man City", "Barça", "HSV",
    // "M'gladbach", "Atleti") that ISN'T a literal substring of the
    // official name -- confirmed live: "Man City" produced a duplicate
    // transfer card against "Manchester City FC" because resolveClub()
    // only ever checked club.name/aliases, never club.short_name, even
    // though the exact right value was sitting right there unused.
    const names = [club.name, club.short_name, ...(club.aliases || [])].filter(Boolean);
    for (const name of names) {
      const normName = normalize(name);
      if (normName.length < 3) continue;
      if (candidate === normName) return club;
      if (namesMatch(candidate, candidateNoNum, normName)) {
        const diff = Math.abs(normName.length - candidate.length);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestMatch = club;
        }
      }
    }
  }
  return bestMatch;
}
