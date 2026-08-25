// Overrides for the few clubs where the synced `clubs.short_code` (see
// src/football-api/syncClubs.js -- football-data.org's own `tla` field, or
// our deterministic fallback when that's missing) isn't the code actually
// used/recognized for that club. Confirmed live per entry, not a blanket
// re-derivation -- most synced codes are already fine as-is.
//
// - 1. FC Union Berlin: synced as "UNB", but "FCU" is the one actually
//   used across Bundesliga's own site and sports databases.
// - RC Strasbourg Alsace: synced as "RC " -- a literal trailing space, a
//   data-quality artifact from the source, not a real code at all. "RCS"
//   is the club's actual recognized abbreviation.
// - Nottingham Forest FC: synced as "NOT", but "NFO" is the one actually
//   used across ESPN/Premier League-adjacent databases.
// - ES Troyes AC: synced as "ETR", a plausible-looking guess, but the
//   club's real, universally recognized identity is "ESTAC" (their own
//   rebrand from 2000, avoiding a naming clash with a supermarket chain)
//   -- fits the short_code column's 5-char limit fine.
// - FC Barcelona: synced as "FCB" -- football-data.org's own tla for it,
//   but that's also FC Bayern München's tla (both clubs are literally
//   "FC <name>"). Harmless today (different leagues, never shown
//   together), but "BAR" is just as recognized for Barcelona and avoids
//   the two clubs sharing a code at all.
//
// Keyed by the exact `clubs.name` string, same as clubKitColors.js.
export const CLUB_SHORT_CODE_OVERRIDES = {
  '1. FC Union Berlin': 'FCU',
  'RC Strasbourg Alsace': 'RCS',
  'Nottingham Forest FC': 'NFO',
  'ES Troyes AC': 'ESTAC',
  'FC Barcelona': 'BAR',
};

export function clubShortCode(club) {
  return CLUB_SHORT_CODE_OVERRIDES[club?.name] ?? club?.short_code;
}
