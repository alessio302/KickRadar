import { createRssSource } from '../rssSource.js';

// Official Bundesliga feed -- confirmed live (diagnoseGeneralNewsFeeds.js)
// as the one genuinely liga-scoped, full-text RSS feed among every
// candidate checked for the News tab. Distinct sourceKey from the
// transfers pipeline's own sources (none of which use this URL) so
// seen_news_items never collides across the two independent scrapers.
export default createRssSource({
  sourceKey: 'bundesliga-com',
  feedUrlEnvVar: 'BUNDESLIGA_COM_RSS_URL',
  defaultFeedUrl: 'https://www.bundesliga.com/en/rss/news',
});
