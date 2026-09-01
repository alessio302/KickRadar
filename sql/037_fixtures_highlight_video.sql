-- Highlight-clip URL for a finished fixture, sourced from GOAL API's
-- Videos resource (/videos/match/:matchId) -- see src/lineups/syncHighlights.js.
-- highlight_checked_at tracks the last lookup attempt (found or not),
-- separate from highlight_video_url itself, so syncHighlights.js can
-- throttle re-checking a fixture that doesn't have a clip yet instead of
-- re-querying GOAL API for it on every run.
alter table fixtures add column if not exists highlight_video_url text;
alter table fixtures add column if not exists highlight_checked_at timestamptz;
