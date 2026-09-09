-- European competition lineups (UCL/UEL/UECL) have no clubs table row to
-- key off -- see syncEuropeanFixtures.js's own comment: clubs like Real
-- Madrid/Bayern aren't in our clubs table, which only tracks the 5
-- domestic leagues. team_name is the parallel identifier for these rows,
-- mirroring fixtures.home_team_name/away_team_name. Exactly one of
-- club_id/team_name is set per row -- never both, never neither.
alter table lineups alter column club_id drop not null;
alter table lineups add column if not exists team_name text;
alter table lineups add constraint lineups_club_or_team_name check ((club_id is not null) <> (team_name is not null));

-- A plain (non-partial) unique constraint -- NULLs never collide with each
-- other in a unique constraint, so this only actually enforces uniqueness
-- among the team_name rows (every club_id-based row shares team_name =
-- null and never conflicts here; the existing fixture_id/club_id
-- constraint below still covers those). Deliberately NOT a partial index
-- (`where club_id is null`): PostgREST's upsert ON CONFLICT target can't
-- infer a partial index without repeating its WHERE clause verbatim, and
-- this project already hit that exact failure once for
-- fixtures.goal_api_id (sql/fix_goal_api_id_unique_constraint) -- a full
-- constraint sidesteps it entirely.
alter table lineups add constraint lineups_fixture_team_name_key unique (fixture_id, team_name);
