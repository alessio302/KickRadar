import fichajes from './sources/fichajes.js';

async function main() {
  const items = await fichajes.fetchLatest();
  console.log('Total items:', items.length);
  for (const item of items.slice(0, 5)) {
    console.log('\n---');
    console.log('title:', item.title);
    console.log('link:', item.link);
    console.log('guid:', item.guid);
    console.log('publishedAt:', item.publishedAt);
    console.log('summary (first 200):', item.summary.slice(0, 200));
  }
  // Confirm guids are all distinct (the earlier bug risk: a shared link
  // would be fine since guid is used preferentially, but if guid
  // generation itself collided that would silently drop entries).
  const uniqueGuids = new Set(items.map((i) => i.guid));
  console.log('\nUnique guids:', uniqueGuids.size, '/', items.length);
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
