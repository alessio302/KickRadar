import { createHtmlSource } from '../htmlSource.js';

// Foot Mercato's dedicated Ligue 1 transfers section -- confirmed live
// (diagnoseLigue1Sources.js) as a real, actively updated page, and a much
// better fit than the old rmcsport.js source: RMC Sport's general
// "Transferts" hub mostly surfaced big pan-European storylines (Man City,
// Chelsea, Barcelona, Atletico) rather than Ligue 1-specific ones -- of a
// sample of ~20 items that passed relevance.js, only ~5 distinct stories
// actually involved a Ligue 1 club, the rest got silently (correctly)
// dropped by runNewsScraper.js's league gate, wasting most of its LLM
// calls. This page is scoped to Ligue 1 by the site itself, the same
// situation tuttomercatoweb/marca are in -- no relevance.js keyword gate
// needed here either (see relevance.js's comment on why one would be
// redundant/harmful for a dedicated section).
const base = createHtmlSource({
  sourceKey: 'footmercato',
  listUrlEnvVar: 'FOOTMERCATO_LIST_URL',
  defaultListUrl: 'https://www.footmercato.net/france/ligue-1/transfert',
  itemSelectorEnvVar: 'FOOTMERCATO_ITEM_SELECTOR',
  // Foot Mercato's own article URL scheme (footmercato.net/a<id>-<slug>)
  // is itself the signal -- confirmed live this cleanly separates real
  // articles from the page's nav links (/live/, /programme-tv/,
  // /classement/, /transferts-en-direct), none of which match it. More
  // robust than a CSS class name (what marca.js/the old rmcsport.js rely
  // on), since it doesn't depend on the page's current markup/theme.
  defaultItemSelector: 'a[href^="https://www.footmercato.net/a"]',
  titleSelectorEnvVar: 'FOOTMERCATO_TITLE_SELECTOR',
  defaultTitleSelector: '',
  linkSelectorEnvVar: 'FOOTMERCATO_LINK_SELECTOR',
  defaultLinkSelector: '',
  baseUrl: 'https://www.footmercato.net',
});

// Confirmed live: the page repeats the same set of articles across two
// widgets (a featured list and a "recent" ticker), each formatted
// differently -- "<headline> HH:MM - <competition>" (today's items) or
// "<headline> DD/MM - <competition>" (older ones) in one, "HH:MM
// <headline>" in the other -- but linking to the exact same article URL.
// Deduping by link here (not just relying on runNewsScraper.js's
// seen-item check, which only guards *across* runs -- the in-memory
// knownIds set it builds isn't updated mid-run, so two same-URL items in
// one fetch both slip past it) avoids two near-identical LLM calls for
// literally the same story on every single scrape.
//
// Anchors also wrap other inline elements (an "Exclu FM" exclusive badge,
// the timestamp/competition tag itself), so .text() -- confirmed live --
// concatenates their text nodes with the source markup's original
// whitespace/newlines intact, not just the visible label. Collapsing
// whitespace first is what makes the timestamp/date pattern below
// reliably matchable at all.
const STAMP = /\d{2}:\d{2}|\d{2}\/\d{2}/;
const STAMP_PREFIX = new RegExp(`^(?:${STAMP.source})\\s*`);
const STAMP_SUFFIX = new RegExp(`\\s+(?:${STAMP.source})\\s*-\\s*.+$`);

function cleanTitle(title) {
  const collapsed = title.replace(/\s+/g, ' ').trim();
  return collapsed.replace(STAMP_PREFIX, '').replace(STAMP_SUFFIX, '').trim();
}

export default {
  sourceKey: base.sourceKey,
  async fetchLatest() {
    const items = await base.fetchLatest();
    const seenLinks = new Set();
    const deduped = [];
    for (const item of items) {
      if (seenLinks.has(item.link)) continue;
      seenLinks.add(item.link);
      deduped.push({ ...item, title: cleanTitle(item.title), summary: cleanTitle(item.summary) });
    }
    return deduped;
  },
};
