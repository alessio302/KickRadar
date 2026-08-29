-- Nationality is a separate concept from current club and needs its own
-- columns: GOAL API's player profile falls back to the player's national
-- team in the `team` field itself when no club is currently set (confirmed
-- live for a free-agent transfer target -- team.name and team.country were
-- both "Argentina"), which playerProfileResolver.js now detects and routes
-- into these columns instead of mislabeling it as the player's club.
alter table players add column if not exists nationality_name text;
alter table players add column if not exists nationality_badge text;

-- Squad number and injury status -- both plain fields on GOAL API's player
-- profile, not part of the season stats snapshot.
alter table players add column if not exists squad_number text;
alter table players add column if not exists injured boolean;
