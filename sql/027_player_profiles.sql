-- Extends the players cache (previously just a transfermarkt.de profile
-- URL, resolved once and reused -- see 001's original comment) with real
-- profile data from GOAL API's own player database: a photo, birthdate,
-- position, current club (name + badge), and a season stats snapshot.
-- See src/news/playerProfileResolver.js -- transfermarkt_url stays as a
-- fallback for whenever GOAL API's global player search can't confidently
-- resolve a name (see that file's pickBestMatch()), so no existing data
-- is lost, just no longer the primary path.
alter table players add column if not exists goal_api_id text;
alter table players add column if not exists photo_url text;
alter table players add column if not exists birthdate date;
alter table players add column if not exists position text;
alter table players add column if not exists current_club_name text;
alter table players add column if not exists current_club_badge text;
alter table players add column if not exists stats jsonb;
