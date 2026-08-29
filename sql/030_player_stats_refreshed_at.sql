-- Tracks when a player's GOAL API data (photo/club/stats/injury) was last
-- refreshed, separate from `resolved_at` (when the player was FIRST ever
-- resolved) -- see refreshPlayerProfiles.js. Without this there's no way
-- to pick "the players most overdue for a refresh" for that job's batches,
-- since resolved_at never changes once set and every player would look
-- equally (in)eligible.
alter table players add column if not exists stats_refreshed_at timestamptz;
