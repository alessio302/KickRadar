-- Enables Supabase Realtime for the match_events table, same rationale as
-- 013_fixtures_realtime.sql for fixtures: RLS already lets the anon key
-- *read* this table, but Realtime only streams changes for tables
-- explicitly added to the supabase_realtime publication. Needed for
-- useMatchEvents.js's postgres_changes subscription (added alongside
-- src/lineups/syncLiveEvents.js, which now writes goals/cards/subs here
-- while a match is still live, not just once it's finished) to actually
-- receive anything.
alter publication supabase_realtime add table match_events;
