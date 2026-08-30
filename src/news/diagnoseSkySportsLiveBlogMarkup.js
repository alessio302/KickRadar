const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const LIVE_BLOG_URL =
  'https://www.skysports.com/football/live-blog/11661/12476234/transfer-centre-live-football-transfer-news-updates-and-rumours';

async function main() {
  const res = await fetch(LIVE_BLOG_URL, { headers: { 'User-Agent': UA } });
  const html = await res.text();
  console.log('HTML length:', html.length);

  const idx = html.indexOf('Hutchinson');
  console.log('First "Hutchinson" at index:', idx);
  if (idx === -1) return;

  // Print generous context around the first mention so we can see the
  // opening tag(s)/class names/data attributes that wrap one blog entry,
  // and where the previous/next entry's own wrapper starts.
  console.log('\n=== 2500 chars before ===\n');
  console.log(html.slice(Math.max(0, idx - 2500), idx));
  console.log('\n=== 1500 chars after ===\n');
  console.log(html.slice(idx, idx + 1500));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
