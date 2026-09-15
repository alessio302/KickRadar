// Shared by EuropaTab.jsx's own group-phase table and
// EuropaFixtureDetailOverlay.jsx's Tabellenplatz section (MatchStatisticsTab)
// -- moved here from EuropaTab.jsx so both can compute the same ranking from
// a fixtures array without duplicating the W/D/L/points logic.
//
// Team identity comes from home_team_short_name/home_team_name (no clubs
// table exists for UEFA fixtures, see syncEuropeanFixtures.js's own
// comment).
export function computeStandings(fixtures) {
  const teams = new Map();

  const entry = (name, badge) => {
    if (!teams.has(name)) {
      teams.set(name, { name, badge, played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0, points: 0 });
    }
    return teams.get(name);
  };

  for (const f of fixtures) {
    if (f.status !== 'finished' || f.home_score == null || f.away_score == null) continue;
    const home = entry(f.home_team_short_name || f.home_team_name, f.home_team_badge);
    const away = entry(f.away_team_short_name || f.away_team_name, f.away_team_badge);
    const hs = f.home_score;
    const as = f.away_score;
    home.played++; away.played++;
    home.gf += hs; home.ga += as;
    away.gf += as; away.ga += hs;
    if (hs > as) { home.won++; home.points += 3; away.lost++; }
    else if (hs < as) { away.won++; away.points += 3; home.lost++; }
    else { home.draw++; home.points++; away.draw++; away.points++; }
  }

  return [...teams.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.gf - b.ga - (a.gf - a.ga) ||
      b.gf - a.gf
  );
}
