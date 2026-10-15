// Read-only: checks whether each highlight-video URL we store can actually be
// played inside our app's iframe, and names the channel that owns each blocked
// clip -- which tells us whether the problem is one bad upload, or a whole
// source feed that disables embedding.
//
// Verdict comes from YouTube's oEmbed endpoint, not from parsing the watch or
// embed page: the page-parsing version (checked 2026-10-15) got HTTP 200 for
// every video and still returned UNKNOWN for all of them, so it could not say
// anything. oEmbed answers 200 for an embeddable video, 401 when the owner
// disabled embedding, and 404 when the video is gone; its JSON also carries
// author_name, which is the owning channel. Runs in GitHub Actions because the
// agent sandbox has no outbound route to youtube.com.
import { getSupabaseClient } from '../db/supabaseClient.js';

const PAST_WINDOW_DAYS = 60;
const DELAY_MS = 300;
const REQUEST_TIMEOUT_MS = 15_000;

function videoIdFromEmbedUrl(url) {
  const m = /\/embed\/([A-Za-z0-9_-]{11})/.exec(url ?? '');
  return m ? m[1] : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function checkEmbeddable(videoId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
    );
    if (res.status === 200) {
      const body = await res.json().catch(() => ({}));
      return { verdict: 'EMBEDDABLE', owner: body.author_name ?? null };
    }
    if (res.status === 401) return { verdict: 'EMBED_DISABLED', owner: null };
    if (res.status === 404) return { verdict: 'NOT_FOUND', owner: null };
    return { verdict: `HTTP_${res.status}`, owner: null };
  } catch (err) {
    return { verdict: `ERROR: ${err.message}`, owner: null };
  }
}

async function main() {
  const supabase = getSupabaseClient();
  const since = new Date(Date.now() - PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from('fixtures')
    .select('id, kickoff_at, home_team_name, away_team_name, highlight_video_url, league_id, leagues(slug)')
    .not('highlight_video_url', 'is', null)
    .gte('kickoff_at', since)
    .order('kickoff_at', { ascending: false });
  if (error) throw error;

  // One check per distinct video, however many fixtures point at it.
  const byVideo = new Map();
  for (const r of rows) {
    const vid = videoIdFromEmbedUrl(r.highlight_video_url);
    if (!vid) continue;
    if (!byVideo.has(vid)) byVideo.set(vid, { league: r.leagues?.slug ?? '?', fixtures: [] });
    byVideo.get(vid).fixtures.push(`${r.id} ${r.home_team_name} vs ${r.away_team_name} (${r.kickoff_at})`);
  }
  console.log(`Checking ${byVideo.size} distinct videos across ${rows.length} fixtures (last ${PAST_WINDOW_DAYS} days)`);

  const results = [];
  for (const [vid, info] of byVideo) {
    const { verdict, owner } = await checkEmbeddable(vid);
    const result = { vid, league: info.league, verdict, owner, fixtures: info.fixtures };
    results.push(result);
    console.log(JSON.stringify(result));
    await sleep(DELAY_MS);
  }

  const summary = {};
  for (const r of results) {
    const s = (summary[r.league] ??= { total: 0, embeddable: 0, blocked: 0, other: 0 });
    s.total += 1;
    if (r.verdict === 'EMBEDDABLE') s.embeddable += 1;
    else if (r.verdict === 'EMBED_DISABLED' || r.verdict === 'NOT_FOUND') s.blocked += 1;
    else s.other += 1;
  }
  console.log('--- summary by league (distinct videos) ---');
  console.log(JSON.stringify(summary, null, 2));

  console.log('--- blocked videos grouped by owning channel ---');
  const byOwner = {};
  for (const r of results.filter((x) => x.verdict !== 'EMBEDDABLE')) {
    const k = `${r.league} | ${r.verdict} | ${r.owner ?? '(owner unknown)'}`;
    byOwner[k] = (byOwner[k] ?? 0) + 1;
  }
  console.log(JSON.stringify(byOwner, null, 2));
}

main().catch((err) => {
  console.error('Highlight embed diagnostic failed:', err);
  process.exitCode = 1;
});
