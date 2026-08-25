import kicker from './sources/kicker.js';
import skysports from './sources/skysports.js';
import rmcsport from './sources/rmcsport.js';
import { isTransferRelevant } from './relevance.js';

// Read-only diagnostic (no DB writes) for the "very few new transfers for
// leagues other than Serie A" report. Fetches each non-Serie-A source's raw
// item list and shows how many survive relevance.js's keyword gate --
// mirrors the earlier tuttomercatoweb investigation, where a too-narrow
// keyword list turned out to be silently dropping real transfer stories.
// Run via workflow_dispatch (see diagnose-source-volume.yml) and share the
// logs -- this sandbox has no live network access to these sites.
const SOURCES = [kicker, skysports, rmcsport];

async function run() {
  for (const source of SOURCES) {
    console.log(`\n=== ${source.sourceKey} ===`);
    let items;
    try {
      items = await source.fetchLatest();
    } catch (err) {
      console.error(`fetchLatest failed: ${err.message}`);
      continue;
    }
    console.log(`fetched ${items.length} raw items`);

    const passed = [];
    const rejected = [];
    for (const item of items) {
      const text = `${item.title} ${item.summary || ''}`;
      if (isTransferRelevant(source.sourceKey, text)) passed.push(item);
      else rejected.push(item);
    }
    console.log(`${passed.length} passed relevance filter, ${rejected.length} rejected`);

    console.log('-- passed (would go to LLM extraction) --');
    for (const item of passed.slice(0, 20)) console.log(`  [PASS] ${item.title}`);

    console.log('-- rejected (dropped before LLM) --');
    for (const item of rejected.slice(0, 30)) console.log(`  [DROP] ${item.title}`);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
