-- Enables Supabase Realtime for the fixtures table. Realtime only streams
-- changes for tables explicitly added to the supabase_realtime publication
-- -- without this, useFixtures.js's postgres_changes subscription (added
-- alongside syncLiveScores.js, see that file for the live-score polling
-- side) would silently never receive anything, since RLS already allows
-- the anon key to *read* this table but Realtime is a separate mechanism
-- layered on top of that.
alter publication supabase_realtime add table fixtures;
