// Read-only: resolves the contradiction between GOAL API's pricing page
// ("1 concurrent live connection, follow 25 live matches") and its docs
// table (FREE plan = 0 concurrent match subscriptions) by actually
// connecting and trying to subscribe, on our real FREE-tier key.
const BASE_URL = 'https://api.goal-api.com/v1';

async function main() {
  const apiKey = process.env.GOAL_API_KEY;
  if (!apiKey) throw new Error('Missing GOAL_API_KEY env var.');

  console.log('--- Step 1: exchange API key for a WS connection token ---');
  const tokenRes = await fetch(`${BASE_URL}/ws/token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const tokenBody = await tokenRes.text();
  console.log(`POST /ws/token: ${tokenRes.status}`, tokenBody);
  if (!tokenRes.ok) return;
  const { data } = JSON.parse(tokenBody);
  console.log('Token acquired, expiresIn:', data.expiresIn);

  console.log('--- Step 2: open WebSocket and authenticate ---');
  await new Promise((resolve) => {
    const ws = new WebSocket(`wss://api.goal-api.com/ws?wsToken=${data.token}`);
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
      console.log('Timed out waiting for further messages -- closing.');
      finish();
    }, 15000);

    ws.addEventListener('open', () => {
      console.log('WS open, sending auth...');
      ws.send(JSON.stringify({ type: 'auth', token: data.token }));
    });

    ws.addEventListener('message', (event) => {
      console.log('WS message:', event.data);
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'auth_success') {
        console.log('Authenticated. Requesting status...');
        ws.send(JSON.stringify({ type: 'status' }));
        // Try subscribing to an arbitrary match id -- even if it's not a
        // real/live fixture, the subscribe_response itself (accepted vs.
        // a plan-limit error) tells us what FREE actually allows.
        ws.send(JSON.stringify({ type: 'subscribe', resource: 'match', matchId: 'test-diagnostic-id' }));
      }
      if (msg.type === 'error' || msg.type === 'subscribe_response') {
        clearTimeout(timeout);
        setTimeout(finish, 1000); // give one more tick for any trailing message
      }
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
