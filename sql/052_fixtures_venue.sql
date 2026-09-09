-- Fixture-level venue for European fixtures (UCL/UEL/UECL): those have no
-- clubs table row to fall back on (see syncEuropeanFixtures.js's own
-- comment on home_club_id/away_club_id staying null), unlike domestic
-- fixtures, which already source venue from clubs.venue (the club's
-- static home stadium). Confirmed live: GOAL API's EL/UECL fixture object
-- carries a matchStadium field directly; football-data.org's UCL match
-- object carries no venue at all (only referees), so this column stays
-- null for UCL rows.
alter table fixtures add column if not exists venue text;
