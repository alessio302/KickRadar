import skysports from './sources/skysports.js';

async function main() {
  const items = await skysports.fetchLatest();
  console.log('Total items returned:', items.length);

  const liveBlogItems = items.filter((i) => i.skipBodyFetch);
  console.log('Live-blog-derived items:', liveBlogItems.length);

  for (const item of liveBlogItems.slice(0, 10)) {
    console.log('\n---');
    console.log('title:', item.title);
    console.log('link:', item.link);
    console.log('publishedAt:', item.publishedAt);
    console.log('summary:', item.summary.slice(0, 200));
  }

  const hutchinson = items.find((i) => i.title.includes('Hutchinson'));
  console.log('\nHutchinson item found:', !!hutchinson);
  if (hutchinson) console.log(JSON.stringify(hutchinson, null, 2));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
