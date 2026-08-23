import { createHtmlSource } from '../htmlSource.js';

// RMC Sport has no reliable public RSS feed for transfer news, so this
// falls back to HTML scraping of the transfer listing page per the
// briefing ("RSS wo verfügbar, sonst HTML-Scraping"). Selectors are best
// guesses -- confirm against the live DOM and override via env vars if
// the site structure differs (see README).
export default createHtmlSource({
  sourceKey: 'rmcsport',
  listUrlEnvVar: 'RMCSPORT_LIST_URL',
  defaultListUrl: 'https://rmcsport.bfmtv.com/football/mercato/',
  itemSelectorEnvVar: 'RMCSPORT_ITEM_SELECTOR',
  defaultItemSelector: 'article a.article-link, article a[href*="/football/"]',
  titleSelectorEnvVar: 'RMCSPORT_TITLE_SELECTOR',
  defaultTitleSelector: '',
  linkSelectorEnvVar: 'RMCSPORT_LINK_SELECTOR',
  defaultLinkSelector: '',
  baseUrl: 'https://rmcsport.bfmtv.com',
});
