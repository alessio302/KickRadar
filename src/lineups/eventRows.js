// Shared REST-shaped (camelCase) match_events row builder -- used by both
// syncLineups.js (club_id-keyed domestic fixtures) and
// syncEuropeanLineups.js (team_name-keyed UEFA fixtures, no clubs table
// row -- see syncEuropeanFixtures.js's own comment), via `sideRef`
// returning exactly one of {club_id}/{team_name} per sql/054's own
// "exactly one set" contract. event_key uses GOAL API's own row id
// (goal:${id}/card:${id}/sub:${id}) -- unique WITHIN one call's response,
// but NOT stable across two separate calls for the same real event
// (confirmed live 2026-09-19, matchEventsReconciler.js's own top comment
// -- this file's comment used to claim otherwise). Only ever compared
// against the DB by matchEventsReconciler.js's own CONTENT matching
// (type+minute+player), never by this key alone, for exactly that reason
// -- see that file for how it and syncLiveEvents.js's own synthetic
// content-based key (buildLiveEventRows) coexist.
export function buildEventRowsFromRest(fixtureId, sideRef, { goals, cards, substitutions }) {
  const rows = [];

  for (const g of goals ?? []) {
    if (g.type !== 'GOAL') continue;
    const isHomeField = g.homeScorer != null;
    const rawName = isHomeField ? g.homeScorer : g.awayScorer;
    const assist = isHomeField ? g.homeAssist : g.awayAssist;
    if (!rawName) continue;
    const isOwnGoal = /\(o\.g\.\)/i.test(rawName);
    // Confirmed live (diagnosePenaltyGoalFormat.js): unlike an own goal
    // (flagged via a "(o.g.)" suffix baked into the scorer name itself),
    // GOAL API flags a penalty conversion via this separate `info` field
    // ("Penalty" vs null for every other goal) -- was never read before,
    // so every penalty silently showed as a plain "Goal" in the app
    // despite the frontend (FixtureDetailOverlay.jsx's own EVENT_ICON/
    // EVENT_LABEL_KEY maps, translations.js's own `penalty` string)
    // already being fully built to display it distinctly.
    const isPenalty = !isOwnGoal && g.info === 'Penalty';
    rows.push({
      fixture_id: fixtureId,
      ...sideRef(isHomeField),
      type: isOwnGoal ? 'Own Goal' : isPenalty ? 'Penalty' : 'Goal',
      minute: String(g.time ?? ''),
      player: rawName,
      assist: assist || null,
      substituted: null,
      event_key: `goal:${g.id}`,
    });
  }

  for (const c of cards ?? []) {
    const isHomeField = c.homeFault != null;
    const player = isHomeField ? c.homeFault : c.awayFault;
    if (!player) continue;
    rows.push({
      fixture_id: fixtureId,
      ...sideRef(isHomeField),
      type: /red/i.test(c.card || '') ? 'Red Card' : 'Yellow Card',
      minute: String(c.time ?? ''),
      player,
      assist: null,
      substituted: null,
      event_key: `card:${c.id}`,
    });
  }

  for (const s of substitutions ?? []) {
    // "OUT | IN" per GOAL API's own docs -- confirmed live
    // (substitution: "N. Brown | I. Saibari").
    const [outName, inName] = (s.substitution || '').split('|').map((p) => p.trim());
    if (!inName) continue;
    rows.push({
      fixture_id: fixtureId,
      ...sideRef(s.team === 'home'),
      type: 'Substitution',
      minute: String(s.time ?? ''),
      player: inName,
      assist: null,
      substituted: outName || null,
      event_key: `sub:${s.id}`,
    });
  }

  return rows;
}
