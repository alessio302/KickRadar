-- Switches the football-data source from API-Football to football-data.org
-- (API-Football's free plan blocks the current season). Run this once
-- against the same DB that already has sql/schema.sql applied.
--
-- Safe to run even with existing clubs/fixtures rows: renames columns only,
-- then reseeds the (small, fixed) league competition ids.

alter table leagues rename column api_football_id to external_competition_id;
alter table clubs rename column api_football_id to external_team_id;
alter table fixtures rename column api_football_fixture_id to external_fixture_id;

-- football-data.org's numeric competition ids for our four leagues.
update leagues set external_competition_id = 2019 where slug = 'serie-a';
update leagues set external_competition_id = 2002 where slug = 'bundesliga';
update leagues set external_competition_id = 2021 where slug = 'premier-league';
update leagues set external_competition_id = 2015 where slug = 'ligue-1';
