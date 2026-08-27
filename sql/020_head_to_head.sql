-- Last 5 direct meetings between two clubs, for the fixture overlay's
-- "Statistiken" tab -- see syncHeadToHead.js. Unlike everything else
-- synced so far, this reaches ACROSS PAST SEASONS (football-data.org's
-- /matches/{id}/head2head endpoint, confirmed live: Real Madrid vs Elche
-- CF returned meetings back to 2020-21), which our own fixtures table
-- never will since it only keeps a rolling ~60-day window. One row per
-- unordered club pair (club_id_a < club_id_b, enforced by the sync
-- script, not the DB), overwritten in place whenever a new meeting needs
-- picking up.
create table if not exists head_to_head (
  id serial primary key,
  club_id_a int not null references clubs(id) on delete cascade,
  club_id_b int not null references clubs(id) on delete cascade,
  matches jsonb not null, -- array of { id, date, home_club_id, away_club_id, home_score, away_score }, most recent first
  updated_at timestamptz not null default now(),
  unique (club_id_a, club_id_b)
);
create index if not exists idx_head_to_head_pair on head_to_head(club_id_a, club_id_b);

alter table head_to_head enable row level security;
create policy "Public read access" on head_to_head for select using (true);
-- No anon write policy: only the service_role-backed sync job writes here,
-- same pattern as lineups/transfers/fixtures/match_events/standings.
