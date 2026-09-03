-- Tracks daily GOAL API request volume across every caller (goalApiClient.js's
-- shared call(), and the two Edge Functions with their own live-fallback
-- fetch: get-player-profile, get-team-squad) -- confirmed this account is
-- on GOAL API's FREE plan (1,000 requests/day), and until now nothing
-- tracked actual usage against that: figuring out where the budget went
-- meant reading cron files and counting clubs/players by hand. One row
-- per day, incremented atomically so concurrent callers (multiple sync
-- jobs, multiple Edge Function invocations) never race-lose an increment.
create table if not exists goal_api_usage (
  day date primary key,
  request_count integer not null default 0
);

-- Backend-only, same treatment as every other backend-only table in this
-- project (webhook_debug_log, etc.): RLS with zero policies denies all
-- access to the anon key. Every writer here (Node's service-role client,
-- both Edge Functions' service-role client) already bypasses RLS, so no
-- policy needs to exist for this table to be usable.
alter table goal_api_usage enable row level security;

create or replace function increment_goal_api_usage()
returns void
language sql
as $$
  insert into goal_api_usage (day, request_count)
  values (current_date, 1)
  on conflict (day) do update set request_count = goal_api_usage.request_count + 1;
$$;

-- Mirrors webhook_debug_log_cleanup's own retention approach -- daily
-- counts, not per-request rows, so this stays tiny regardless, but no
-- reason to keep it beyond a season's worth of days.
select cron.schedule(
  'goal_api_usage_cleanup',
  '10 3 * * *',
  $$ delete from public.goal_api_usage where day < current_date - interval '120 days'; $$
);
