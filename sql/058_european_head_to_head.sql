-- Name-keyed counterpart to head_to_head (sql/020) for UEFA competition
-- fixtures, which have no clubs table row -- see syncEuropeanFixtures.js's
-- own comment on why home_team_name/away_team_name is what's available.
-- Backed by GOAL API's /h2h/:team1Id/:team2Id/direct (see
-- syncEuropeanHeadToHead.js), confirmed live to return real cross-season
-- meeting data despite an earlier diagnostic wrongly concluding GOAL API
-- had no head-to-head endpoint at all. One row per unordered team-name
-- pair (team_name_a < team_name_b, enforced by the sync script, not the
-- DB, same convention as head_to_head's club_id_a/club_id_b).
create table if not exists european_head_to_head (
  id serial primary key,
  team_name_a text not null,
  team_name_b text not null,
  matches jsonb not null, -- array of { id, date, home_team_name, away_team_name, home_score, away_score }, most recent first
  updated_at timestamptz not null default now(),
  unique (team_name_a, team_name_b)
);
create index if not exists idx_european_head_to_head_pair on european_head_to_head(team_name_a, team_name_b);

alter table european_head_to_head enable row level security;
create policy "Public read access" on european_head_to_head for select using (true);
-- No anon write policy: only the service_role-backed sync job writes here,
-- same pattern as head_to_head/lineups/transfers/fixtures/match_events.
