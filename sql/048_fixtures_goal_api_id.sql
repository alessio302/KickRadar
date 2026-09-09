-- Caches each fixture's GOAL API id, same pattern as clubs.goal_api_id
-- (039_clubs_goal_api_id.sql) and players.goal_api_id. Before this,
-- syncLiveEvents.js's resolveGoalApiIds() re-resolved every currently-live-
-- or-about-to-kick-off fixture's GOAL API id on every 60-second rescan,
-- all day, for an id that never changes once a match exists -- a real,
-- significant share of the shared 1000-req/day GOAL API budget on a busy
-- matchday with several leagues active at once. Caching it here means a
-- rescan only spends a GOAL API call on a fixture it hasn't already
-- resolved (in practice: once per match, ever), not on every tick.
alter table fixtures add column if not exists goal_api_id text;
