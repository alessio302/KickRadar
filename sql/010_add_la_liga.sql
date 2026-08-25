-- Adds LaLiga as the fifth tracked league (the "big 5"), news sourced
-- from marca.com's "Mercado de Fichajes" section (see src/news/sources/marca.js).
-- external_competition_id 2014 is football-data.org's id for LaLiga (code PD).
insert into leagues (slug, name, country, external_competition_id, news_source) values
  ('la-liga', 'LaLiga', 'Spain', 2014, 'marca')
on conflict (slug) do nothing;
