-- European match events (UCL/UEL/UECL, added to syncLiveEvents.js's WS
-- tracking) have no clubs table row to attribute a goal/card/sub to --
-- same gap lineups.team_name (sql/051) already solved. club_id was
-- already nullable here (no NOT NULL, unlike lineups.club_id before 051),
-- so this only needs the new column, no constraint changes: a European
-- row carries team_name with club_id left null, a domestic row carries
-- club_id with team_name left null.
alter table match_events add column if not exists team_name text;
