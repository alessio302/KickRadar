-- KickRadar backend schema (Postgres / Supabase)
-- Run this once against a fresh Supabase/Neon Postgres database.

create extension if not exists "pgcrypto";

-- Fixed set of leagues supported in v1.
create table if not exists leagues (
  id serial primary key,
  slug text unique not null,           -- 'serie-a' | 'bundesliga' | 'premier-league' | 'ligue-1'
  name text not null,
  country text not null,
  api_football_id int not null,
  news_source text not null            -- key into src/news/sources/*
);

-- Curated club table per league (no free text on the frontend -> no typos).
create table if not exists clubs (
  id serial primary key,
  league_id int not null references leagues(id) on delete cascade,
  name text not null,
  short_code text not null,            -- e.g. 'JUV', 'BVB' -- used for the badge in the UI
  api_football_id int,
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
  is_official boolean not null default false,
  source text not null,                 -- 'tuttomercatoweb' | 'kicker' | 'skysports' | 'rmcsport'
  source_url text not null,
  summary text not null,                -- short in-app summary only, never the full article (copyright)
  published_at timestamptz not null,
  external_id text not null,            -- stable id/hash from the source, used for de-dup on re-scrape
  created_at timestamptz not null default now(),
  unique (source, external_id)
);
create index if not exists idx_transfers_league_published on transfers(league_id, published_at desc);
create index if not exists idx_transfers_official on transfers(league_id, is_official);

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
  api_football_fixture_id bigint unique not null,
  updated_at timestamptz not null default now()
);
create index if not exists idx_fixtures_league_matchday on fixtures(league_id, matchday);
create index if not exists idx_fixtures_kickoff on fixtures(kickoff_at);

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed the four leagues. api_football_id values are API-Football's standard league IDs.
insert into leagues (slug, name, country, api_football_id, news_source) values
  ('serie-a', 'Serie A', 'Italy', 135, 'tuttomercatoweb'),
  ('bundesliga', 'Bundesliga', 'Germany', 78, 'kicker'),
  ('premier-league', 'Premier League', 'England', 39, 'skysports'),
  ('ligue-1', 'Ligue 1', 'France', 61, 'rmcsport')
on conflict (slug) do nothing;
