// Read-only: reproduces articleBody.js's exact extraction against the
// specific URL that produced the Lucumí/Bologna false-positive transfer,
// to check whether the page actually has an <article> tag (scoping
// extraction to just this one story) or whether it fell back to the whole
// <body> -- which would pull in unrelated sidebar/ticker content from the
// same page and explain where a stray "Bologna" could have come from.
import * as cheerio from 'cheerio';

const URL = 'https://www.tuttomercatoweb.com/juventus/?action=read&idnet=dHV0dG9qdXZlLmNvbS03OTA3NTc';

async function main() {
  const res = await fetch(URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  console.log('status', res.status);
  const html = await res.text();
  const $ = cheerio.load(html);

  const articleCount = $('article').length;
  console.log('article tag count on page:', articleCount);

  const scope = articleCount > 0 ? $('article') : $('body');
  const paragraphs = scope
    .find('p')
    .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter((text) => text.length >= 40);
  const text = paragraphs.join(' ').slice(0, 3000);

  console.log('--- extracted text actually sent to the LLM ---');
  console.log(text);
  console.log('--- mentions "Bologna"? ---', /bologna/i.test(text));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
