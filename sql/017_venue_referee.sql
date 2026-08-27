-- Stadium (per club, static) and referee (per fixture) info, shown below
-- the lineup/bench section in the fixture detail overlay. Both come from
-- football-data.org fields we were already fetching and discarding --
-- venue from /teams (team.venue), referee from /competitions/{id}/matches
-- (match.referees[0].name) -- confirmed live via diagnoseVenueReferee.js,
-- no extra API cost.
alter table clubs add column if not exists venue text;
alter table fixtures add column if not exists referee text;
