import { getSupabaseClient } from '../db/supabaseClient.js';
import { getHeadToHead, sleep } from './client.js';

// One request per NEW or newly-stale club pairing, not per league like
// every other sync here -- head2head is a per-MATCH football-data.org
// endpoint. A first-run backlog (every distinct pairing currently in the
// fixtures table) is deliberately capped per run and drains over several
// scheduled runs instead of one long job -- same self-healing pattern as
// syncLineups.js's widened window, and it means an urgent/near-term
// pairing (prioritized below) is never stuck behind a huge one-shot batch.
const MAX_FETCHES_PER_RUN = Number(process.env.HEAD_TO_HEAD_MAX_FETCHES || 30);
// 10 req/min is the free tier's hard cap (see client.js) -- 6.5s spacing
// keeps this comfortably under it (~9.2 req/min) with margin for the
// request itself taking real time too.
const REQUEST_SPACING_MS = 6500;

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export async function syncHeadToHead() {
  const supabase = getSupabaseClient();

  const { data: fixtures, error: fixturesErr } = await supabase
    .from('fixtures')
    .select('external_fixture_id, home_club_id, away_club_id, status, kickoff_at')
    .in('status', ['scheduled', 'live', 'finished']);
  if (fixturesErr) throw fixturesErr;

  const { data: existingRows, error: existingErr } = await supabase.from('head_to_head').select('club_id_a, club_id_b, updated_at');
  if (existingErr) throw existingErr;
  const existingByPair = new Map(existingRows.map((r) => [pairKey(r.club_id_a, r.club_id_b), r]));

  const { data: clubs, error: clubsErr } = await supabase.from('clubs').select('id, external_team_id');
  if (clubsErr) throw clubsErr;
  const clubIdByExternalId = new Map(clubs.map((c) => [c.external_team_id, c.id]));

  const now = Date.now();
  const seenKeys = new Set();
  const candidates = fixtures
    .filter((f) => f.home_club_id != null && f.away_club_id != null)
    .map((f) => {
      const key = pairKey(f.home_club_id, f.away_club_id);
      const existing = existingByPair.get(key);
      // Re-fetch when a fixture in this pairing finished more recently than
      // our last snapshot (a new meeting to pick up); otherwise only fetch
      // pairings we've genuinely never seen -- past results don't change.
      const needsFetch = !existing || (f.status === 'finished' && new Date(f.kickoff_at).getTime() > new Date(existing.updated_at).getTime());
      return needsFetch ? { fixture: f, key } : null;
    })
    .filter(Boolean)
    // The same pairing can appear twice in-window (each side's own leg) --
    // one fetch already covers both.
    .filter((c) => (seenKeys.has(c.key) ? false : (seenKeys.add(c.key), true)))
    .sort((a, b) => Math.abs(new Date(a.fixture.kickoff_at) - now) - Math.abs(new Date(b.fixture.kickoff_at) - now))
    .slice(0, MAX_FETCHES_PER_RUN);

  let synced = 0;
  for (const { fixture, key } of candidates) {
    const [clubIdA, clubIdB] = key.split('|').map(Number);
    const rawMatches = await getHeadToHead({ matchId: fixture.external_fixture_id, limit: 5 });

    const matches = rawMatches.map((m) => ({
      id: m.id,
      date: m.utcDate,
      home_club_id: clubIdByExternalId.get(m.homeTeam.id) ?? null,
      away_club_id: clubIdByExternalId.get(m.awayTeam.id) ?? null,
      home_score: m.score?.fullTime?.home ?? null,
      away_score: m.score?.fullTime?.away ?? null,
    }));

    const { error } = await supabase
      .from('head_to_head')
      .upsert({ club_id_a: clubIdA, club_id_b: clubIdB, matches, updated_at: new Date().toISOString() }, { onConflict: 'club_id_a,club_id_b' });
    if (error) throw error;

    synced += 1;
    await sleep(REQUEST_SPACING_MS);
  }

  return { candidates: candidates.length, synced };
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncHeadToHead()
    .then((result) => {
      console.log('Head-to-head sync complete:', result);
    })
    .catch((err) => {
      console.error('Head-to-head sync failed:', err);
      process.exitCode = 1;
    });
}
