import { createHtmlSource } from '../htmlSource.js';

// Marca has a dedicated transfer-market section ("Mercado de Fichajes"),
// but no reliable public RSS feed for it (same situation as RMC Sport) --
// falls back to HTML scraping of the section page. Selectors are a best
// guess (Unidad Editorial's shared CMS templates typically render teasers
// as `article` elements linking into `/futbol/`); confirm against the live
// DOM and override via env vars if the site structure differs (see README
// -- this sandbox has no general internet access to verify against the
// real page, same caveat as every other source here).
const base = createHtmlSource({
  sourceKey: 'marca',
  listUrlEnvVar: 'MARCA_LIST_URL',
  defaultListUrl: 'https://www.marca.com/futbol/mercado-fichajes.html',
  itemSelectorEnvVar: 'MARCA_ITEM_SELECTOR',
  defaultItemSelector: 'article a[href*="/futbol/"]',
  titleSelectorEnvVar: 'MARCA_TITLE_SELECTOR',
  defaultTitleSelector: '',
  linkSelectorEnvVar: 'MARCA_LINK_SELECTOR',
  defaultLinkSelector: '',
  baseUrl: 'https://www.marca.com',
});

export default base;
