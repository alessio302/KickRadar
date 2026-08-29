import marca from './sources/marca.js';
import skysports from './sources/skysports.js';
import kicker from './sources/kicker.js';

// Throwaway diagnostic: from the real GitHub Actions runner (not this
// sandbox, whose own network path already 403'd against marca.com --
// unreliable signal for what production actually sees), how many items
// does each of the three currently-quiet sources' fetchLatest() actually
// return right now? Read-only, no DB writes.
async function check(name, source) {
  try {
    const items = await source.fetchLatest();
    console.log(`${name}: ${items.length} items`);
    console.log(JSON.stringify(items.slice(0, 5), null, 2));
  } catch (err) {
    console.error(`${name} fetchLatest FAILED:`, err.message);
  }
}

async function main() {
  await check('marca', marca);
  await check('skysports', skysports);
  await check('kicker', kicker);
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
