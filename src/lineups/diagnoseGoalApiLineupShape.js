// Read-only: prints only the *shape* (key names at each level, array
// lengths) of GOAL API's /fixtures/:id/lineups response, not the full
// player data -- need the exact structure before writing the real
// transform from this shape into our lineups table's existing
// { initialLineup, substitutes } JSON format.
const BASE_URL = 'https://api.goal-api.com/v1';

async function call(path) {
  const apiKey = process.env.GOAL_API_KEY;
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const body = await res.text();
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${body}`);
  return JSON.parse(body);
}

function shapeOf(value, depth = 0) {
  if (depth > 4) return '...';
  if (Array.isArray(value)) {
    return value.length === 0 ? '[]' : [`array(${value.length})`, shapeOf(value[0], depth + 1)];
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = shapeOf(v, depth + 1);
    return out;
  }
  return typeof value;
}

async function main() {
  const fixtureId = 'cmsvp48ia9b7rpg07w5n7rhbg'; // Bayern-Stuttgart, already known
  const resp = await call(`/fixtures/${fixtureId}/lineups`);
  console.log(JSON.stringify(shapeOf(resp), null, 2));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
