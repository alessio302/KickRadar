-- General football news feed, distinct from `transfers`: broader
-- match-report/interview/club-news coverage, not just the transfer market,
-- and NOT LLM-extracted (player/club/direction) -- just teaser + deep-link,
-- per the "no full-text scraping" ToS/copyright policy already applied to
-- transfers.summary. Powers the News sub-tab (see TransfersTab.jsx's own
-- News/Transfers sub-tab split). Sourced from src/news/generalSources/*,
-- run via runGeneralNewsScraper.js -- a separate pipeline from
-- runNewsScraper.js's transfer-only SOURCES, since most of the underlying
-- feeds (BBC, Guardian, Marca, RMC Sport, ...) span far more than one
-- league and need the club-mention league-resolution
-- (findMentionedClubs() in clubMatch.js) that runNewsScraper.js's
-- LLM-extracted from/to-club fields don't need.
create table if not exists news_articles (
  id uuid primary key default gen_random_uuid(),
  league_id int not null references leagues(id) on delete cascade,
  source text not null,                 -- e.g. 'bundesliga-com' | 'sportschau' | 'kicker' | 'tuttomercatoweb-general' | 'gazzetta' | 'bbc-football' | 'guardian-football' | 'marca-general' | 'rmcsport-football'
  title text not null,
  teaser text,                          -- short RSS description/snippet only, never full article text (copyright, matches transfers.summary policy)
  image_url text,
  source_url text not null,
  published_at timestamptz not null,
  external_id text not null,            -- hash of guid/link, stable across re-scrapes
  ai_summary_de text,                   -- Gemini-generated summary per app language, same mechanism as transfers.ai_summary_*
  ai_summary_en text,
  ai_summary_it text,
  ai_summary_fr text,
  ai_summary_es text,
  created_at timestamptz not null default now(),
  -- league_id (not just source+external_id) is part of the key: a single
  -- article can legitimately mention clubs from two different tracked
  -- leagues (a European tie, a cross-league transfer story picked up here
  -- too) and gets one row per matching league -- see
  -- runGeneralNewsScraper.js's fan-out.
  unique (source, external_id, league_id)
);
create index if not exists idx_news_articles_league_published on news_articles(league_id, published_at desc);

-- Same RLS treatment as every other public-read table (leagues, clubs,
-- transfers, fixtures, ...) -- see sql/schema.sql's own RLS section.
alter table news_articles enable row level security;
create policy "Public read access" on news_articles for select using (true);
