-- Temporary logging table for inspecting GOAL API's real webhook payloads
-- before building the real handler -- same "diagnose first" pattern this
-- project already uses (see git history's many diagnose*.js scripts).
create table if not exists webhook_debug_log (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  headers jsonb,
  body jsonb
);
-- Backend-only table (written by the edge function's service-role client,
-- read by us directly via SQL) -- RLS with zero policies denies all
-- access to the anon key, same treatment as every other backend-only
-- table in this project.
alter table webhook_debug_log enable row level security;
