// Throwaway diagnostic: user's dashboard screenshot shows "1.000 of 1.000
// requests used" for GOAL API's daily quota, but doesn't show WHEN that
// resets. A single raw fetch (no retry loop, unlike goalApiClient.js's
// call()) against any lightweight endpoint should still come back with a
// 429 whose headers may carry an explicit reset timestamp (beyond the
// already-known Retry-After, which only covers the separate 15-min
// sliding window, not this daily bucket). Prints every response header
// so nothing is missed. Read-only, and since the quota is already fully
// exhausted, one more rejected call costs nothing further.
async function main() {
  const apiKey = process.env.GOAL_API_KEY;
  const baseUrl = process.env.GOAL_API_BASE_URL || 'https://api.goal-api.com/v1';

  const res = await fetch(`${baseUrl}/leagues/cmr77dvpd006yrx06zig7907g/fixtures?date=2026-08-29`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  console.log(`Status: ${res.status} ${res.statusText}`);
  console.log('All response headers:');
  for (const [key, value] of res.headers.entries()) {
    console.log(`  ${key}: ${value}`);
  }
  console.log('Body:', await res.text());
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
