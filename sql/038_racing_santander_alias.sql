-- LALIGA EA SPORTS' own YouTube highlights channel titles Real Racing
-- Club de Santander's matches as "R. RACING CLUB" -- confirmed live
-- (syncHighlights.js's LaLiga rollout) that resolveClub()'s substring
-- matching doesn't bridge "r. racing club" against "real racing club de
-- santander" (the "r." abbreviation isn't a literal substring of "real"),
-- unlike every other club in this round's highlights. Same fix pattern as
-- Rennes for Stade Rennais: add the real-world shorthand as an alias
-- instead of teaching the matcher abbreviation expansion for one club.
update clubs
set aliases = array_append(aliases, 'R. Racing Club')
where name = 'Real Racing Club de Santander';
