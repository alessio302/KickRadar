// Read-only: articleBody.js's fetchArticleText() returns null for every
// footmercato.net article URL tested (confirmed via diagnoseBarcolaSummary.js),
// meaning the LLM has only ever gotten the bare headline for this source,
// not real article content -- explains info-poor AI summaries. Reproduce
// the raw fetch + parse manually to find exactly where it comes up empty.
import * as cheerio from 'cheerio';

const URL = 'https://www.footmercato.net/a8727845282578719811-tout-est-boucle-entre-liverpool-et-le-psg-pour-le-transfert-de-bradley-barcola';

async function main() {
  const res = await fetch(URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  console.log('status', res.status, res.statusText);
  console.log('final url (after redirects)', res.url);
  const html = await res.text();
  console.log('html length', html.length);

  const $ = cheerio.load(html);
  console.log('article tag count', $('article').length);
  console.log('body <p> count', $('body').find('p').length);
  console.log('total <p> count anywhere', $('p').length);

  const allParagraphTexts = $('p')
    .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter((t) => t.length > 0);
  console.log('non-empty <p> texts:', allParagraphTexts.length);
  console.log(JSON.stringify(allParagraphTexts.slice(0, 20), null, 2));

  console.log('--- first 1500 chars of raw HTML ---');
  console.log(html.slice(0, 1500));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
