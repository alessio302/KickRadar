# KickRadar Backend

Backend for **KickRadar**, a PWA tracking transfer news, fixtures, and
lineups across Serie A, Bundesliga, Premier League, and Ligue 1. See the
project briefing for full product scope; this repo covers the backend only
(DB schema, football-data sync, news scraper, GitHub Actions cron jobs).

## Stack

- **Database**: Postgres via [Supabase](https://supabase.com) (free tier)
- **Fixtures/clubs**: [football-data.org](https://www.football-data.org) (free tier, 10 req/min,
  current season included — API-Football's free plan was tried first but
  blocks the current season entirely, see "Known limitations")
- **News scraping**: RSS where available, HTML scraping otherwise, per source
- **Scheduling**: GitHub Actions cron (no server to run)

## Setup

1. **Create a Supabase project**, then run `sql/schema.sql` against it (SQL
   Editor in the Supabase dashboard, or `psql`). This creates all tables and
   seeds the four leagues. If you had already run an older version of this
   schema (with API-Football columns), run `sql/002_switch_to_football_data_org.sql`
   afterwards instead of re-running `schema.sql`.
2. **Get a football-data.org key** at [football-data.org/client/register](https://www.football-data.org/client/register)
   (free tier is enough for this project's request volume).
3. **Local development**: copy `.env.example` to `.env` and fill in
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FOOTBALL_DATA_API_KEY`.
4. **Install deps**: `npm install`
5. **First-time data load** (order matters — fixtures link to clubs):
   ```
   npm run sync:clubs
   npm run sync:fixtures
   npm run scrape:news
   ```
6. **GitHub Actions**: add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
   `FOOTBALL_DATA_API_KEY` as repository secrets (Settings → Secrets and
   variables → Actions). The three workflows in `.github/workflows/` then
   run on their own schedule:
   - `news-scraper.yml` — hourly
   - `fixtures-sync.yml` — 4x/day
   - `clubs-sync.yml` — daily

   You can also trigger any of them manually via "Run workflow"
   (`workflow_dispatch`) to do the first-time load without a local `.env`.

## Project layout

```
sql/schema.sql              DB schema + league seed data
sql/002_switch_to_football_data_org.sql  Migration for DBs created before the API switch
src/config/leagues.js       Fixed league metadata (slug, football-data.org competition id, news source key)
src/db/supabaseClient.js    Supabase client factory
src/football-api/           football-data.org adapter + club/fixture sync scripts
src/news/
  sources/*.js               One module per outlet (tuttomercatoweb, kicker, skysports, rmcsport)
  rssSource.js / htmlSource.js  Shared factories: RSS parsing / HTML scraping
  classify.js                 Per-source official-vs-rumor keyword rules
  extract.js                  Best-effort player/from-club/to-club extraction from headlines
  playerProfileResolver.js    Resolves + caches transfermarkt.de profile links
  runNewsScraper.js           Orchestrates all four sources, upserts into `transfers`
```

## Known limitations / things to verify with real internet access

- **API-Football's free plan blocks the current season** (confirmed live:
  "Free plans do not have access to this season, try from 2022 to 2024").
  Switched to football-data.org instead, which includes the current season
  on its free tier. If you'd rather stay on API-Football, its paid "Pro"
  plan (~€15/mo) removes that restriction — `src/football-api/client.js`
  would need to be swapped back.

This backend was scaffolded in a sandboxed environment without general
internet access (only GitHub/npm reachable), so a few things are
best-effort guesses that should be checked once the GitHub Actions runner
(which has full internet access) actually executes them:

- **RSS feed URLs** for tuttomercatoweb, kicker.de, and Sky Sports
  (`src/news/sources/*.js`) are plausible defaults, not confirmed. If a
  feed 404s or parses oddly, override its URL via the corresponding env var
  (`TUTTOMERCATOWEB_RSS_URL`, `KICKER_RSS_URL`, `SKYSPORTS_RSS_URL`) — no
  code change needed.
- **RMC Sport HTML selectors** (no reliable RSS) are a first guess at the
  site's DOM structure. Override via `RMCSPORT_LIST_URL` /
  `RMCSPORT_ITEM_SELECTOR` / `RMCSPORT_TITLE_SELECTOR` /
  `RMCSPORT_LINK_SELECTOR` once you've inspected the live page.
- **Player/club extraction from headlines** (`src/news/extract.js`) is a
  language-agnostic heuristic, not NLP. It degrades gracefully: on a miss,
  `player_name`/`from_club`/`to_club` stay `null` and the raw headline is
  still stored in `summary`, so no news item is ever dropped — only the
  structured fields may be incomplete. Worth revisiting once real headlines
  from each source are visible.
- **Transfermarkt profile resolution** (`playerProfileResolver.js`) scrapes
  the public "Schnellsuche" (quick search) results page for the first
  player-profile link. If transfermarkt.de changes that page's markup, the
  resolver falls back to linking the search results page itself, per the
  briefing's fallback requirement.

## Not yet built

- Lineups tab: DB schema has a placeholder `lineups` table (fixture +
  club + confirmed flag + free-form `players` jsonb), but the tab itself
  is explicitly unspecified in the briefing — sourcing and content need to
  be defined before a scraper/sync script can be written.
- Web Push sending: `push_subscriptions` table exists to store
  subscriptions, but the actual push-sending logic (triggered when a
  lineup is confirmed) is a later step per the briefing's open next steps.
- Frontend: this repo is backend-only. The existing `transferticker.jsx`
  prototype (mock data) still needs to be wired up to this backend's data.
