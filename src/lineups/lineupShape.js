// GOAL API lineup response -> this app's `lineups.players` jsonb shape.
// Shared by syncLineups.js (5 domestic leagues, keyed by club_id) and
// syncEuropeanLineups.js (UCL/UEL/UECL, keyed by team_name instead --
// those clubs aren't in our clubs table) so both providers' rows come out
// in the identical shape the frontend's LineupList/PitchFormation already
// render, with no per-provider branching needed there.

export function teamIsPopulated(team) {
  return Array.isArray(team?.initialLineup) && team.initialLineup.length > 0;
}

// GOAL API's own singular/plural mismatch with this app's existing
// position keys (web/src/i18n/translations.js's t.lineup.positions,
// inherited from Highlightly's enum) -- confirmed live GOAL API returns
// "Goalkeepers"/"Defenders"/"Midfielders"/"Forwards" (plural) per player,
// not the singular keys the frontend already translates. Normalized here
// so the frontend contract doesn't need to change for a provider swap.
const POSITION_SINGULAR = {
  Goalkeepers: 'Goalkeeper',
  Defenders: 'Defender',
  Midfielders: 'Midfielder',
  Forwards: 'Forward',
};
const ROW_ORDER = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];

// resolvePosition(entry) is an optional caller-supplied lookup returning
// this player's authoritative position (players.position, sourced from
// football-data.org -- see syncPlayerProfiles.js's own comment on why
// that wins over whatever GOAL API's lineup/squad data says), falling
// back to GOAL API's own per-match lineup tag when it returns nothing
// (a player never resolved into `players`, or the caller doesn't have a
// players table to resolve against at all -- syncEuropeanLineups.js's
// UEFA clubs aren't in our clubs table, so it never passes one).
//
// Confirmed live (2026-09-12, user report): showing GOAL API's own
// per-match tag here instead produced real, visible disagreements with
// the same player's profile card for a versatile player GOAL API
// categorizes differently for one specific match (e.g. a nominal
// defender fielded that game and tagged "Midfielder"). Using the same
// authoritative source everywhere a player's position is shown avoids
// that -- two labels for the same person reading differently looks like
// a bug even when each individually reflects its own source correctly.
function normalizePlayer(entry, resolvePosition) {
  const fallback = POSITION_SINGULAR[entry.playerPosition] || entry.playerPosition || null;
  return {
    id: entry.playerId,
    name: entry.lineupPlayer,
    number: entry.lineupNumber ? Number(entry.lineupNumber) : null,
    position: (resolvePosition && resolvePosition(entry)) || fallback,
    // Confirmed live: every lineup entry already carries this (GOAL API's
    // own CDN, e.g. https://media.goal-api.com/badges/players/96401_j-garcia.jpg)
    // -- no separate /players/:id call needed per player the way
    // playerProfileResolver.js needs for transfer stories.
    photo: entry.playerImage || null,
  };
}

// GOAL API's lineup entries are a flat list (confirmed live), not
// pre-grouped by formation line -- but each entry carries a sequential
// lineupPosition, and the match's own formation string (e.g. "4-2-3-1")
// is available alongside it. Confirmed live across 16 sampled lineup
// sides spanning back-three/four/five, single and double pivots, a
// diamond midfield and lopsided attacking lines: lineupPosition is a
// strict back-to-front sequence with the goalkeeper always first, and
// chunking the rest by the formation string's own digits reproduces the
// real tactical shape exactly -- including wing-backs whose broad
// `position` category (e.g. "Forward") disagrees with the line they
// actually played in that match (one sampled back-five had a
// Forward-tagged wing-back on *each* end of the same 5-player row). That
// broad category is a player's general profile, not the role played, so
// it's unsuitable for row grouping on its own -- it only remains as a
// per-player label and as the fallback below.
//
// Falls back to bucketing by the 4 broad categories (GK/DF/MF/FW)
// whenever the formation string is missing or its digits don't add up to
// the rest of the entries (a malformed/partial formation string, or GOAL
// API not fully reporting the lineup that run) -- both make the exact
// row split unverifiable, so this degrades to "correct membership, not
// necessarily the exact tactical shape" rather than guessing.
export function groupByFormationRows(entries, formation, resolvePosition) {
  const sorted = (entries ?? [])
    .slice()
    .sort((a, b) => Number(a.lineupPosition) - Number(b.lineupPosition))
    .map((entry) => normalizePlayer(entry, resolvePosition));

  const rowSizes = (formation || '')
    .split('-')
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  const expectedOutfield = rowSizes.reduce((a, b) => a + b, 0);

  if (sorted.length > 1 && rowSizes.length > 0 && expectedOutfield === sorted.length - 1) {
    const [goalkeeper, ...outfield] = sorted;
    const rows = [[goalkeeper]];
    let idx = 0;
    for (const size of rowSizes) {
      rows.push(outfield.slice(idx, idx + size));
      idx += size;
    }
    return rows;
  }

  return ROW_ORDER.map((pos) => sorted.filter((p) => p.position === pos)).filter((row) => row.length > 0);
}

// GOAL API's lineups response carries a `coach` field per side alongside
// startingLineups/substitutes -- confirmed live (diagnostic run against a
// real finished fixture, Real Sociedad vs Celta de Vigo 2026-09-03):
// `coach` is an ARRAY of one entry per side, shaped exactly like a normal
// lineup row (same fields startingLineups/substitutes entries have -- id,
// playerId, lineupPlayer, lineupNumber, playerPosition, playerImage, ...)
// with `type: "coach"` marking it apart from an actual player. The
// coach's name is in `lineupPlayer` (matching normalizePlayer() above,
// not a `.name` field as first guessed) -- `playerPosition`/`playerAge`
// on a coach entry carry garbage leftover player-schema values (e.g.
// "Goalkeepers", "18") and are ignored here.
function normalizeCoach(coach) {
  const entry = Array.isArray(coach) ? coach[0] : coach;
  if (!entry) return null;
  const name = entry.lineupPlayer || null;
  if (!name) return null;
  return { name, photo: entry.playerImage || null };
}

export function buildLineupTeam(section, formation, resolvePosition) {
  if (!section) return null;
  return {
    formation: null, // set by the caller from homeFormation/awayFormation, shared per fixture not per section
    initialLineup: groupByFormationRows(section.startingLineups, formation, resolvePosition),
    substitutes: (section.substitutes ?? []).map((entry) => normalizePlayer(entry, resolvePosition)),
    coach: normalizeCoach(section.coach),
  };
}
