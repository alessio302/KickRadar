/**
 * Diagnose whether GOAL API exposes any season-scoped player statistics
 * beyond the single undated snapshot syncPlayerProfiles.js/
 * playerProfileResolver.js already consume (see that file's own comment:
 * "No season identifier exists anywhere in this response").
 *
 * Re-checks that claim against the full raw response (not just the
 * curated STAT_FIELDS subset), and probes a handful of plausible
 * season-scoped endpoint/param shapes GOAL API's docs don't list anywhere
 * in this codebase.
 */

import { searchPlayers, getPlayer } from '../lineups/goalApiClient.js';

const TEST_PLAYER_NAME = 'Nicolo Barella';
const BASE_URL = process.env.GOAL_API_BASE_URL || 'https://api.goal-api.com/v1';

async function rawCall(path, params = {}) {
  const apiKey = process.env.GOAL_API_KEY;
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  const body = await res.text();
  let parsed;
  try { parsed = JSON.parse(body); } catch { parsed = body; }
  return { status: res.status, body: parsed };
}

async function diagnose() {
  console.log('=== GOAL API Season Stats Diagnosis ===\n');

  if (!process.env.GOAL_API_KEY) {
    console.log('Missing GOAL_API_KEY env var.');
    process.exit(1);
  }

  console.log(`--- Step 1: Resolve "${TEST_PLAYER_NAME}" ---`);
  const results = await searchPlayers(TEST_PLAYER_NAME);
  console.log(`Search results: ${results.length}`);
  if (results.length === 0) {
    console.log('No search results, aborting.');
    return;
  }
  const first = results[0];
  console.log(`Match: id=${first.id} name=${first.name} team=${first.team?.name}`);

  console.log('\n--- Step 2: Full raw getPlayer() response ---');
  const profile = await getPlayer(first.id);
  console.log(JSON.stringify(profile, null, 2));

  const keys = Object.keys(profile || {});
  console.log('\nAll top-level keys on the profile:');
  console.log(keys.join(', '));

  const seasonLikeKeys = keys.filter((k) => /season|year|statistics|history/i.test(k));
  console.log(`\nKeys that look season/statistics/history related: ${seasonLikeKeys.join(', ') || 'none'}`);

  console.log('\n--- Step 3: Probe plausible season-scoped shapes ---');
  const currentYear = new Date().getFullYear();
  const probes = [
    { label: 'getPlayer with ?season=current year', path: `/players/${first.id}`, params: { season: currentYear } },
    { label: 'getPlayer with ?season=prev year', path: `/players/${first.id}`, params: { season: currentYear - 1 } },
    { label: 'players/{id}/statistics', path: `/players/${first.id}/statistics` },
    { label: 'players/{id}/stats', path: `/players/${first.id}/stats` },
    { label: 'players/{id}/seasons', path: `/players/${first.id}/seasons` },
    { label: 'players/{id}/season-stats', path: `/players/${first.id}/season-stats` },
  ];

  for (const probe of probes) {
    try {
      const { status, body } = await rawCall(probe.path, probe.params);
      const preview = typeof body === 'string' ? body.slice(0, 150) : JSON.stringify(body).slice(0, 300);
      console.log(`\n[${probe.label}] status=${status}`);
      console.log(preview);
    } catch (err) {
      console.log(`\n[${probe.label}] FAILED: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log('\n=== SUMMARY ===');
  console.log('If no season-scoped data appeared above, GOAL API confirmed has no way to fetch a specific past season for a player -- only whatever single snapshot it currently has on file.');
}

diagnose().catch((err) => {
  console.error('Diagnosis failed:', err.message);
  process.exit(1);
});
