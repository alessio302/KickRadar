import marca from './sources/marca.js';
import { isTransferRelevant } from './relevance.js';

// Read-only diagnostic (no DB writes), final check before deleting this
// script: runs the real marca.js source module (confirmed selector) through
// the real relevance.js keyword gate, same shape as diagnoseSourceVolume.js
// did for the original 4 sources. Run via workflow_dispatch (see
// diagnose-marca.yml).
async function run() {
  const items = await marca.fetchLatest();
  console.log(`fetched ${items.length} raw items`);

  const passed = [];
  const rejected = [];
  for (const item of items) {
    const text = `${item.title} ${item.summary || ''}`;
    if (isTransferRelevant('marca', text)) passed.push(item);
    else rejected.push(item);
  }
  console.log(`${passed.length} passed relevance filter, ${rejected.length} rejected`);

  console.log('-- passed (would go to LLM extraction) --');
  for (const item of passed) console.log(`  [PASS] ${item.title} -> ${item.link}`);

  console.log('-- rejected (dropped before LLM) --');
  for (const item of rejected) console.log(`  [DROP] ${item.title}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
