-- Make external_competition_id nullable: UEFA competitions accessible via GOAL
-- API (EL/UECL) don't need a football-data.org competition ID; UCL still uses
-- 2001 on the free tier.
alter table leagues alter column external_competition_id drop not null;

-- Make external_fixture_id nullable: GOAL API fixtures (used for EL/UECL) don't
-- carry a football-data.org match ID. goal_api_id (migration 048) is their
-- unique key instead. The UNIQUE constraint stays -- Postgres doesn't count
-- NULLs as equal, so multiple NULL rows are allowed.
alter table fixtures alter column external_fixture_id drop not null;

-- Raw team names for European fixtures where the club isn't in our clubs table
-- (UCL/UEL/UECL participants from outside the 5 tracked domestic leagues).
alter table fixtures add column if not exists home_team_name text;
alter table fixtures add column if not exists away_team_name text;

-- Unique index so upsert-on-goal_api_id works for GOAL-API-only fixtures.
-- Standard Postgres unique index skips NULLs (domestic fixtures keep
-- goal_api_id = null with no conflict).
create unique index if not exists fixtures_goal_api_id_unique
  on fixtures (goal_api_id)
  where goal_api_id is not null;
