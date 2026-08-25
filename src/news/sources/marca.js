import { createHtmlSource } from '../htmlSource.js';

// Marca has a dedicated transfer-market section ("Mercado de Fichajes"),
// but no reliable public RSS feed for it (same situation as RMC Sport) --
// falls back to HTML scraping of the section page. Confirmed live
// (diagnoseMarca.js via GitHub Actions): the page is real (200, <title>
// "Mercado de fichajes | MARCA") and `.ue-c-cover-content__link` (Unidad
// Editorial's shared CMS teaser class) is the clean selector -- 46 unique
// items, all real transfer headlines ("Driouech firma con el Celta hasta
// 2030", "Livakovic ya está en Barcelona"), no boilerplate noise. A more
// generic `article a[href*="/futbol/"]` guess was tried first but also
// matched each article's "N comentarios" anchor as a separate (duplicate,
// junk-titled) item. Content isn't La-Liga-exclusive (Bundesliga/Premier
// League moves show up too, since it's Marca's general transfer hub) --
// fine on purpose, same as every other source: runNewsScraper.js resolves
// clubs against all tracked leagues, not just the one a source is assigned
// to.
const base = createHtmlSource({
  sourceKey: 'marca',
  listUrlEnvVar: 'MARCA_LIST_URL',
  defaultListUrl: 'https://www.marca.com/futbol/mercado-fichajes.html',
  itemSelectorEnvVar: 'MARCA_ITEM_SELECTOR',
  defaultItemSelector: '.ue-c-cover-content__link',
  titleSelectorEnvVar: 'MARCA_TITLE_SELECTOR',
  defaultTitleSelector: '',
  linkSelectorEnvVar: 'MARCA_LINK_SELECTOR',
  defaultLinkSelector: '',
  baseUrl: 'https://www.marca.com',
});

export default base;
