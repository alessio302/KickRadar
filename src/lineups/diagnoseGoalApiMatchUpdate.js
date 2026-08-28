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
  console.log('--- Finding live matches worldwide ---');
  const liveResp = await call('/fixtures/live');
  const live = (liveResp.data ?? []).slice(0, 25); // FREE plan's own max subscriptions
  console.log(`${live.length} live fixtures found (subscribing to all of them to raise the odds of catching a real event).`);
  if (live.length === 0) {
    console.log('No live match anywhere right now -- nothing to listen to.');
    return;
  }
  for (const m of live) console.log(`  ${m.id}: ${m.homeTeam?.name} vs ${m.awayTeam?.name}`);

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
    }, 120000);

    let matchUpdateCount = 0;
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
        console.log(`Authenticated, subscribing to ${live.length} matches...`);
        for (const m of live) {
          ws.send(JSON.stringify({ type: 'subscribe', resource: 'match', matchId: String(m.id) }));
        }
        return;
      }
      if (msg.type === 'subscribe_response') {
        console.log('subscribe_response:', JSON.stringify(msg));
        return;
      }
      if (msg.type === 'match_update') {
        matchUpdateCount += 1;
        console.log(`=== match_update #${matchUpdateCount} ===`);
        console.log(JSON.stringify(msg.data, null, 2));
        if (matchUpdateCount >= 3) {
          console.log('Got 3 samples -- that is enough to see the shape, closing early.');
          clearTimeout(timeout);
          finish();
        }
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
