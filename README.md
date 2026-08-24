# KickRadar Backend

**KickRadar** is a PWA tracking transfer news, fixtures, and lineups across
Serie A, Bundesliga, Premier League, and Ligue 1. This README covers the
backend (DB schema, football-data sync, news scraper, GitHub Actions cron
jobs) at the repo root; the frontend lives in `web/` (see `web/README.md`).

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
3. **Get a Gemini API key** (free, no credit card) at
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — used
   by the news scraper to extract player/club names from headlines (see
   "Why an LLM for extraction" below). Optional in the sense that the
   scraper still runs without it (falls back to a regex heuristic), but
   extraction quality is much better with it set.
4. **Local development**: copy `.env.example` to `.env` and fill in
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FOOTBALL_DATA_API_KEY`,
   `GEMINI_API_KEY`.
5. **Install deps**: `npm install`
6. **First-time data load** (order matters — fixtures link to clubs):
   ```
   npm run sync:clubs
   npm run sync:fixtures
   npm run scrape:news
   ```
7. **GitHub Actions**: add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `FOOTBALL_DATA_API_KEY`, and `GEMINI_API_KEY` as repository secrets
   (Settings → Secrets and variables → Actions). The three workflows in
   `.github/workflows/` then run on their own schedule:
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
  rssSource.js / htmlSource.js / sitemapSource.js  Shared factories: RSS / HTML scraping / Google News sitemap
  relevance.js                 Per-source keyword gate: is this item transfer news at all?
  llmExtract.js                 Gemini structured-output extraction (player/clubs/official) -- primary path
  classify.js / extract.js      Regex fallback for llmExtract.js (only used if the API call fails)
  clubMatch.js                  Resolves extracted from_club/to_club against the curated `clubs` table (sets from_club_id/to_club_id when matched)
  playerProfileResolver.js     Resolves + caches transfermarkt.de profile links
  runNewsScraper.js            Orchestrates all four sources, upserts into `transfers`
```

Pipeline per item: fetch (source-scoped to football, not necessarily transfers only)
→ skip if already in the DB (by `external_id`, avoids reprocessing unchanged
items every hourly run) → `relevance.js` (keyword gate: is this even about a
transfer?) → `llmExtract.js` (player/clubs/official, regex fallback on
failure) → upsert.

### Why an LLM for extraction

`extract.js`'s regex heuristic (player/club names via capitalized-word runs)
hit a real ceiling in practice: reviewing live scrape output required five
separate rounds of prefix/stopword patches for RMC Sport alone, and still
produced garbage like `"MercatoMercato"` or missed club nicknames
(`"Barça"`) not in the curated alias list. Free-text named-entity extraction
across four languages is a poor fit for regex but a good fit for a small
LLM, so `llmExtract.js` calls the Gemini API (`gemini-3.5-flash-lite`,
native JSON-schema structured output) as the primary path, with the regex
version kept only as a fallback for when the API call itself fails.
**Chosen specifically to keep the project free**: Gemini's free tier
(aistudio.google.com) needs no credit card and its daily quota comfortably
covers this project's volume (only genuinely new items are ever processed,
see the pipeline above — typically well under 100/day across all four
sources). If volume ever grows past the free quota, `GEMINI_MODEL` is
env-overridable to switch models, or the whole approach reverts to the
regex-only fallback with no code change (just remove `GEMINI_API_KEY`).

## Known limitations / things to verify with real internet access

- **API-Football's free plan blocks the current season** (confirmed live:
  "Free plans do not have access to this season, try from 2022 to 2024").
  Switched to football-data.org instead, which includes the current season
  on its free tier. If you'd rather stay on API-Football, its paid "Pro"
  plan (~€15/mo) removes that restriction — `src/football-api/client.js`
  would need to be swapped back.

This backend was scaffolded in a sandboxed environment without general
internet access (only GitHub/npm reachable), so a few things needed live
iteration against the real GitHub Actions runner (which does have full
internet access) to get right:

- **Sources are scoped to "football" or "this outlet's best transfer
  section," not guaranteed "transfers only."** Confirmed live: Sky Sports'
  RSS feed IDs we initially tried (11095, 12040) turned out to be
  all-sports feeds (pulled in golf/rugby/darts/F1), and even tuttomercatoweb's
  plain feed mixed in match reports and interviews. Rather than chase an
  exact "transfers-only" URL per outlet (some may not expose one), each
  source now pulls the best available football-scoped feed and
  `relevance.js` filters for transfer-shaped keywords before anything is
  classified or stored. Confirmed working live: tuttomercatoweb
  (`?s=calciomercato` section), kicker.de (`/news/bundesliga`), Sky Sports
  (`sitemap_news_football.xml`, football-only by construction), RMC Sport
  (`/football/transferts/`). Override any of them via env var
  (`TUTTOMERCATOWEB_RSS_URL`, `KICKER_RSS_URL`, `SKYSPORTS_SITEMAP_URL`,
  `RMCSPORT_LIST_URL`) if the site structure changes — no code change needed.
- **Player/club extraction** now runs through `llmExtract.js` (Gemini,
  free tier) as the primary path -- see "Why an LLM for extraction" above.
  `extract.js`'s regex heuristic still exists as the fallback when the API
  call fails; it degrades gracefully on a miss (`player_name`/`from_club`/
  `to_club` stay `null`, the raw headline is still stored in `summary`, so
  no news item is ever dropped). Confirmed live: `gemini-2.5-flash-lite`
  returns a 404 ("no longer available to new users") -- Google's own error
  message named the replacement, `gemini-3.5-flash-lite`, which is what's
  configured now. If Google renames/retires models again, every call will
  silently fall back to the regex heuristic (logged as a warning per item)
  rather than failing the whole scrape -- worth checking the Actions logs
  occasionally for a wall of "LLM extraction failed" warnings. Also
  confirmed live: the free tier caps `gemini-3.5-flash-lite` at 15
  requests/minute, and RMC Sport alone can have 60+ new items on a big
  backlog run -- firing them all back-to-back 429'd on essentially every
  call (a different failure mode than the 404 above, but the same
  symptom: a wall of "LLM extraction failed" warnings). `llmExtract.js`
  now throttles itself to stay under that cap, which is why a large
  backlog run can take several minutes (see the `timeout-minutes: 20` on
  the news-scraper workflow) -- steady-state hourly runs, which only ever
  see genuinely new items, aren't affected.
- **Transfermarkt profile resolution** (`playerProfileResolver.js`) scrapes
  the public "Schnellsuche" (quick search) results page for the first
  player-profile link. If transfermarkt.de changes that page's markup, the
  resolver falls back to linking the search results page itself, per the
  briefing's fallback requirement.
- **Club matching is not authoritative and deliberately conservative**
  (`clubMatch.js`). Neither `player_name` nor `from_club`/`to_club` are
  checked against any ground-truth source -- there's no free API with
  reliable full squad/player data to verify against, so extraction quality
  ultimately rests on the LLM. What `clubMatch.js` *does* fix: resolving
  `from_club`/`to_club` against the league's curated `clubs` table when the
  extracted name is an exact or substring match, so the same club doesn't
  end up as two different strings across articles (confirmed live: "OM"
  vs. "Olympique de Marseille"). It intentionally does *not* attempt
  fuzzy/acronym matching ("OM", "PSG") -- a wrong match (confusing two
  different clubs) would be worse than an unmatched raw string, so those
  stay as plain text with `from_club_id`/`to_club_id` left `null`.

## Not yet built

- Lineups tab: DB schema has a placeholder `lineups` table (fixture +
  club + confirmed flag + free-form `players` jsonb), but the tab itself
  is explicitly unspecified in the briefing — sourcing and content need to
  be defined before a scraper/sync script can be written.
- Web Push sending: `push_subscriptions` table exists to store
  subscriptions, but the actual push-sending logic (triggered when a
  lineup is confirmed) is a later step per the briefing's open next steps.
- Frontend: now wired up (`web/`, a Vite React PWA) to real transfers/
  fixtures data -- see `web/README.md` for setup and what's still
  mock/placeholder there (lineups tab, push toggle).
