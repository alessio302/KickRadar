// Throwaway diagnostic: is GOAL API's rate limit right now a genuine
// daily-quota exhaustion (X-RateLimit-Remaining near 0) or a short-term
// throttle despite headroom left? The retry-with-backoff in
// goalApiClient.js's call() doesn't capture response headers at all, so
// this bypasses it with a raw fetch to see exactly what GOAL API reports.
async function main() {
  const apiKey = process.env.GOAL_API_KEY;
  const base = process.env.GOAL_API_BASE_URL || 'https://api.goal-api.com/v1';
  const url = `${base}/leagues/cmr77dvkr005nrx06lp7rvp49/fixtures?date=2026-08-29`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  const headers = {};
  for (const [key, value] of res.headers.entries()) {
    if (/ratelimit|retry-after/i.test(key)) headers[key] = value;
  }
  const body = await res.text();
  console.log('Status:', res.status, res.statusText);
  console.log('Rate-limit headers:', JSON.stringify(headers, null, 2));
  console.log('Body:', body.slice(0, 500));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
