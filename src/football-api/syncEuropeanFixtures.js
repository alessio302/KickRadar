// Syncs fixtures for UCL, UEL, and UECL into the fixtures table.
//
// UCL (Champions League) comes from football-data.org -- the full current
// season in one call (same pattern as syncFixtures.js for domestic leagues).
// EL and UECL come from GOAL API per-date, since football-data.org returns
// 403 for competition IDs 2146/2191 on the free tier -- there's no "whole
// season" endpoint there, so this is a per-(league,date) loop, unconditional
// on whether that date could have changed since the last run.
//
// Date window is env-controlled (see DAYS_BACK/DAYS_AHEAD below) rather than
// fixed: confirmed live, 2026-09-09, the original always-on ±7d/+60d window
// (2 competitions × 67 dates = 134 calls, each paced 500ms apart to respect
// GOAL API's 15-min sliding budget) made a manually-triggered run take 6+
// minutes even though the same-day result it was actually run for lands
// within the first ~10 calls -- the other ~120 calls that run were almost
// entirely re-confirming a forward calendar and past results that hadn't
// changed since the previous run. The daily cron now uses a narrow window
// (today's results + the next couple weeks' schedule); a separate weekly
// workflow sets EUROPEAN_FIXTURES_FULL_SYNC=true to still walk the full
// ±7d/+60d range periodically, catching a matchday reschedule further out
// that the narrow window would otherwise miss indefinitely.
//
// All three competitions store home_team_name / away_team_name directly
// (confirmed live: UCL clubs like Real Madrid and Bayern Munich aren't in our
// clubs table, which only tracks the 5 domestic leagues). home_club_id /
// away_club_id stay null for every European fixture and are never resolved.
//
// This file's own status/score writes are the only ones these three
// leagues get for most of the day, but NOT during a live match: while a
// tracked fixture is scheduled-near-kickoff or live, syncLiveEvents.js's
// WebSocket connection takes over as the real-time writer for status/
// home_score/away_score/live_minute (unlike the 5 domestic leagues, where
// that connection deliberately never touches those columns -- see its own
// top comment for why the split is the other way round for Europe).

import { getSupabaseClient } from '../db/supabaseClient.js';
import { UEFA_COMPETITIONS } from '../config/leagues.js';
import { getMatches, sleep, STATUS_MAP } from './client.js';
import { getLeagueFixtures } from '../lineups/goalApiClient.js';

// Same guard as syncFixtures.js -- never move a fixture backwards through
// finished > live > scheduled even if a stale API response tries to.
const STATUS_RANK = { scheduled: 0, postponed: 0, cancelled: 0, live: 1, finished: 2 };

// ── football-data.org UCL sync ────────────────────────────────────────────────

async function syncUCL(supabase, comp, leagueId) {
  const matches = await getMatches({ competitionId: comp.externalCompetitionId });
  if (matches.length === 0) return 0;

  const { data: existingRows, error: existingErr } = await supabase
    .from('fixtures')
    .select('external_fixture_id, status, home_score, away_score')
    .in('external_fixture_id', matches.map((m) => m.id));
  if (existingErr) throw existingErr;
  const existingByExternalId = new Map(existingRows.map((r) => [r.external_fixture_id, r]));

  const rows = matches.map((m) => {
    const existing = existingByExternalId.get(m.id);
    const fetchedStatus = STATUS_MAP[m.status] || 'scheduled';
    const regressing = existing && STATUS_RANK[existing.status] > STATUS_RANK[fetchedStatus];
    return {
      league_id: leagueId,
      matchday: m.matchday,
      home_club_id: null,
      away_club_id: null,
      home_team_name: m.homeTeam?.name ?? null,
      away_team_name: m.awayTeam?.name ?? null,
      home_team_badge: m.homeTeam?.crest ?? null,
      away_team_badge: m.awayTeam?.crest ?? null,
      kickoff_at: m.utcDate,
      kickoff_confirmed: m.status !== 'SCHEDULED',
      status: regressing ? existing.status : fetchedStatus,
      home_score: regressing ? existing.home_score : (m.score?.fullTime?.home ?? null),
      away_score: regressing ? existing.away_score : (m.score?.fullTime?.away ?? null),
      // Same extraction as syncFixtures.js's domestic sync -- confirmed
      // live UCL's match object carries the identical referees[] shape.
      // No venue here on purpose: confirmed live football-data.org's UCL
      // match object carries no venue field at all (only referees), same
      // free-tier gap domestic fixtures already have (see
      // FixtureDetailOverlay.jsx's own MatchInfoFooter comment) -- there
      // it's papered over by falling back to the home club's static
      // stadium, which isn't available here (no clubs table row for
      // Real Madrid etc.).
      referee: m.referees?.find((r) => r.type === 'REFEREE')?.name ?? m.referees?.[0]?.name ?? null,
      external_fixture_id: m.id,
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase
    .from('fixtures')
    .upsert(rows, { onConflict: 'external_fixture_id' });
  if (error) throw error;
  return rows.length;
}

// ── GOAL API EL / UECL sync ────────────────────────────────────────────────��──

// Attempt to read an ISO kickoff time from a GOAL API fixture object.
// Confirmed field name from live run: kickoffUtc.
// Falls back to noon UTC on the queried date if no recognisable timestamp
// is found, so the row still lands with a useful date even if the exact
// kick-off time isn't yet published.
function extractKickoff(fixture, dateStr) {
  const raw = fixture.kickoffUtc ?? fixture.startAt ?? fixture.dateTime ?? fixture.date ?? fixture.kickoffAt;
  if (raw && typeof raw === 'string' && (raw.includes('T') || raw.includes(' '))) {
    const t = new Date(raw);
    if (!isNaN(t)) return t.toISOString();
  }
  return `${dateStr}T12:00:00.000Z`; // noon UTC fallback -- kickoff_confirmed = false
}

function extractMatchday(fixture) {
  const r = fixture.matchRound ?? fixture.round ?? fixture.matchday ?? fixture.roundNumber;
  if (r == null) return null;
  if (typeof r === 'number') return r;
  if (typeof r === 'object') {
    const n = r.number ?? r.roundNumber ?? r.id;
    return typeof n === 'number' ? n : null;
  }
  const n = parseInt(String(r), 10);
  return Number.isFinite(n) ? n : null;
}

// Maps GOAL API status strings to our internal four-way enum.
// Confirmed from live run: GOAL API uses matchStatus field with values like
// SCHEDULED, AFTER_ET, FINISHED, etc.
const GOAL_STATUS_MAP = {
  NOTSTARTED: 'scheduled',
  NOT_STARTED: 'scheduled',
  SCHEDULED: 'scheduled',
  INPROGRESS: 'live',
  IN_PROGRESS: 'live',
  LIVE: 'live',
  HALFTIME: 'live',
  HALF_TIME: 'live',
  FINISHED: 'finished',
  AFTER_ET: 'finished',
  AFTER_PEN: 'finished',
  ENDED: 'finished',
  FULL_TIME: 'finished',
  FULLTIME: 'finished',
  FINAL: 'finished',
  FT: 'finished',
  POSTPONED: 'postponed',
  CANCELLED: 'cancelled',
  CANCELED: 'cancelled',
  ABANDONED: 'cancelled',
};

function extractStatus(fixture) {
  const raw = (fixture.matchStatus ?? fixture.status ?? fixture.statusName ?? '').toUpperCase().replace(/\s+/g, '_');
  return GOAL_STATUS_MAP[raw] ?? 'scheduled';
}

function extractScore(fixture) {
  // Confirmed from live run: GOAL API uses homeTeamScore/awayTeamScore as strings
  if (fixture.homeTeamScore != null) {
    const home = parseInt(fixture.homeTeamScore, 10);
    const away = parseInt(fixture.awayTeamScore, 10);
    return { home: Number.isFinite(home) ? home : null, away: Number.isFinite(away) ? away : null };
  }
  if (fixture.homeGoals != null) return { home: fixture.homeGoals, away: fixture.awayGoals };
  if (fixture.score?.home != null) return { home: fixture.score.home, away: fixture.score.away };
  if (fixture.score?.fullTime?.home != null) return { home: fixture.score.fullTime.home, away: fixture.score.fullTime.away };
  return { home: null, away: null };
}

// Narrow by default -- see this file's own top comment. Full-sync mode
// (weekly workflow) restores the original ±7d/+60d range.
const FULL_SYNC = process.env.EUROPEAN_FIXTURES_FULL_SYNC === 'true';
const DAYS_BACK = FULL_SYNC ? 7 : 3;
const DAYS_AHEAD = FULL_SYNC ? 60 : 14;

async function syncGoalApiCompetition(supabase, comp, leagueId) {
  const today = new Date();
  const dates = [];
  for (let d = -DAYS_BACK; d <= DAYS_AHEAD; d++) {
    const dt = new Date(today);
    dt.setUTCDate(today.getUTCDate() + d);
    dates.push(dt.toISOString().slice(0, 10));
  }

  let inserted = 0;

  for (const dateStr of dates) {
    let apiFixtures;
    try {
      apiFixtures = await getLeagueFixtures(comp.goalApiLeagueId, dateStr);
    } catch (err) {
      console.error(`  GOAL API failed for ${comp.slug} ${dateStr}:`, err.message);
      continue;
    }
    if (!apiFixtures || apiFixtures.length === 0) continue;

    // Fetch existing rows for this (league, date) window to apply the
    // STATUS_RANK anti-regression guard.
    const windowStart = `${dateStr}T00:00:00Z`;
    const windowEnd = `${dateStr}T23:59:59Z`;
    const { data: existing } = await supabase
      .from('fixtures')
      .select('goal_api_id, status, home_score, away_score')
      .eq('league_id', leagueId)
      .gte('kickoff_at', windowStart)
      .lte('kickoff_at', windowEnd);
    const existingByGoalId = new Map((existing ?? []).map((r) => [r.goal_api_id, r]));

    const rows = apiFixtures.map((f) => {
      const goalApiId = String(f.id);
      const existing = existingByGoalId.get(goalApiId);
      const fetchedStatus = extractStatus(f);
      const regressing = existing && STATUS_RANK[existing.status] > STATUS_RANK[fetchedStatus];
      const score = extractScore(f);
      const kickoffIso = extractKickoff(f, dateStr);
      const hasRealTime = kickoffIso !== `${dateStr}T12:00:00.000Z`;

      return {
        league_id: leagueId,
        matchday: extractMatchday(f),
        home_club_id: null,
        away_club_id: null,
        home_team_name: f.homeTeam?.name ?? f.homeTeamName ?? null,
        away_team_name: f.awayTeam?.name ?? f.awayTeamName ?? null,
        home_team_badge: f.homeTeam?.badge ?? f.teamHomeBadge ?? null,
        away_team_badge: f.awayTeam?.badge ?? f.teamAwayBadge ?? null,
        kickoff_at: kickoffIso,
        kickoff_confirmed: hasRealTime,
        status: regressing ? existing.status : fetchedStatus,
        home_score: regressing ? existing.home_score : score.home,
        away_score: regressing ? existing.away_score : score.away,
        // Confirmed live: GOAL API's fixture object carries both directly
        // (matchStadium/matchReferee) -- unlike UCL's football-data.org
        // source, which has referees but no venue at all.
        venue: f.matchStadium ?? null,
        referee: f.matchReferee ?? null,
        external_fixture_id: null,
        goal_api_id: goalApiId,
        updated_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from('fixtures')
      .upsert(rows, { onConflict: 'goal_api_id' });
    if (error) {
      console.error(`  Upsert failed for ${comp.slug} ${dateStr}:`, error.message);
    } else {
      inserted += rows.length;
    }

    await sleep(500); // stay well inside GOAL API's 15-min sliding budget
  }

  return inserted;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function syncAllEuropeanFixtures() {
  const supabase = getSupabaseClient();

  const { data: dbLeagues, error: leagueErr } = await supabase
    .from('leagues')
    .select('id, slug')
    .in('slug', UEFA_COMPETITIONS.map((c) => c.slug));
  if (leagueErr) throw leagueErr;

  const leagueIdBySlug = new Map(dbLeagues.map((l) => [l.slug, l.id]));

  const results = {};
  for (const comp of UEFA_COMPETITIONS) {
    const leagueId = leagueIdBySlug.get(comp.slug);
    if (!leagueId) {
      console.warn(`League row missing for ${comp.slug} -- run sql/050 migration first`);
      results[comp.slug] = 0;
      continue;
    }

    console.log(`\nSyncing ${comp.name} (${comp.slug}) via ${comp.source}...`);
    if (comp.source === 'football-data') {
      results[comp.slug] = await syncUCL(supabase, comp, leagueId);
      await sleep(1500); // football-data.org 10 req/min free tier
    } else {
      results[comp.slug] = await syncGoalApiCompetition(supabase, comp, leagueId);
    }
    console.log(`  → ${results[comp.slug]} rows upserted`);
  }

  return results;
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncAllEuropeanFixtures()
    .then((results) => {
      console.log('\nEuropean fixture sync complete:', results);
    })
    .catch((err) => {
      console.error('\nEuropean fixture sync failed:', err);
      process.exitCode = 1;
    });
}
