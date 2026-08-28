// Read-only: finds any currently-live match worldwide (doesn't need to be
// one of our 5 leagues) and listens to its WebSocket match_update
// messages for a short window, to see the REAL payload shape --
// GOAL API's own docs only show an abbreviated example ("goalscorer": [
// ... ], no field names inside), not enough to write a correct transform
// from.
const BASE_URL = 'https://api.goal-api.com/v1';

async function call(path) {
  const apiKey = process.env.GOAL_API_KEY;
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const body = await res.text();
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${body}`);
  return JSON.parse(body);
}

async function main() {
  console.log('--- Finding a live match worldwide ---');
  const liveResp = await call('/fixtures/live');
  const live = liveResp.data ?? [];
  console.log(`${live.length} live fixtures found.`);
  if (live.length === 0) {
    console.log('No live match anywhere right now -- nothing to listen to.');
    return;
  }
  const match = live[0];
  console.log(`Listening to: ${match.homeTeam?.name} vs ${match.awayTeam?.name} (id=${match.id}, status=${match.status})`);

  const apiKey = process.env.GOAL_API_KEY;
  const tokenRes = await fetch(`${BASE_URL}/ws/token`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` } });
  const { data: tokenData } = JSON.parse(await tokenRes.text());

  await new Promise((resolve) => {
    const ws = new WebSocket(`wss://api.goal-api.com/ws?wsToken=${tokenData.token}`);
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
    const timeout = setTimeout(() => {
      console.log('Listening window elapsed -- closing.');
      finish();
    }, 25000);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'auth', token: tokenData.token }));
    });
    ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        console.log('Non-JSON message:', event.data);
        return;
      }
      if (msg.type === 'auth_success') {
        console.log('Authenticated, subscribing to match', match.id);
        ws.send(JSON.stringify({ type: 'subscribe', resource: 'match', matchId: String(match.id) }));
        return;
      }
      if (msg.type === 'subscribe_response') {
        console.log('subscribe_response:', JSON.stringify(msg));
        return;
      }
      if (msg.type === 'match_update') {
        console.log('=== match_update ===');
        console.log(JSON.stringify(msg.data, null, 2));
        return;
      }
      console.log('Other message:', JSON.stringify(msg));
    });
    ws.addEventListener('close', (event) => {
      console.log('WS closed:', event.code, event.reason);
      clearTimeout(timeout);
      finish();
    });
    ws.addEventListener('error', (event) => {
      console.log('WS error:', event.message ?? event);
    });
  });
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
