-- Current live match minute (e.g. "23", "45+2"), written by
-- src/lineups/syncLiveEvents.js from GOAL API's WebSocket match_status
-- field while a fixture is live. Text, not int, since stoppage time comes
-- as "45+2". Left stale (not cleared) once a match finishes -- harmless,
-- since the frontend only reads it while fixtures.status = 'live'.
alter table fixtures add column if not exists live_minute text;
