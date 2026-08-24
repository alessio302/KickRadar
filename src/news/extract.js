// Best-effort extraction of player/from-club/to-club out of a free-text
// headline. This is inherently fuzzy across four languages and outlets, so
// it degrades gracefully: on a miss, player_name/from_club/to_club stay
// null and the raw headline is still stored as `summary`, so nothing is
// lost for the user, only the structured fields are missing.
//
// Club matching uses each club's curated name + aliases (see `clubs` table),
// so it only ever recognizes clubs from the fixed per-league table, never
// arbitrary free text.

import { normalize } from '../util/normalize.js';

// Direction is inferred from the keyword immediately preceding a club
// mention (e.g. "...from Juventus", "...zu Bayern"), not from mention
// order -- headlines like "X joins Y from Z" put the destination before
// the origin, so position alone gets it backwards.
const DIRECTION_KEYWORDS = {
  tuttomercatoweb: { from: ['da', 'dal', 'dalla', 'dallo'], to: ['al', 'alla', 'allo', 'in', 'verso'] },
  kicker: { from: ['von'], to: ['zu', 'nach'] },
  skysports: { from: ['from'], to: ['to', 'joins', 'signs for', 'signs with'] },
  rmcsport: { from: ['de', 'du', 'quitte'], to: ['vers', 'au', 'à', 'a rejoint'] },
};

function findClubMentions(title, clubs) {
  const normTitle = normalize(title);
  const hits = [];
  for (const club of clubs) {
    const names = [club.name, ...(club.aliases || [])];
    for (const name of names) {
      const normName = normalize(name);
      const idx = normTitle.indexOf(normName);
      if (idx !== -1) {
        hits.push({ club, idx, end: idx + normName.length });
        break;
      }
    }
  }
  return hits.sort((a, b) => a.idx - b.idx);
}

function containsKeyword(segment, keywords) {
  return keywords.some((kw) => new RegExp(`(^|\\s)${kw}(\\s|$)`, 'i').test(segment));
}

// For each club mention, inspects the text right before it for a from/to
// keyword to decide its role. Ambiguous headlines (no keyword found) leave
// both roles null rather than guessing an order that's a coin flip.
function assignDirection(title, clubHits, sourceKey) {
  const keywords = DIRECTION_KEYWORDS[sourceKey];
  if (!keywords || clubHits.length < 2) return { fromClub: null, toClub: null };

  const normTitle = normalize(title);
  let fromClub = null;
  let toClub = null;
  let prevEnd = 0;

  for (const hit of clubHits) {
    const segment = normTitle.slice(prevEnd, hit.idx);
    if (!fromClub && containsKeyword(segment, keywords.from)) {
      fromClub = hit.club.name;
    } else if (!toClub && containsKeyword(segment, keywords.to)) {
      toClub = hit.club.name;
    }
    prevEnd = hit.end;
  }

  // Exactly one side inferred and exactly two clubs mentioned -> the other
  // mention is the remaining side.
  if (clubHits.length === 2) {
    if (fromClub && !toClub) {
      toClub = clubHits.find((h) => h.club.name !== fromClub)?.club.name ?? null;
    } else if (toClub && !fromClub) {
      fromClub = clubHits.find((h) => h.club.name !== toClub)?.club.name ?? null;
    }
  }

  return { fromClub, toClub };
}

// No player-name guessing here anymore -- confirmed live: the old
// "longest run of capitalized words" heuristic produced obvious garbage
// on German headlines ("Frankfurter Abwehrnot", "Scally Gladbachs Start"),
// since German capitalizes ordinary nouns too, not just proper names, so
// "capitalized word run" doesn't reliably mean "person's name" the way it
// does in English. A wrong guessed name is worse than none -- it creates
// a fake player record and can show a nonsense name on a real transfer
// card -- and this path only ever runs when the LLM extraction call
// itself failed (see runNewsScraper.js), so it's rare enough that losing
// the player name there (the club/official-flag fields still come
// through) is a fine tradeoff for not fabricating one.
export function extractTransferInfo(title, clubs, sourceKey) {
  const clubHits = findClubMentions(title, clubs);

  let fromClub = null;
  let toClub = null;
  if (clubHits.length >= 2) {
    ({ fromClub, toClub } = assignDirection(title, clubHits, sourceKey));
  } else if (clubHits.length === 1) {
    toClub = clubHits[0].club.name;
  }

  return { playerName: null, fromClub, toClub };
}
