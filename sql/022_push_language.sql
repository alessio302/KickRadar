-- Push notifications were sent in German only, regardless of the
-- subscriber's app language (web/src/hooks/useLanguage.js already covers
-- de/en/it/fr/es for everything else in the UI). Storing each
-- subscription's current app language lets sendPush.js send each
-- subscriber the payload variant matching their own language instead of
-- one fixed-language blast to everyone -- see src/push/pushI18n.js.
alter table push_subscriptions add column if not exists language text not null default 'de';

-- Recreated with the extra p_language param (default 'de' so an old
-- caller/cached client without it still works). Drop first: this changes
-- the function's argument list, and create-or-replace can't do that --
-- Postgres would otherwise leave the old 3-arg version in place alongside
-- the new one instead of actually replacing it.
drop function if exists upsert_push_subscription(text, text, text);

create or replace function upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_language text default 'de'
) returns void
language sql
security definer
set search_path = public
as $$
  insert into push_subscriptions (endpoint, p256dh, auth, language, updated_at)
  values (p_endpoint, p_p256dh, p_auth, p_language, now())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        language = excluded.language,
        updated_at = now();
$$;

-- Keeps an already-subscribed browser's stored language in sync when the
-- user changes the app language later -- ensurePushSubscription.js only
-- runs the upsert above once per browser (it returns the existing
-- PushManager subscription immediately without re-upserting on later
-- calls), so without this a subscriber who switches languages after
-- first subscribing would keep getting notifications in their old
-- language forever.
create or replace function set_push_language(
  p_endpoint text,
  p_auth text,
  p_language text
) returns void
language sql
security definer
set search_path = public
as $$
  update push_subscriptions
  set language = p_language,
      updated_at = now()
  where endpoint = p_endpoint and auth = p_auth;
$$;

revoke all on function upsert_push_subscription(text, text, text, text) from public;
grant execute on function upsert_push_subscription(text, text, text, text) to anon;
revoke all on function set_push_language(text, text, text) from public;
grant execute on function set_push_language(text, text, text) to anon;
