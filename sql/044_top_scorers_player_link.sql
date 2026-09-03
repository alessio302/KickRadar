-- Lets the top scorers table open the same PlayerProfileOverlay every
-- other player-facing spot in the app does, and show a real photo instead
-- of the club badge -- see syncTopScorers.js's own surname-matching
-- comment for how player_id gets resolved (match_events' player names are
-- abbreviated, e.g. "D. Malen", so this can't just be a straight FK join
-- on name).
alter table top_scorers add column if not exists photo_url text;
alter table top_scorers add column if not exists goal_api_id text;
