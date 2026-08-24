-- Enables Row Level Security and adds public-read-only policies.
--
-- Without this, the anon/publishable key (which the frontend necessarily
-- ships in its JS bundle -- it's public by design) would have full
-- unrestricted CRUD on every table, since Supabase grants the `anon` role
-- table-level privileges by default and RLS is what's meant to restrict
-- that. Needed before the frontend (web/) starts using the anon key.
--
-- The backend scripts use SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS
-- entirely (service_role has bypassrls) -- none of the sync/scraper
-- scripts are affected by this.
alter table leagues enable row level security;
alter table clubs enable row level security;
alter table players enable row level security;
alter table transfers enable row level security;
alter table fixtures enable row level security;
alter table lineups enable row level security;
alter table push_subscriptions enable row level security;

create policy "Public read access" on leagues for select using (true);
create policy "Public read access" on clubs for select using (true);
create policy "Public read access" on players for select using (true);
create policy "Public read access" on transfers for select using (true);
create policy "Public read access" on fixtures for select using (true);
create policy "Public read access" on lineups for select using (true);

-- push_subscriptions intentionally gets NO policy yet -- RLS with zero
-- policies denies all access (including to anon), which is correct until
-- the push-notification feature is built and a scoped insert policy (a
-- user can only insert their own subscription, no read access to others')
-- is added alongside it.
