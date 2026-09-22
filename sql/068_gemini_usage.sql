-- Tracks daily Gemini request volume per (source script, model) -- same
-- motivation and shape as goal_api_usage/goal_api_usage_by_source (sql/041,
-- sql/067): two independent pipelines (runNewsScraper.js's llmExtract.js on
-- gemini-3.6-flash, runGeneralNewsScraper.js's llmSummarizeNews.js on
-- gemini-3.5-flash-lite) share one Google AI Studio account, each against
-- its own model-specific free-tier RPD cap, and this project has already
-- been burned twice by a quota exhaustion nobody could see coming (the
-- 20 RPD gemini-3.6-flash cap that stranded News's first real run;
-- gemini-3.5-flash-lite's 500 RPD confirmed as the actually-binding
-- constraint after that switch) -- see llmSummarizeNews.js's/llmExtract.js's
-- own comments for that history. One row per (day, source, model),
-- incremented on every raw call attempt (successes AND failures, including
-- retries) -- a rejected/erroring call still counts against the provider's
-- own RPD the same way a 429 still counts against GOAL API's budget
-- (goalApiClient.js's own recordUsage() applies the identical principle).
create table if not exists gemini_usage (
  day date not null,
  source text not null,
  model text not null,
  request_count integer not null default 0,
  primary key (day, source, model)
);

-- Backend-only, same treatment as goal_api_usage/goal_api_usage_by_source:
-- RLS with zero policies denies all access to the anon key. Every writer
-- here (Node's service-role client) already bypasses RLS.
alter table gemini_usage enable row level security;

create or replace function increment_gemini_usage(p_source text, p_model text)
returns void
language sql
as $$
  insert into gemini_usage (day, source, model, request_count)
  values (current_date, coalesce(p_source, 'unknown'), coalesce(p_model, 'unknown'), 1)
  on conflict (day, source, model) do update set request_count = gemini_usage.request_count + 1;
$$;

-- Same 120-day retention as goal_api_usage_cleanup.
select cron.schedule(
  'gemini_usage_cleanup',
  '15 3 * * *',
  $$ delete from public.gemini_usage where day < current_date - interval '120 days'; $$
);
