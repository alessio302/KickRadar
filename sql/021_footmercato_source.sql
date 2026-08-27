-- Ligue 1's news source moved from RMC Sport's general "Transferts" hub
-- (mostly pan-European storylines, few genuinely Ligue 1-specific) to Foot
-- Mercato's dedicated /france/ligue-1/transfert section -- see
-- src/news/sources/footmercato.js. This column is descriptive only (no
-- application code reads it), but keeping it accurate avoids a stale value
-- sitting in the DB. Historical rows in transfers.source /
-- seen_news_items.source keep 'rmcsport' as an accurate record of where
-- they actually came from -- only the leagues seed value changes, since
-- that's what future scrapes will honestly reflect.
update leagues set news_source = 'footmercato' where slug = 'ligue-1';
