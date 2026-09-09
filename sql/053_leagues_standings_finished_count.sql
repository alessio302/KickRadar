-- Lets syncStandings.js skip a league entirely (no football-data.org call
-- at all) when nothing could have changed since the last successful sync:
-- a league's standings only actually change when a fixture transitions to
-- 'finished' (points/GF/GA update), so the count of finished fixtures is
-- a cheap, reliable "did anything happen" signal -- unchanged count means
-- skip, changed count means re-fetch and store the new count. Null means
-- "never synced yet", which always triggers a first sync.
alter table leagues add column if not exists standings_finished_count integer;
