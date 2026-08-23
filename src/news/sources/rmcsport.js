import { createHtmlSource } from '../htmlSource.js';

// RMC Sport has no reliable public RSS feed for transfer news, so this
// falls back to HTML scraping of the transfer listing page per the
// briefing ("RSS wo verfügbar, sonst HTML-Scraping"). Selectors are best
// guesses -- confirm against the live DOM and override via env vars if
// the site structure differs (see README).
const base = createHtmlSource({
  sourceKey: 'rmcsport',
  listUrlEnvVar: 'RMCSPORT_LIST_URL',
  defaultListUrl: 'https://rmcsport.bfmtv.com/football/transferts/',
  itemSelectorEnvVar: 'RMCSPORT_ITEM_SELECTOR',
  defaultItemSelector: 'article a[href*="/football/"], a[href*="/transferts/"]',
  titleSelectorEnvVar: 'RMCSPORT_TITLE_SELECTOR',
  defaultTitleSelector: '',
  linkSelectorEnvVar: 'RMCSPORT_LINK_SELECTOR',
  defaultLinkSelector: '',
  baseUrl: 'https://rmcsport.bfmtv.com',
});

// Confirmed live: the generic item selector also picks up two kinds of
// noise specific to this page's markup, both cleaned up here rather than
// in the shared htmlSource.js factory (RMC Sport-specific quirks):
//
// 1. A date badge + category label sit right next to the headline text
//    inside the same <a>, with no separating space in the markup, e.g.
//    "18/08 FootballMercato: Djibril Sidibé signe..." -- stripped so the
//    stored summary and the name-extraction heuristic both see just the
//    real headline.
// 2. Section nav links ("Tout le mercato Bundesliga", "Mercato Serie A",
//    "Mercato LaLiga", ...) match the same selector as real articles but
//    aren't articles at all -- dropped entirely. Real article titles from
//    this source always contain a ':' separator ("Mercato: ...", "Paris FC
//    / Mercato : ..."); nav links never do, which is what tells them apart
//    (both start with the same "(Tout le )?mercato" prefix otherwise).
const BOILERPLATE_PREFIX = /^\d{2}\/\d{2}\s*Football(?:Mercato|Info RMC Sport\.?|La)?:?\s*/i;
const NAV_LINK_PATTERN = /^(Tout le )?mercato\b/i;

function isNavLink(title) {
  return NAV_LINK_PATTERN.test(title) && !title.includes(':');
}

function cleanText(text) {
  return text.replace(BOILERPLATE_PREFIX, '').trim();
}

export default {
  sourceKey: base.sourceKey,
  async fetchLatest() {
    const items = await base.fetchLatest();
    return items
      .filter((item) => !isNavLink(item.title))
      .map((item) => ({
        ...item,
        title: cleanText(item.title),
        summary: cleanText(item.summary),
      }));
  },
};
