// One-off diagnostic: does football-data.org's v4 match object carry a live
// minute (`minute`, `injuryTime`) for matches that are actually in play?
// Read-only, two requests total. Run via the diagnose-football-data-minute
// workflow (workflow_dispatch only) while at least one match is live.
const BASE_URL = 'https://api.football-data.org/v4';

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY },
  });
  const body = await res.text();
  return { status: res.status, body };
}

const list = await get('/matches?status=IN_PLAY,PAUSED');
console.log(`GET /matches?status=IN_PLAY,PAUSED -> HTTP ${list.status}`);
if (list.status !== 200) {
  console.log(list.body.slice(0, 500));
  process.exit(0);
}

const { matches = [] } = JSON.parse(list.body);
console.log(`live matches returned: ${matches.length}`);
for (const m of matches) {
  console.log(
    `  id=${m.id} ${m.competition?.code} status=${m.status} minute=${JSON.stringify(m.minute)} ` +
      `injuryTime=${JSON.stringify(m.injuryTime)} utcDate=${m.utcDate} ` +
      `keys=${Object.keys(m).join(',')}`
  );
}

if (matches[0]) {
  const single = await get(`/matches/${matches[0].id}`);
  console.log(`GET /matches/${matches[0].id} -> HTTP ${single.status}`);
  if (single.status === 200) {
    const m = JSON.parse(single.body);
    console.log(`  single: status=${m.status} minute=${JSON.stringify(m.minute)} injuryTime=${JSON.stringify(m.injuryTime)}`);
  }
}
