-- League-wide top scorers ranking, synced from GOAL API's /teams/{teamId}/players
-- endpoint which provides per-player season stats. One row per league, overwritten
-- in place on every sync (not append-only) -- the sync fetches the current season's
-- full squad for every team in the league, aggregates goals/assists, and stores
-- the top N scorers.
create table if not exists top_scorers (
  id serial primary key,
  league_id int not null references leagues(id) on delete cascade,
  player_id int references players(id) on delete set null,
  player_name text not null,
  club_id int references clubs(id),
  club_name text,
  club_badge text,
  goals int not null default 0,
  assists int not null default 0,
  matches_played int not null default 0,
  rank int not null,
  updated_at timestamptz not null default now(),
  unique (league_id, rank)
);
create index if not exists idx_top_scorers_league on top_scorers(league_id);
create index if not exists idx_top_scorers_rank on top_scorers(league_id, rank);
