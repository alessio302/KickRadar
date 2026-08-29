// Read-only: verify the articleBody.js fallback fix (fall back to <body>
// when the <article>-scoped extraction comes up empty) actually recovers
// real text for the footmercato URL that previously returned null.
import { fetchArticleText } from './articleBody.js';

const URL = 'https://www.footmercato.net/a8727845282578719811-tout-est-boucle-entre-liverpool-et-le-psg-pour-le-transfert-de-bradley-barcola';

async function main() {
  const text = await fetchArticleText(URL);
  console.log('length:', text?.length ?? 0);
  console.log(text);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
