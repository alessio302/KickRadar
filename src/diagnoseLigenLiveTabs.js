// Read-only sanity check for the new LigenTab.jsx/LiveTab.jsx (web/src),
// run via GitHub Actions since this sandbox's own outbound network to
// Supabase is unreliable (see CLAUDE.md's diagnose-*.js pattern). Doesn't
// touch football-data.org/GOAL API at all -- this only re-runs the exact
// Supabase queries useLiveFixtures.js/useEuropaFixtures.js/useFixtures.js
// already do client-side, using the service-role key instead of the
// frontend's anon key, to see what those hooks are actually working with
// right now: what LiveTab.jsx's cross-league grouping would show, and
// whether LigenTab.jsx's pickCurrentMatchday live-priority fix still
// resolves correctly against today's real fixtures data.
import { getSupabaseClient } from './db/supabaseClient.js';
import { LEAGUES, UEFA_COMPETITIONS } from './config/leagues.js';

const GROUP_ORDER = [...LEAGUES.map((l) => l.slug), ...UEFA_COMPETITIONS.map((c) => c.slug)];
const LABEL_BY_SLUG = new Map([...LEAGUES, ...UEFA_COMPETITIONS].map((l) => [l.slug, l.name]));

// Mirrors useLiveFixtures.js's own query exactly (domestic-only, excludes
// UEFA via the home_club_id filter).
async function loadDomesticLive(supabase) {
  const [{ data: liveRows, error: fixturesErr }, { data: clubs, error: clubsErr }, { data: leagues, error: leaguesErr }] =
    await Promise.all([
      supabase
        .from('fixtures')
        .select('id, league_id, home_club_id, away_club_id, kickoff_at, status, home_score, away_score, live_minute')
        .eq('status', 'live')
        .not('home_club_id', 'is', null),
      supabase.from('clubs').select('id, name, short_name'),
      supabase.from('leagues').select('id, slug'),
    ]);
  if (fixturesErr) throw fixturesErr;
  if (clubsErr) throw clubsErr;
  if (leaguesErr) throw leaguesErr;

  const clubsById = new Map(clubs.map((c) => [c.id, c]));
  const leagueSlugById = new Map(leagues.map((l) => [l.id, l.slug]));
  return liveRows.map((f) => ({
    ...f,
    leagueSlug: leagueSlugById.get(f.league_id),
    homeClub: clubsById.get(f.home_club_id),
    awayClub: clubsById.get(f.away_club_id),
  }));
}

// Mirrors useEuropaFixtures.js's own query, filtered to status='live' the
// same way useAllLiveFixtures.js does client-side.
async function loadEuropaLive(supabase) {
  const uefaSlugs = UEFA_COMPETITIONS.map((c) => c.slug);
  const { data: leagues, error: leaguesErr } = await supabase.from('leagues').select('id, slug').in('slug', uefaSlugs);
  if (leaguesErr) throw leaguesErr;
  if (leagues.length === 0) return [];

  const slugById = new Map(leagues.map((l) => [l.id, l.slug]));
  const { data: fixtures, error } = await supabase
    .from('fixtures')
    .select('id, league_id, home_team_name, away_team_name, home_team_short_name, away_team_short_name, kickoff_at, status, home_score, away_score, live_minute')
    .in('league_id', leagues.map((l) => l.id))
    .eq('status', 'live');
  if (error) throw error;

  return fixtures.map((f) => ({ ...f, leagueSlug: slugById.get(f.league_id) }));
}

// Mirrors LigenTab.jsx's own pickCurrentMatchday: live takes priority over
// sort order, falling back to the soonest upcoming fixture.
function pickCurrentMatchday(matchdays) {
  if (matchdays.length === 0) return null;
  const liveGroup = matchdays.find((g) => g.games.some((f) => f.status === 'live'));
  if (liveGroup) return { ...liveGroup, reason: 'live' };
  const now = Date.now();
  let soonestGroup = null;
  let soonestKickoff = Infinity;
  for (const group of matchdays) {
    for (const f of group.games) {
      const t = new Date(f.kickoff_at).getTime();
      if (t >= now && t < soonestKickoff) {
        soonestKickoff = t;
        soonestGroup = group;
      }
    }
  }
  if (soonestGroup) return { ...soonestGroup, reason: 'soonest-upcoming' };
  return { ...matchdays[matchdays.length - 1], reason: 'fallback-last' };
}

async function checkLigenMatchdayPick(supabase, leagueSlug) {
  const { data: league } = await supabase.from('leagues').select('id').eq('slug', leagueSlug).single();
  if (!league) {
    console.log(`  (league '${leagueSlug}' not found)`);
    return;
  }
  const { data: fixtures, error } = await supabase
    .from('fixtures')
    .select('id, matchday, kickoff_at, status')
    .eq('league_id', league.id)
    .order('kickoff_at', { ascending: true });
  if (error) throw error;

  const byMatchday = new Map();
  for (const f of fixtures) {
    const key = f.matchday ?? 0;
    if (!byMatchday.has(key)) byMatchday.set(key, []);
    byMatchday.get(key).push(f);
  }
  const matchdays = [...byMatchday.entries()]
    .map(([matchday, games]) => ({ matchday, games }))
    .sort((a, b) => new Date(a.games[0].kickoff_at) - new Date(b.games[0].kickoff_at));

  const picked = pickCurrentMatchday(matchdays);
  const liveCount = fixtures.filter((f) => f.status === 'live').length;
  console.log(
    `  ${leagueSlug}: ${fixtures.length} fixtures synced, ${liveCount} live -> picked matchday ${picked?.matchday} (reason: ${picked?.reason}), ${picked?.games.length} games in it`
  );
}

async function main() {
  const supabase = getSupabaseClient();

  const [domesticLive, europaLive] = await Promise.all([loadDomesticLive(supabase), loadEuropaLive(supabase)]);

  console.log('=== useLiveFixtures.js (domestic) sanity ===');
  console.log(`${domesticLive.length} live domestic fixture(s):`);
  for (const f of domesticLive) {
    const missing = [];
    if (!f.leagueSlug) missing.push('leagueSlug');
    if (!f.homeClub) missing.push('homeClub');
    if (!f.awayClub) missing.push('awayClub');
    const flag = missing.length ? `  <-- MISSING: ${missing.join(', ')}` : '';
    console.log(
      `  [${f.leagueSlug ?? '?'}] ${f.homeClub?.short_name ?? f.homeClub?.name ?? '?'} ${f.home_score}-${f.away_score} ${
        f.awayClub?.short_name ?? f.awayClub?.name ?? '?'
      } (${f.live_minute ?? 'no minute'})${flag}`
    );
  }

  console.log('\n=== useEuropaFixtures.js (UEFA) live filter sanity ===');
  console.log(`${europaLive.length} live UEFA fixture(s):`);
  for (const f of europaLive) {
    console.log(
      `  [${f.leagueSlug ?? '?'}] ${f.home_team_short_name ?? f.home_team_name} ${f.home_score}-${f.away_score} ${
        f.away_team_short_name ?? f.away_team_name
      } (${f.live_minute ?? 'no minute'})`
    );
  }

  console.log('\n=== useAllLiveFixtures.js grouping (what LiveTab.jsx shows right now) ===');
  const bySlug = new Map();
  for (const f of [...domesticLive, ...europaLive]) {
    if (!f.leagueSlug) continue;
    if (!bySlug.has(f.leagueSlug)) bySlug.set(f.leagueSlug, []);
    bySlug.get(f.leagueSlug).push(f);
  }
  const total = [...bySlug.values()].reduce((sum, arr) => sum + arr.length, 0);
  console.log(`Total live right now: ${total}`);
  for (const slug of GROUP_ORDER) {
    if (!bySlug.has(slug)) continue;
    console.log(`  ${LABEL_BY_SLUG.get(slug) ?? slug}: ${bySlug.get(slug).length} live`);
  }

  console.log('\n=== LigenTab.jsx pickCurrentMatchday sanity (per domestic league) ===');
  for (const league of LEAGUES) {
    await checkLigenMatchdayPick(supabase, league.slug);
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
