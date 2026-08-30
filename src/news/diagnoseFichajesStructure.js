const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const URL_TO_CHECK = 'https://www.fichajes.com/mercado-directo';

function snippetAround(text, pattern, radius = 400) {
  const idx = text.search(pattern);
  if (idx === -1) return null;
  return text.slice(Math.max(0, idx - radius), idx + radius);
}

async function main() {
  const res = await fetch(URL_TO_CHECK, { headers: { 'User-Agent': UA } });
  console.log('Fetch status:', res.status);
  const html = await res.text();
  console.log('HTML length:', html.length);

  for (const pattern of [
    /application\/ld\+json/i,
    /__NEXT_DATA__/,
    /LiveBlogPosting/i,
    /liveBlogUpdate/i,
    /BlogPosting/i,
    /data-timestamp/i,
    /datetime=/i,
    /wp-json/i,
  ]) {
    const snip = snippetAround(html, pattern);
    console.log(`\nPattern ${pattern}:`, snip ? 'FOUND' : 'not found');
  }

  // Dump every <script type="application/ld+json"> block's first/last 150 chars
  const scriptMatches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  console.log('\nNumber of application/ld+json scripts:', scriptMatches.length);
  scriptMatches.forEach((m, i) => {
    const content = m[1];
    console.log(`\n--- script ${i}: length ${content.length} ---`);
    console.log('First 200:', content.slice(0, 200));
    try {
      const parsed = JSON.parse(content);
      console.log('Parsed OK. @type:', parsed['@type'], 'isArray:', Array.isArray(parsed));
      if (!Array.isArray(parsed)) console.log('Top keys:', Object.keys(parsed));
    } catch (err) {
      console.log('Parse failed:', err.message);
    }
  });

  // Print a broad chunk of raw HTML around the page's main content area
  // for visual inspection (repeating entry markup, class names, etc.)
  const bodyIdx = html.indexOf('<body');
  console.log('\n=== 3000 chars from body start ===\n');
  console.log(html.slice(bodyIdx, bodyIdx + 3000));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
