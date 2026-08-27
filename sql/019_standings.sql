-- League standings ("Tabelle" nav tab + per-club position in the fixture
-- overlay's "Statistiken" tab). One row per club, overwritten in place on
-- every sync (not append-only like fixtures/transfers) -- football-data.org
-- gives us the full current table each call, no reason to keep old rows.
-- TOTAL group only: the free tier has no HOME/AWAY split and its `form`
-- field is always null -- confirmed live (see src/football-api/client.js).
create table if not exists standings (
  id serial primary key,
  league_id int not null references leagues(id) on delete cascade,
  club_id int not null references clubs(id) on delete cascade,
  position int not null,
  played int not null,
  won int not null,
  draw int not null,
  lost int not null,
  points int not null,
  goals_for int not null,
  goals_against int not null,
  goal_difference int not null,
  updated_at timestamptz not null default now(),
  unique (league_id, club_id)
);
create index if not exists idx_standings_league_position on standings(league_id, position);

alter table standings enable row level security;
create policy "Public read access" on standings for select using (true);
-- No anon write policy: only the service_role-backed sync job writes here,
-- same pattern as lineups/transfers/fixtures/match_events.
