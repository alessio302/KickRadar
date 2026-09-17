import { getSupabaseClient } from '../db/supabaseClient.js';
import { resolveClub } from '../news/clubMatch.js';
import { llmExtractBroadcasts } from './llmExtractBroadcasts.js';

// Serie A is the one league whose "which channel?" pill (web/src/lib/
// broadcasters.js) can't be a static day/time rule -- confirmed live
// (diagnoseGoalComBroadcastPages.js): several matches per matchday are
// genuinely co-exclusive (DAZN AND Sky Italia show the same match), and
// which ones vary matchday to matchday. goal.com/it's own broadcaster
// overview article already lists this per fixture, months ahead, at a
// stable URL -- see that diagnose script's own comment for how this was
// validated (robots.txt allows it, the page is server-rendered, real text).
const PAGE_URL = 'https://www.goal.com/it/notizie/calendario-serie-a-dove-vedere-le-partite-su-sky-dazn/15xq0ezenmop915t22cio9f74h';

const PROVIDER_KEY = { DAZN: 'dazn', Sky: 'sky', NOW: 'now' };

async function fetchPageText() {
  const res = await fetch(PAGE_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KickRadarBot/1.0)' } });
  if (!res.ok) throw new Error(`goal.com fetch failed: ${res.status} ${res.statusText}`);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function syncSerieABroadcasters() {
  const supabase = getSupabaseClient();

  const { data: league, error: leagueErr } = await supabase.from('leagues').select('id').eq('slug', 'serie-a').single();
  if (leagueErr) throw leagueErr;

  const [{ data: clubs, error: clubsErr }, { data: fixtures, error: fixturesErr }] = await Promise.all([
    supabase.from('clubs').select('id, name, short_name, aliases').eq('league_id', league.id),
    // Every fixture not yet finished -- the source article covers the
    // whole season ahead, not just "today", so matching isn't limited to a
    // narrow upcoming window. A finished match's broadcaster is no longer
    // useful information, so those are left untouched even if the article
    // still mentions them in passing.
    supabase.from('fixtures').select('id, home_club_id, away_club_id').eq('league_id', league.id).neq('status', 'finished'),
  ]);
  if (clubsErr) throw clubsErr;
  if (fixturesErr) throw fixturesErr;

  const fixtureByPairing = new Map(fixtures.map((f) => [`${f.home_club_id}-${f.away_club_id}`, f]));

  const pageText = await fetchPageText();
  const extracted = await llmExtractBroadcasts(pageText);

  let matched = 0;
  let unmatched = 0;
  for (const item of extracted) {
    const homeClub = resolveClub(item.homeTeam, clubs);
    const awayClub = resolveClub(item.awayTeam, clubs);
    const providers = [...new Set(item.providers.map((p) => PROVIDER_KEY[p]).filter(Boolean))];
    if (!homeClub || !awayClub || providers.length === 0) {
      unmatched++;
      console.warn(`Could not resolve "${item.homeTeam} - ${item.awayTeam}" (${item.providers.join('/')})`);
      continue;
    }
    const fixture = fixtureByPairing.get(`${homeClub.id}-${awayClub.id}`);
    if (!fixture) {
      unmatched++;
      console.warn(`No open fixture row for ${homeClub.name} vs ${awayClub.name}`);
      continue;
    }
    const { error } = await supabase.from('fixtures').update({ broadcasters: providers }).eq('id', fixture.id);
    if (error) throw error;
    matched++;
  }

  return { extracted: extracted.length, matched, unmatched };
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncSerieABroadcasters()
    .then((result) => {
      console.log('Serie A broadcaster sync complete:', result);
    })
    .catch((err) => {
      console.error('Serie A broadcaster sync failed:', err);
      process.exitCode = 1;
    });
}
