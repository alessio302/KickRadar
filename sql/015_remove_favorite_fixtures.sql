-- Rolls back sql/014_favorite_fixtures.sql: the favorite-fixture / match-event
-- push feature is being shelved (no viable free events source within
-- Highlightly's 100 req/day budget was found -- see project discussion).
-- Drops are safe/idempotent to re-run.

drop function if exists add_favorite_fixture(text, text, int);
drop function if exists remove_favorite_fixture(text, text, int);
drop function if exists get_favorite_fixture_ids(text, text);

drop table if exists notified_match_events;
drop table if exists favorite_fixtures;

alter table fixtures drop column if exists highlightly_match_id;
