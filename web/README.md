# KickRadar Frontend

React PWA for KickRadar, wired to the backend's Supabase database (see
`../README.md` for the backend). Built with Vite.

## Setup

1. Make sure the backend is set up and has data (see `../README.md`) --
   this app only reads from Supabase, it doesn't scrape or sync anything
   itself.
2. Get the **publishable/anon key** for your Supabase project (Project
   Settings → API → "Publishable key", or the legacy `anon` key) -- **not**
   the service_role/secret key the backend uses. This key is safe to ship
   to the browser; that's what Row Level Security
   (`sql/004_enable_rls.sql`) is for.
3. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`.
4. `npm install`
5. `npm run dev` -- opens a local dev server (prints the URL, typically
   http://localhost:5173).

## Build

`npm run build` outputs a static site to `dist/`, deployable to any static
host (Vercel, Netlify, Cloudflare Pages -- all free tier, per the
briefing). `npm run preview` serves the built output locally to sanity-check
before deploying.

## What's wired up vs. still mock/placeholder

- **Transfers, fixtures**: real data from Supabase (`transfers`, `fixtures`,
  `clubs`, `leagues` tables), matching the backend's actual scrape/sync
  output.
- **League switcher, quick filters, favorite club, official-only toggle,
  next-matchday toggle, dark/light/system theme**: fully interactive, same
  UX as the original prototype. Favorite club/quick filters/theme are
  persisted in `localStorage` only (no user accounts exist yet), so they're
  per-device, not synced anywhere.
- **Aufstellungen (lineups) tab**: still a placeholder. The backend has a
  `lineups` table ready but nothing populates it yet -- the tab's actual
  content is explicitly unspecified in the project briefing.
- **Push notifications toggle**: shown but non-functional ("bald
  verfügbar"). Sending pushes needs a service worker push handler and a
  subscription-registration flow, neither built yet.
- **Club badge colors**: the original prototype hand-picked a color per
  club (6 clubs/league). Real data has ~20 clubs/league from
  football-data.org, so badge colors are generated deterministically from
  the club id instead (`src/lib/clubColor.js`) -- same club always gets the
  same color, no manual list to maintain.
