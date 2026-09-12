-- Enables Supabase Realtime for the lineups table, same rationale as
-- 025_match_events_realtime.sql: RLS already lets the anon key *read* this
-- table, but Realtime only streams changes for tables explicitly added to
-- the supabase_realtime publication. Missing until now -- confirmed live
-- an already-open FixtureDetailOverlay had no way to learn that a lineup
-- syncLineups.js wrote *after* the overlay was opened had arrived: useLineups.js
-- only ever fetched once, on mount, with neither a Realtime subscription nor
-- a poll, so a lineup confirmed while the user was already looking at the
-- overlay only appeared after closing and reopening it.
alter publication supabase_realtime add table lineups;
