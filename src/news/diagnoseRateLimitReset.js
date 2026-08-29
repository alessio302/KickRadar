// Throwaway diagnostic: the backfill (backfillGoalApiProfiles.js, running
// in news-scraper.yml since 22:07 UTC) hasn't healed a single player in 9
// minutes -- checking whether the daily quota genuinely didn't reset yet,
// or something else is going on. A single raw fetch (no retry loop),
// dumping every response header for a reset indicator beyond the already-
// known Retry-After (which only covers the separate 15-min sliding
// window). One extra call, negligible next to the backfill's own traffic.
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
