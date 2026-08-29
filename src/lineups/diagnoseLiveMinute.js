import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { getLeagueFixtures, getWsToken, GOAL_API_WS_URL } from './goalApiClient.js';

// Throwaway diagnostic: does GOAL API's live match_update payload carry the
// current match minute anywhere, so fixture rows can show "19'" instead of
// kickoff time while live? Subscribes to whatever Premier League fixture is
// actually live right now and dumps the full raw payload of the first
// message received. Read-only, deleted once the finding is confirmed.

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const supabase = getSupabaseClient();
  const today = toDateString(new Date());
  const league = LEAGUES.find((l) => l.slug === 'premier-league');

  const fixtures = await getLeagueFixtures(league.goalApiLeagueId, today);
  const live = fixtures.filter((f) => f.matchLive === '1' || f.matchStatus === 'IN_PLAY' || f.matchStatus === 'LIVE');
  console.log(
    'Live/in-play premier-league fixtures found:',
    live.map((f) => ({ id: f.id, matchStatus: f.matchStatus, matchLive: f.matchLive, home: f.homeTeamName, away: f.awayTeamName }))
  );

  if (live.length === 0) {
    console.log('No live premier-league fixture right now -- nothing to subscribe to.');
    return;
  }

  console.log('Full raw REST fixture object for first live match:', JSON.stringify(live[0], null, 2));

  const { token } = await getWsToken();

  await new Promise((resolve) => {
    const ws = new WebSocket(`${GOAL_API_WS_URL}?wsToken=${token}`);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve();
    };
    const deadline = setTimeout(finish, 45000);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'auth', token }));
    });

    ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === 'auth_success') {
        for (const f of live) {
          ws.send(JSON.stringify({ type: 'subscribe', resource: 'match', matchId: f.id }));
        }
        return;
      }

      if (msg.type === 'match_update') {
        console.log('Full match_update payload:', JSON.stringify(msg.data, null, 2));
        clearTimeout(deadline);
        finish();
      }
    });

    ws.addEventListener('close', () => finish());
    ws.addEventListener('error', (event) => console.error('WS error:', event.message ?? event));
  });
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
