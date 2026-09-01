-- Resolves each club to GOAL API's own team id, needed to call the
-- club-detail overlay's on-demand squad/venue lookup (Supabase Edge
-- Function get-team-squad) -- confirmed live GOAL API's own
-- /leagues/:id/teams already returns every league's teams (name, badge,
-- venue, founded year, id) in one call, matched against this table's
-- clubs by name via resolveClub(), same pattern as every other provider
-- id already on this table.
alter table clubs add column if not exists goal_api_id text;
alter table clubs add column if not exists venue_capacity int;
alter table clubs add column if not exists founded int;
