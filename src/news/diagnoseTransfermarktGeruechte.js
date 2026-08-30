const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const URL_TO_CHECK =
  'https://www.transfermarkt.de/geruchtekuche/detail/forum/154/gk_group/nationalCompetitions/gk_wettbewerb_id/L1';

function snippetAround(text, pattern, radius = 400) {
  const idx = text.search(pattern);
  if (idx === -1) return null;
  return text.slice(Math.max(0, idx - radius), idx + radius);
}

async function main() {
  const res = await fetch(URL_TO_CHECK, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'de-DE,de;q=0.9',
    },
  });
  console.log('Fetch status:', res.status);
  const html = await res.text();
  console.log('HTML length:', html.length);

  // Bot-block/challenge detection
  for (const pattern of [/cloudflare/i, /captcha/i, /access denied/i, /just a moment/i, /cf-browser-verification/i]) {
    if (pattern.test(html)) console.log('POSSIBLE BLOCK PAGE, matched:', pattern);
  }

  for (const pattern of [
    /application\/ld\+json/i,
    /__NEXT_DATA__/,
    /LiveBlogPosting/i,
    /class="items"/i,
    /gk_forum_id/i,
    /class="rumour/i,
    /table class/i,
  ]) {
    const snip = snippetAround(html, pattern);
    console.log(`\nPattern ${pattern}:`, snip ? 'FOUND' : 'not found');
  }

  const bodyIdx = html.indexOf('<body');
  console.log('\n=== First 2500 chars from body ===\n');
  console.log(html.slice(bodyIdx, bodyIdx + 2500));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
