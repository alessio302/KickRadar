-- Display-only short team names for European fixtures (UCL/EL/UECL) --
-- separate from home_team_name/away_team_name on purpose: those are also
-- used for cross-provider matching (namesLooselyMatch() in
-- syncLiveEvents.js/syncEuropeanLineups.js/goal-api-webhook, matching
-- football-data.org's UCL names against GOAL API's own), and swapping in a
-- short form there risks breaking that substring-based matching (confirmed:
-- "Man City" is not a substring of "Manchester City", which the matching
-- would need to still find each other). These columns are purely for the
-- fixture card's own name display -- fall back to the long name when null.
alter table fixtures add column if not exists home_team_short_name text;
alter table fixtures add column if not exists away_team_short_name text;
