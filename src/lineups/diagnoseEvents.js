// Read-only diagnostic: does Highlightly expose match EVENTS (goals,
// cards, substitutions), not just lineups/scores? Tries a handful of
// plausible endpoint shapes against a real match id pulled from today's
// (or the nearest recent) /matches response. No writes.
const BASE_URL = process.env.HIGHLIGHTLY_BASE_URL || 'https://soccer.highlightly.net';
const RAPIDAPI_HOST = process.env.HIGHLIGHTLY_RAPIDAPI_HOST || 'soccer.highlightly.net';

async function call(path, params = {}) {
  const apiKey = process.env.HIGHLIGHTLY_API_KEY;
  if (!apiKey) throw new Error('Missing HIGHLIGHTLY_API_KEY env var.');
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': RAPIDAPI_HOST } });
  const body = await res.text();
  console.log(`GET ${url} -> ${res.status}`);
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  // Find a real match id to test against -- prefer today, fall back to
  // the next few days, since no LaLiga/PL/etc match happened to be live
  // during the earlier live-scores diagnostic today.
  let matchId = null;
  for (let offset = 0; offset <= 5 && !matchId; offset++) {
    const d = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    const res = await call('/matches', { date: dateStr, leagueName: 'La Liga' });
    if (!res.ok) continue;
    const data = JSON.parse(res.body);
    const list = Array.isArray(data) ? data : data.data || data.matches || [];
    if (list.length > 0) {
      matchId = list[0].id;
      console.log(`Using match id ${matchId} from ${dateStr}: ${list[0].homeTeam?.name} vs ${list[0].awayTeam?.name}, status=${list[0].status}`);
    }
  }
  if (!matchId) {
    console.log('No match id found in the next 5 days to test against.');
    return;
  }

  const candidates = [
    `/events/${matchId}`,
    `/matches/${matchId}/events`,
    `/matches/${matchId}`,
    `/statistics/${matchId}`,
  ];
  for (const path of candidates) {
    try {
      const res = await call(path);
      if (res.ok) console.log(res.body.slice(0, 1500));
    } catch (err) {
      console.log(`${path} -> error: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
