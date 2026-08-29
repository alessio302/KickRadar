// Read-only: GOAL API's response headers (X-RateLimit-Limit: 1000, type:
// DAILY) only describe the daily bucket -- a real call sequence still hit
// 429 RATE_LIMIT_EXCEEDED after just ~3s of spacing, well under that daily
// number, so there's a second, tighter (per-second/per-minute) limit the
// headers don't surface. Finds the real safe interval empirically by
// firing the same request at increasing delays and seeing which gap the
// 429 stops appearing at, instead of guessing.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probe(label) {
  const apiKey = process.env.GOAL_API_KEY;
  const start = Date.now();
  const res = await fetch('https://api.goal-api.com/v1/players?search=Messi', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const elapsed = Date.now() - start;
  console.log(
    `[${label}] status=${res.status} elapsed=${elapsed}ms retry-after=${res.headers.get('retry-after')} ` +
      `x-ratelimit-remaining=${res.headers.get('x-ratelimit-remaining')} x-ratelimit-type=${res.headers.get('x-ratelimit-type')}`
  );
  return res.status;
}

const DELAYS_MS = [0, 1000, 2000, 4000, 6000, 8000, 10000, 15000];

async function main() {
  for (const delay of DELAYS_MS) {
    await sleep(delay);
    const status = await probe(`gap=${delay}ms`);
    if (status === 200 && delay > 0) {
      // Confirm it's not a fluke -- fire one more at the same gap.
      await sleep(delay);
      const confirmStatus = await probe(`gap=${delay}ms (confirm)`);
      if (confirmStatus === 200) {
        console.log(`\nFirst reliably-safe gap found: ${delay}ms`);
        return;
      }
    }
  }
  console.log('\nNo gap up to 15s was reliably safe -- limit may be lower still, or based on something other than time (e.g. a small burst bucket).');
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
