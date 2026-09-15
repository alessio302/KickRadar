-- Supabase's performance advisor (get_advisors, "unindexed_foreign_keys")
-- flagged 10 FK columns with no covering index. Most other FK columns in
-- this schema already have one (see idx_transfers_from_club/to_club,
-- idx_fixtures_league_matchday, idx_top_scorers_league, ...) -- these are
-- the ones the earlier migrations missed, either because the FK column
-- isn't the leading column of any existing composite index (e.g.
-- lineups_fixture_id_club_id_key covers (fixture_id, club_id) but can't
-- serve a lookup by club_id alone) or because no index touches it at all.
-- Every table here is still small (low thousands of rows at most), so
-- this isn't fixing a measured slow query -- it's closing the gap before
-- it becomes one, and covering the FK constraint's own lookup (checked on
-- every UPDATE/DELETE to the referenced clubs/players row) either way.
create index if not exists idx_fixtures_home_club on public.fixtures (home_club_id);
create index if not exists idx_fixtures_away_club on public.fixtures (away_club_id);
create index if not exists idx_head_to_head_club_b on public.head_to_head (club_id_b);
create index if not exists idx_lineups_club on public.lineups (club_id);
create index if not exists idx_match_events_club on public.match_events (club_id);
create index if not exists idx_push_subscriptions_favorite_club on public.push_subscriptions (favorite_club_id);
create index if not exists idx_standings_club on public.standings (club_id);
create index if not exists idx_top_scorers_club on public.top_scorers (club_id);
create index if not exists idx_top_scorers_player on public.top_scorers (player_id);
create index if not exists idx_transfers_player on public.transfers (player_id);
