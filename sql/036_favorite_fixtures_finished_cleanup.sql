-- Backstop cleanup for favorite_fixtures on finished matches. The normal
-- path is syncHighlights.js clearing a fixture's favorites itself right
-- after successfully pushing its highlight-video notification -- this
-- cron only catches the case where a match never gets a highlight clip at
-- all (or syncHighlights.js's own lookup fails), so a favorite doesn't
-- sit around forever with nothing left it can ever notify about.
--
-- 24h grace period, not immediate: confirmed live that clearing a
-- favorite the instant syncLiveScores.js marks a fixture 'finished'
-- defeats the highlight-push feature entirely -- a highlight clip is
-- typically posted minutes to hours after full time, so by the time one
-- shows up there'd be no favorite record left to notify.
select cron.schedule(
  'favorite_fixtures_finished_cleanup',
  '0 4 * * *',
  $$
  delete from public.favorite_fixtures ff
  using public.fixtures f
  where ff.fixture_id = f.id
    and f.status = 'finished'
    and f.kickoff_at < now() - interval '24 hours';
  $$
);
