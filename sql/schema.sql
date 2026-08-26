-- KickRadar backend schema (Postgres / Supabase)
-- Run this once against a fresh Supabase/Neon Postgres database.

create extension if not exists "pgcrypto";

-- Fixed set of leagues supported in v1.
create table if not exists leagues (
  id serial primary key,
  slug text unique not null,           -- 'serie-a' | 'bundesliga' | 'premier-league' | 'ligue-1'
  name text not null,
  country text not null,
  external_competition_id int not null, -- football-data.org competition id
  news_source text not null            -- key into src/news/sources/*
);

-- Curated club table per league (no free text on the frontend -> no typos).
create table if not exists clubs (
  id serial primary key,
  league_id int not null references leagues(id) on delete cascade,
  name text not null,
  short_code text not null,            -- e.g. 'JUV', 'BVB' -- used for the badge in the UI
  external_team_id int,                -- football-data.org team id
  aliases text[] not null default '{}', -- alternate spellings seen in news text, for matching
  unique (league_id, short_code)
);
create index if not exists idx_clubs_league on clubs(league_id);

-- Player -> transfermarkt.de profile URL cache, resolved once and reused.
create table if not exists players (
  id serial primary key,
  name text not null,
  normalized_name text not null unique, -- lowercased, diacritics-stripped, for lookups
  transfermarkt_url text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- Transfer feed items (official + rumors), one row per news item.
create table if not exists transfers (
  id uuid primary key default gen_random_uuid(),
  league_id int not null references leagues(id) on delete cascade,
  player_id int references players(id) on delete set null,
  player_name text,                     -- best-effort extraction from the headline, nullable
  from_club text,
  to_club text,
  from_club_id int references clubs(id), -- set when from_club matched a curated club, else null
  to_club_id int references clubs(id),   -- set when to_club matched a curated club, else null
  is_official boolean not null default false,
  source text not null,                 -- 'tuttomercatoweb' | 'kicker' | 'skysports' | 'rmcsport' | 'marca'
  source_url text not null,
  summary text not null,                -- short in-app summary only, never the full article (copyright)
  published_at timestamptz not null,
  external_id text not null,            -- stable id/hash from the source, used for de-dup on re-scrape
  created_at timestamptz not null default now(),
  unique (source, external_id)
);
create index if not exists idx_transfers_league_published on transfers(league_id, published_at desc);
create index if not exists idx_transfers_official on transfers(league_id, is_official);
create index if not exists idx_transfers_from_club on transfers(from_club_id);
create index if not exists idx_transfers_to_club on transfers(to_club_id);

-- Upcoming fixtures, synced from the football data API.
create table if not exists fixtures (
  id serial primary key,
  league_id int not null references leagues(id) on delete cascade,
  matchday int,
  home_club_id int references clubs(id),
  away_club_id int references clubs(id),
  kickoff_at timestamptz not null,
  status text not null default 'scheduled', -- 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled'
  home_score int,
  away_score int,
  external_fixture_id bigint unique not null, -- football-data.org match id
  updated_at timestamptz not null default now()
);
create index if not exists idx_fixtures_league_matchday on fixtures(league_id, matchday);
create index if not exists idx_fixtures_kickoff on fixtures(kickoff_at);
-- Lets the frontend subscribe to live score/status updates instead of only
-- seeing them on the next manual reload -- see sql/013_fixtures_realtime.sql.
alter publication supabase_realtime add table fixtures;

-- Lineups tab is a v1 placeholder: schema covers "confirmed lineup published" so
-- push notifications can fire; the exact lineup shape (formation, positions, subs)
-- is intentionally left open until the tab is specified.
create table if not exists lineups (
  id serial primary key,
  fixture_id int not null references fixtures(id) on delete cascade,
  club_id int not null references clubs(id),
  confirmed boolean not null default false,
  formation text,
  players jsonb,                        -- free-form until the tab is specified
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (fixture_id, club_id)
);

-- Web Push subscriptions + the per-user preferences that drive notifications.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  favorite_club_id int references clubs(id),
  quick_filter_club_ids int[] not null default '{}',
  notify_lineups boolean not null default true,
  notify_transfers boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed the five leagues (the "big 5"). external_competition_id values are football-data.org's
-- numeric competition ids.
insert into leagues (slug, name, country, external_competition_id, news_source) values
  ('serie-a', 'Serie A', 'Italy', 2019, 'tuttomercatoweb'),
  ('bundesliga', 'Bundesliga', 'Germany', 2002, 'kicker'),
  ('premier-league', 'Premier League', 'England', 2021, 'skysports'),
  ('ligue-1', 'Ligue 1', 'France', 2015, 'rmcsport'),
  ('la-liga', 'LaLiga', 'Spain', 2014, 'marca')
on conflict (slug) do nothing;

-- Row Level Security: the anon/publishable key (which the frontend ships
-- in its public JS bundle) otherwise has full unrestricted CRUD by
-- default. Backend scripts use the service_role key, which bypasses RLS,
-- so this doesn't affect them.
alter table leagues enable row level security;
alter table clubs enable row level security;
alter table players enable row level security;
alter table transfers enable row level security;
alter table fixtures enable row level security;
alter table lineups enable row level security;
alter table push_subscriptions enable row level security;

create policy "Public read access" on leagues for select using (true);
create policy "Public read access" on clubs for select using (true);
create policy "Public read access" on players for select using (true);
create policy "Public read access" on transfers for select using (true);
create policy "Public read access" on fixtures for select using (true);
create policy "Public read access" on lineups for select using (true);
-- push_subscriptions gets no direct anon policies at all (no select,
-- insert, update, or delete) -- every read/write goes through the
-- SECURITY DEFINER functions below instead, each of which hardcodes its
-- own WHERE clause so a call can never touch more than the one row it
-- names. See sql/012_push_subscriptions_rpc.sql for the full reasoning.

create or replace function upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
) returns void
language sql
security definer
set search_path = public
as $$
  insert into push_subscriptions (endpoint, p256dh, auth, updated_at)
  values (p_endpoint, p_p256dh, p_auth, now())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        updated_at = now();
$$;

create or replace function get_push_preferences(
  p_endpoint text,
  p_auth text
) returns table (notify_transfers boolean, notify_lineups boolean)
language sql
security definer
set search_path = public
as $$
  select notify_transfers, notify_lineups
  from push_subscriptions
  where endpoint = p_endpoint and auth = p_auth;
$$;

create or replace function set_push_preference(
  p_endpoint text,
  p_auth text,
  p_notify_transfers boolean default null,
  p_notify_lineups boolean default null
) returns void
language sql
security definer
set search_path = public
as $$
  update push_subscriptions
  set notify_transfers = coalesce(p_notify_transfers, notify_transfers),
      notify_lineups = coalesce(p_notify_lineups, notify_lineups),
      updated_at = now()
  where endpoint = p_endpoint and auth = p_auth;
$$;

revoke all on function upsert_push_subscription(text, text, text) from public;
revoke all on function get_push_preferences(text, text) from public;
revoke all on function set_push_preference(text, text, boolean, boolean) from public;
grant execute on function upsert_push_subscription(text, text, text) to anon;
grant execute on function get_push_preferences(text, text) to anon;
grant execute on function set_push_preference(text, text, boolean, boolean) to anon;
