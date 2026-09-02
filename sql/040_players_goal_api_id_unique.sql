-- Data-integrity backstop for syncPlayerProfiles.js's per-club squad walk:
-- without this, two different code paths writing to `players` keyed by
-- goal_api_id (this new sync job, and get-player-profile's own rare
-- live-fallback write) could otherwise both insert a fresh row for the
-- same player if they ever raced -- the app already relies on
-- goal_api_id being a reliable identity once set. Partial (not a plain
-- unique constraint) since plenty of older rows still have goal_api_id
-- null (resolved only via the transfermarkt.de fallback, never matched to
-- a GOAL API id) and nulls must stay allowed to coexist.
create unique index if not exists players_goal_api_id_key on players(goal_api_id) where goal_api_id is not null;
