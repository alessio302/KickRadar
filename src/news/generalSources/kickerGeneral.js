import { createRssSource } from '../rssSource.js';

// Same feed URL as the transfers pipeline's own sources/kicker.js, but a
// DIFFERENT sourceKey ('kicker-general' vs 'kicker') on purpose --
// seen_news_items is keyed by (source, external_id), and the two scrapers
// (runNewsScraper.js for transfers, runGeneralNewsScraper.js for this News
// tab) run independently. Sharing the 'kicker' key would mean whichever
// pipeline happens to process a given article first marks it "seen" for
// BOTH, silently starving the other of an article it never got a chance to
// evaluate -- confirmed as the exact failure mode to avoid, not (yet)
// observed live.
export default createRssSource({
  sourceKey: 'kicker-general',
  feedUrlEnvVar: 'KICKER_GENERAL_RSS_URL',
  defaultFeedUrl: 'https://newsfeed.kicker.de/news/bundesliga',
});
