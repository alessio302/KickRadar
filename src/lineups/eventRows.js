// Shared REST-shaped (camelCase, GOAL API's own stable per-event ids)
// match_events row builder -- used by both syncLineups.js (club_id-keyed
// domestic fixtures) and syncEuropeanLineups.js (team_name-keyed UEFA
// fixtures, no clubs table row -- see syncEuropeanFixtures.js's own
// comment), via `sideRef` returning exactly one of {club_id}/{team_name}
// per sql/054's own "exactly one set" contract. event_key uses GOAL API's
// own row id (goal:${id}/card:${id}/sub:${id}), stable and unique --
// repeated calls for the same real event upsert into the same row rather
// than duplicating, unlike a synthetic content-based key built from
// field values (see src/lineups/syncLiveEvents.js's own buildLiveEventRows
// for that, and matchEventsReconciler.js for how the two coexist).
export function buildEventRowsFromRest(fixtureId, sideRef, { goals, cards, substitutions }) {
  const rows = [];

  for (const g of goals ?? []) {
    if (g.type !== 'GOAL') continue;
    const isHomeField = g.homeScorer != null;
    const rawName = isHomeField ? g.homeScorer : g.awayScorer;
    const assist = isHomeField ? g.homeAssist : g.awayAssist;
    if (!rawName) continue;
    const isOwnGoal = /\(o\.g\.\)/i.test(rawName);
    rows.push({
      fixture_id: fixtureId,
      ...sideRef(isHomeField),
      type: isOwnGoal ? 'Own Goal' : 'Goal',
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
