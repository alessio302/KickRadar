// Temporary diagnostic (per this project's usual pattern) -- follow-up to
// the first version of this script: that run showed real og:image tags
// ARE present in every checked page, and the exact same regex matches
// them fine in isolation -- yet fetchOgImage() still returned null every
// time. This narrows it down: dumps where in the page (byte offset) the
// first og:image tag actually appears, vs. fetchOgImage()'s own 60000-char
// read cap, to check whether the tag simply sits past that cutoff on this
// site's current page structure.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const URLS = [
  'https://www.bundesliga.com/en/bundesliga/news/harry-kane-100-goals-record-bayern-munich-stuttgart-schalke-union-berlin-38258',
  'https://www.bundesliga.com/en/bundesliga/news/marc-guiu-rb-leipzig-injury-spain-chelsea-39243',
];

async function main() {
  for (const url of URLS) {
    console.log(`\n=== ${url} ===`);
    const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' } });
    const html = await res.text();
    console.log('total length:', html.length);
    const idx = html.indexOf('og:image"');
    console.log('first `og:image"` byte offset:', idx);
    console.log('within 60000-char cap:', idx >= 0 && idx < 60000);
    console.log('context:', html.slice(Math.max(0, idx - 80), idx + 150));
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
