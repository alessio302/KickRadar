-- Tightens push_subscriptions write access. The anon-key policies added in
-- 008 ("Anyone can update/delete a subscription", using (true)) let anyone
-- holding the public anon key -- which ships in the frontend's JS bundle,
-- so effectively anyone -- mutate or delete ANY row, not just their own.
-- RLS USING clauses gate whether a given row is writable; they say nothing
-- about whether the client's query even supplied a filter. A bare
-- `DELETE FROM push_subscriptions` sent straight at the PostgREST API
-- (skipping the app's own .eq('endpoint', ...) filter) would wipe every
-- subscription in the table. No personal data leaks either way (there was
-- never a select policy), but it's a real integrity gap: Art. 32 GDPR
-- ("appropriate technical measures") doesn't love "anyone can delete
-- everyone's row".
--
-- Fix: drop the direct table policies and replace every write, plus the
-- one read the frontend needs, with SECURITY DEFINER functions that
-- hardcode their own WHERE clause. Endpoint alone still authorizes a
-- lookup (matches 008's own reasoning: an endpoint is an unguessable,
-- browser-issued value that already functions like a bearer credential),
-- but anything that changes an existing row also requires `auth` -- the
-- subscription's own secret key, never exposed anywhere except to the
-- legitimate browser and this table. Since the match lives inside the
-- function body rather than in client-supplied SQL, a single call can
-- never touch more than the one row it names.

drop policy if exists "Anyone can insert a subscription" on push_subscriptions;
drop policy if exists "Anyone can update a subscription" on push_subscriptions;
drop policy if exists "Anyone can delete a subscription" on push_subscriptions;

-- Deliberately no delete function/policy at all: the frontend never
-- deletes a subscription (usePushSubscription.js turns both notify
-- toggles off without tearing anything down -- the row just stops being
-- sent to). Only sendPush.js prunes stale ones, server-side, with the
-- service_role key, which bypasses RLS entirely. Nothing legitimate needs
-- anon delete access, so it isn't granted.

create or replace function upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
) returns void
language sql
security definer
set search_path = public
as $$
  insert into push_subscriptions (endpoint, p256dh, auth, updated_at)
  values (p_endpoint, p_p256dh, p_auth, now())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        updated_at = now();
$$;

create or replace function get_push_preferences(
  p_endpoint text,
  p_auth text
) returns table (notify_transfers boolean, notify_lineups boolean)
language sql
security definer
set search_path = public
as $$
  select notify_transfers, notify_lineups
  from push_subscriptions
  where endpoint = p_endpoint and auth = p_auth;
$$;

-- p_notify_transfers/p_notify_lineups are nullable so one call can change
-- just one preference (coalesce keeps the other column as-is) -- matches
-- how SettingsTab's two toggles already work independently.
create or replace function set_push_preference(
  p_endpoint text,
  p_auth text,
  p_notify_transfers boolean default null,
  p_notify_lineups boolean default null
) returns void
language sql
security definer
set search_path = public
as $$
  update push_subscriptions
  set notify_transfers = coalesce(p_notify_transfers, notify_transfers),
      notify_lineups = coalesce(p_notify_lineups, notify_lineups),
      updated_at = now()
  where endpoint = p_endpoint and auth = p_auth;
$$;

revoke all on function upsert_push_subscription(text, text, text) from public;
revoke all on function get_push_preferences(text, text) from public;
revoke all on function set_push_preference(text, text, boolean, boolean) from public;
grant execute on function upsert_push_subscription(text, text, text) to anon;
grant execute on function get_push_preferences(text, text) to anon;
grant execute on function set_push_preference(text, text, boolean, boolean) to anon;
