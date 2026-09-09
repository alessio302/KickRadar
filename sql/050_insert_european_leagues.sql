-- UEFA club competitions. news_source uses 'none' as a placeholder -- the app
-- has no news scraper for UEFA competitions (transfers are tracked per
-- domestic league, not per European competition).
-- external_competition_id: 2001 = UCL (football-data.org free tier accessible),
-- 2146 = UEL and 2191 = UECL (return 403 on the free tier; GOAL API used
-- instead). GOAL API league IDs confirmed live from the European leagues
-- diagnostic (diagnoseEuropeanLeagues.js / diagnose-european-leagues workflow).
insert into leagues (slug, name, country, external_competition_id, news_source)
values
  ('champions-league',  'Champions League',  'Europe', 2001, 'none'),
  ('europa-league',     'Europa League',     'Europe', 2146, 'none'),
  ('conference-league', 'Conference League', 'Europe', 2191, 'none')
on conflict (slug) do nothing;
