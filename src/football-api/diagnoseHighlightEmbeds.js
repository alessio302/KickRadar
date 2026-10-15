// Read-only: checks whether each highlight-video URL we store can actually be
// played inside our app's iframe. Reports YouTube's own playability verdict
// (OK / embed disabled by owner / removed / ...) per league, plus the channel
// that owns each blocked clip -- which tells us whether the problem is one
// bad upload, or a whole source feed (a league channel that disables embedding)
// that we keep pulling from. Runs in GitHub Actions because the agent sandbox
// has no outbound route to youtube.com.
import { getSupabaseClient } from '../db/supabaseClient.js';

const PAST_WINDOW_DAYS = 60;
const DELAY_MS = 300;

function videoIdFromEmbedUrl(url) {
  const m = /\/embed\/([A-Za-z0-9_-]{11})/.exec(url ?? '');
  return m ? m[1] : null;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      Cookie: 'CONSENT=YES+cb',
    },
  });
  return { status: res.status, body: await res.text() };
}

// Pulls YouTube's own playability verdict out of the page's embedded player
// config. The first playabilityStatus block is the one the player acts on.
function parsePlayability(html) {
  const m = /"playabilityStatus":\s*\{\s*"status":\s*"([A-Z_]+)"(?:,\s*"reason":\s*"((?:[^"\\]|\\.)*)")?/.exec(html);
  if (!m) return { status: 'UNKNOWN', reason: null };
  return { status: m[1], reason: m[2] ?? null };
}

function parseOwner(html) {
  const m = /"ownerChannelName":\s*"((?:[^"\\]|\\.)*)"/.exec(html);
  return m ? m[1] : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const supabase = getSupabaseClient();
  const since = new Date(Date.now() - PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from('fixtures')
    .select('id, kickoff_at, highlight_video_url, league_id, leagues(slug)')
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
    byVideo.get(vid).fixtures.push(r.id);
  }
  console.log(`Checking ${byVideo.size} distinct videos across ${rows.length} fixtures (last ${PAST_WINDOW_DAYS} days)`);

  const results = [];
  for (const [vid, info] of byVideo) {
    const embed = await fetchText(`https://www.youtube.com/embed/${vid}`);
    const play = parsePlayability(embed.body);
    let owner = null;
    if (play.status !== 'OK') {
      // Only fetch the watch page for blocked clips -- that's where the owning channel is named.
      const watch = await fetchText(`https://www.youtube.com/watch?v=${vid}`);
      owner = parseOwner(watch.body);
    }
    results.push({ vid, league: info.league, fixtures: info.fixtures.length, http: embed.status, ...play, owner });
    await sleep(DELAY_MS);
  }

  const summary = {};
  for (const r of results) {
    const s = (summary[r.league] ??= { total: 0, ok: 0, blocked: 0, other: 0 });
    s.total += 1;
    if (r.status === 'OK') s.ok += 1;
    else if (r.status === 'ERROR' || r.status === 'UNPLAYABLE' || r.status === 'LOGIN_REQUIRED') s.blocked += 1;
    else s.other += 1;
  }
  console.log('--- summary by league (distinct videos) ---');
  console.log(JSON.stringify(summary, null, 2));

  console.log('--- blocked or unknown videos ---');
  for (const r of results.filter((x) => x.status !== 'OK')) {
    console.log(JSON.stringify(r));
  }

  console.log('--- blocked videos grouped by owning channel ---');
  const byOwner = {};
  for (const r of results.filter((x) => x.status !== 'OK')) {
    const k = `${r.league} | ${r.owner ?? '(owner unknown)'}`;
    byOwner[k] = (byOwner[k] ?? 0) + 1;
  }
  console.log(JSON.stringify(byOwner, null, 2));
}

main().catch((err) => {
  console.error('Highlight embed diagnostic failed:', err);
  process.exitCode = 1;
});
