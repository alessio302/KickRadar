// Temporary diagnostic: does GOAL API expose a direct "every team in this
// league" endpoint, rather than needing to sample fixture dates across a
// season to eventually see every club as home or away at least once?
const BASE_URL = process.env.GOAL_API_BASE_URL || 'https://api.goal-api.com/v1';
const apiKey = process.env.GOAL_API_KEY;
const SERIE_A_ID = 'cmr77dvpd006yrx06zig7907g';

const CANDIDATES = [
  `/leagues/${SERIE_A_ID}/teams`,
  `/leagues/${SERIE_A_ID}/standings`,
  `/leagues/${SERIE_A_ID}`,
];

async function tryEndpoint(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const body = await res.text();
  console.log(`\n=== ${path} ===`);
  console.log('status:', res.status);
  if (res.ok) {
    const parsed = JSON.parse(body);
    console.log('top-level keys:', Object.keys(parsed));
    const data = parsed.data;
    if (Array.isArray(data)) {
      console.log('data is array, length:', data.length);
      console.log('first item:', JSON.stringify(data[0], null, 2).slice(0, 500));
    } else if (data && typeof data === 'object') {
      console.log('data keys:', Object.keys(data));
    }
  } else {
    console.log('body:', body.slice(0, 200));
  }
}

async function main() {
  for (const path of CANDIDATES) await tryEndpoint(path);
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
