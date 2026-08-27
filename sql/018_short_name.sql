-- Human-friendly short club name ("Inter", "Monza", "Real Madrid") for
-- spots too narrow for the full official name (e.g. the lineup side
-- toggle in the fixture detail overlay) -- distinct from short_code,
-- which is a 3-5 letter badge abbreviation ("INT", "MON"), too terse to
-- read as a name. football-data.org already returns this as team.shortName
-- on the same /teams call syncClubs.js already makes -- confirmed live
-- (AC Milan -> "Milan") -- so no extra API cost.
alter table clubs add column if not exists short_name text;
