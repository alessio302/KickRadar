// Temporary diagnostic (per this project's usual pattern) -- user wants to
// evaluate Sportmonks as a football data source but couldn't quickly tell
// from their pricing page what the free plan actually includes (which
// leagues/endpoints, rate limits, data completeness). This hits Sportmonks'
// live v3 API directly with a real key (this sandbox has no general
// internet access, hence running it as a GitHub Actions job instead) and
// dumps raw responses rather than assuming the current API shape from
// training data, which may be stale. One-off script, removed once answered.
//
// Auth: Sportmonks v3 accepts the token as an `api_token` query param on
// every request -- the one auth mechanism documented as always available
// regardless of plan.
const API_TOKEN = process.env.SPORTMONKS_API_KEY;
const BASE_URL = 'https://api.sportmonks.com/v3/football';

const TARGET_LEAGUES = ['Serie A', 'Bundesliga', 'Premier League', 'Ligue 1', 'La Liga'];

if (!API_TOKEN) {
  console.error('SPORTMONKS_API_KEY is not set -- get a free key at sportmonks.com and add it as a repo secret.');
  process.exit(1);
}

async function callApi(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('api_token', API_TOKEN);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const redactedUrl = url.toString().replace(API_TOKEN, '***');
  console.log(`\n--- GET ${redactedUrl} ---`);
  try {
    const res = await fetch(url);
    const rateHeaders = {};
    for (const [k, v] of res.headers.entries()) {
      if (k.toLowerCase().includes('rate') || k.toLowerCase().includes('limit')) rateHeaders[k] = v;
    }
    console.log('status:', res.status);
    if (Object.keys(rateHeaders).length) console.log('rate-limit headers:', JSON.stringify(rateHeaders));
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      console.log('non-JSON body (first 500 chars):', text.slice(0, 500));
      return null;
    }
    // Sportmonks embeds subscription/plan/rate-limit info directly in the
    // response envelope -- that's the authoritative "what does free mean
    // for THIS key" answer, more reliable than any docs page.
    if (body.subscription) console.log('subscription:', JSON.stringify(body.subscription, null, 2));
    if (body.rate_limit) console.log('rate_limit:', JSON.stringify(body.rate_limit, null, 2));
    if (body.message) console.log('message:', body.message);
    if (body.error) console.log('error:', JSON.stringify(body.error, null, 2));
    return body;
  } catch (err) {
    console.log('request failed:', err.message);
    return null;
  }
}

async function main() {
  console.log('=== 1. What leagues does this key actually have access to? ===');
  const myLeagues = await callApi('/my/leagues');
  const includedNames = (myLeagues?.data || []).map((l) => l.name);
  console.log('included league count:', includedNames.length);
  console.log('included league names:', JSON.stringify(includedNames.sort()));

  console.log('\n=== 2. Do our five target leagues exist in Sportmonks at all, and are they included? ===');
  for (const name of TARGET_LEAGUES) {
    const result = await callApi(`/leagues/search/${encodeURIComponent(name)}`);
    const matches = (result?.data || []).map((l) => ({ id: l.id, name: l.name, country_id: l.country_id }));
    const isIncluded = matches.some((m) => includedNames.includes(m.name));
    console.log(`"${name}" -> found: ${JSON.stringify(matches)} | included in this plan: ${isIncluded}`);
  }

  console.log('\n=== 3. Data quality/quantity sample: today\'s fixtures with participants+scores ===');
  const today = new Date().toISOString().slice(0, 10);
  const fixtures = await callApi(`/fixtures/date/${today}`, { include: 'participants;scores' });
  const fixtureList = fixtures?.data || [];
  console.log('fixture count today:', fixtureList.length);
  console.log(
    'sample (first 3):',
    JSON.stringify(
      fixtureList.slice(0, 3).map((f) => ({
        id: f.id,
        name: f.name,
        starting_at: f.starting_at,
        participants: f.participants?.map((p) => p.name),
        scores: f.scores?.length,
      })),
      null,
      2
    )
  );

  console.log('\n=== 4. Root API call for overall plan/rate-limit metadata ===');
  await callApi('/leagues', { per_page: 1 });
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
