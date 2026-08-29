-- football-data.org's own /teams response already carries a `crest` field
-- (a real PNG URL, e.g. https://crests.football-data.org/98.png) --
-- confirmed live -- but syncClubs.js only ever extracted name/tla/id/
-- venue/shortName, discarding it. Same source the app already syncs
-- clubs from, no new provider/quota needed.
alter table clubs add column if not exists crest_url text;
