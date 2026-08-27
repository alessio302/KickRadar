// One-off: verifies footmercato.js's actual fetchLatest() output end-to-end
// (item count, title cleaning, link-based dedup of the page's two repeated
// widgets) before trusting it in the real hourly scraper. Read-only, no DB
// writes, no secrets needed.
import footmercato from './sources/footmercato.js';
import { classifyOfficial } from './classify.js';

async function main() {
  const items = await footmercato.fetchLatest();
  console.log(`fetched ${items.length} deduped items`);
  for (const item of items) {
    const official = classifyOfficial('footmercato', `${item.title} ${item.summary}`);
    console.log(`  ${official ? '[OFFICIAL]' : '[rumor]  '} "${item.title}" -> ${item.link}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
