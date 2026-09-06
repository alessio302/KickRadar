-- Season-scoped goal/assist/card counts for PlayerProfileOverlay, computed
-- from our own match_events (see syncPlayerSeasonStats.js) instead of GOAL
-- API's player.stats snapshot, which carries no season identifier at all
-- and can silently show last season's numbers (see README's "Known
-- limitations" entry). Exact counts, not a proxy -- every scoring/carding
-- event is captured directly, same guarantee syncTopScorers.js already
-- relies on for the Top Scorers view.
--
-- Deliberately no matches_played column: unlike goals/assists/cards,
-- appearance count has no event-based ground truth (a player who played 90
-- unremarkable minutes emits no match_event row at all), so populating one
-- here would mean guessing rather than the reliability bar this table
-- exists to guarantee.
alter table players add column if not exists season_goals int;
alter table players add column if not exists season_assists int;
alter table players add column if not exists season_yellow_cards int;
alter table players add column if not exists season_red_cards int;
alter table players add column if not exists season_stats_updated_at timestamptz;
