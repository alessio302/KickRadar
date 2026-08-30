import * as cheerio from 'cheerio';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const LIVE_BLOG_URL =
  'https://www.skysports.com/football/live-blog/11661/12476234/transfer-centre-live-football-transfer-news-updates-and-rumours';

async function main() {
  const res = await fetch(LIVE_BLOG_URL, { headers: { 'User-Agent': UA } });
  const html = await res.text();
  const $ = cheerio.load(html);

  // Find the element containing "Hutchinson" and walk up to find the
  // repeating per-entry container, then print that container's outer HTML
  // plus its parent's structure so we can see the actual class names/data
  // attributes used for each individual timestamped update.
  const hutchinsonNode = $('*').filter((_, el) => {
    const text = $(el).contents().filter((_, c) => c.type === 'text').text();
    return text.includes('Hutchinson');
  }).first();

  console.log('Direct text-node match count:', hutchinsonNode.length);

  // Walk up a few ancestor levels from wherever "Hutchinson" appears in the
  // raw text (broader search, not just direct text nodes) and print each
  // level's tag+class so we can spot the per-entry wrapper.
  const anyMatch = $('body *').filter((_, el) => $(el).text().includes('Hutchinson')).first();
  let node = anyMatch;
  for (let i = 0; i < 8 && node.length; i++) {
    console.log(`\n--- ancestor level ${i}: <${node.prop('tagName')} class="${node.attr('class') || ''}" id="${node.attr('id') || ''}" data-testid="${node.attr('data-testid') || ''}"> (text length ${node.text().length}) ---`);
    node = node.parent();
  }

  // Try to find the smallest ancestor whose text length looks like "one
  // blog entry" (roughly 200-2000 chars) rather than the whole page or a
  // single inline element -- print its full outer HTML for inspection.
  let candidate = anyMatch;
  for (let i = 0; i < 8 && candidate.length; i++) {
    const len = candidate.text().length;
    if (len > 150 && len < 3000) {
      console.log(`\n=== Candidate entry container at ancestor level ${i}, text length ${len} ===`);
      console.log($.html(candidate));
      break;
    }
    candidate = candidate.parent();
  }

  // Count how many sibling elements share the same tag+class as that
  // candidate's parent, to confirm it's a repeating list (one per update).
  if (candidate.length) {
    const cls = candidate.attr('class');
    const tag = candidate.prop('tagName');
    if (cls) {
      const selector = `${tag}.${cls.trim().split(/\s+/).join('.')}`;
      console.log(`\nSibling count for selector "${selector}":`, $(selector).length);
    }
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
