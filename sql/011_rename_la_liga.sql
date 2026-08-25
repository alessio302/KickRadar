-- Corrects the league name to the official spelling ("LaLiga", one word --
-- matches the competition's own branding, per the source-of-truth list of
-- official league names). Only the display name changes; slug/other
-- columns are untouched, so no other data is affected.
update leagues set name = 'LaLiga' where slug = 'la-liga';
