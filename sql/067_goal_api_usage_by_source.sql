-- Per-source breakdown of goal_api_usage (sql/041) -- that table only ever
-- tracked the daily TOTAL, which made "what actually spent today's budget"
-- a guessing game from cron schedules and code reading. increment_goal_api_usage()
-- now takes an optional source label and increments a per-(day, source) row
-- alongside the existing daily total, so a future "what's eating the budget"
-- question has a real answer instead of an estimate. source is caller-
-- supplied: the Node side (goalApiClient.js) derives it automatically from
-- the running script's own filename (process.argv[1]), the two Edge
-- Functions pass their own function name explicitly. Defaults to 'unknown'
-- so any not-yet-updated caller (or a future one that forgets) still
-- increments successfully instead of erroring.
create table if not exists goal_api_usage_by_source (
  day date not null,
  source text not null,
  request_count integer not null default 0,
  primary key (day, source)
);

alter table goal_api_usage_by_source enable row level security;

create or replace function increment_goal_api_usage(p_source text default 'unknown')
returns void
language sql
as $$
  insert into goal_api_usage (day, request_count)
  values (current_date, 1)
  on conflict (day) do update set request_count = goal_api_usage.request_count + 1;

  insert into goal_api_usage_by_source (day, source, request_count)
  values (current_date, coalesce(p_source, 'unknown'), 1)
  on conflict (day, source) do update set request_count = goal_api_usage_by_source.request_count + 1;
$$;

-- Same retention as goal_api_usage_cleanup (sql/041) -- per-source rows are
-- still tiny (a handful of distinct sources per day) but no reason to keep
-- them longer than the aggregate they break down.
select cron.unschedule('goal_api_usage_cleanup');
select cron.schedule(
  'goal_api_usage_cleanup',
  '10 3 * * *',
  $$
    delete from public.goal_api_usage where day < current_date - interval '120 days';
    delete from public.goal_api_usage_by_source where day < current_date - interval '120 days';
  $$
);
