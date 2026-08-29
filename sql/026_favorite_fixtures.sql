-- Lets a push subscription favorite individual fixtures to get pushed on
-- their live events (goals/cards/subs) -- see src/lineups/matchEventNotifier.js.
-- No login system exists (same as everything else in this app), so a
-- favorite has to be tied to the push subscription itself, exactly like
-- notify_transfers/notify_lineups already are, just per-fixture instead
-- of a blanket boolean.
--
-- This is a second attempt at a feature that was built and reverted once
-- before (see git history, "Revert favorite-fixtures / match-event push
-- feature"): the first version needed its own dedicated fetch of
-- Highlightly's /events endpoint per favorited fixture, which didn't fit
-- Highlightly's 100 req/day budget alongside the existing lineups sync.
-- Now that live events are already ingested for every match regardless of
-- favoriting (src/lineups/syncLiveEvents.js, via GOAL API's WebSocket
-- feed) and land in match_events, this version needs no extra requests at
-- all -- it only filters and pushes rows that are already being written.

create table if not exists favorite_fixtures (
  id uuid primary key default gen_random_uuid(),
  push_subscription_id uuid not null references push_subscriptions(id) on delete cascade,
  fixture_id int not null references fixtures(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (push_subscription_id, fixture_id)
);
create index if not exists idx_favorite_fixtures_fixture on favorite_fixtures(fixture_id);

-- Tracks which specific match events have already been pushed, once per
-- fixture (not per subscriber -- the event itself only needs to be seen
-- once; sendPushToFixtureFavoriters then fans it out to everyone who
-- favorited that fixture). event_key reuses match_events' own column of
-- the same name and meaning (see sql/016_match_events.sql /
-- src/lineups/syncLiveEvents.js's buildLiveEventRows) -- no separate key
-- scheme needed.
create table if not exists notified_match_events (
  fixture_id int not null references fixtures(id) on delete cascade,
  event_key text not null,
  notified_at timestamptz not null default now(),
  primary key (fixture_id, event_key)
);

alter table favorite_fixtures enable row level security;
alter table notified_match_events enable row level security;
-- No direct anon policies on either table -- same reasoning as
-- push_subscriptions (012_push_subscriptions_rpc.sql): every read/write
-- goes through a SECURITY DEFINER function that requires endpoint+auth
-- (the subscription's own secret, proving it's really that subscriber),
-- so a call can never touch more than the rows it names.
-- notified_match_events is written only by the backend (service_role,
-- bypasses RLS) -- no anon function needed for it at all.

create or replace function add_favorite_fixture(
  p_endpoint text,
  p_auth text,
  p_fixture_id int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub_id uuid;
begin
  select id into v_sub_id from push_subscriptions where endpoint = p_endpoint and auth = p_auth;
  if v_sub_id is null then
    raise exception 'Unknown push subscription';
  end if;
  insert into favorite_fixtures (push_subscription_id, fixture_id)
  values (v_sub_id, p_fixture_id)
  on conflict (push_subscription_id, fixture_id) do nothing;
end;
$$;

create or replace function remove_favorite_fixture(
  p_endpoint text,
  p_auth text,
  p_fixture_id int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub_id uuid;
begin
  select id into v_sub_id from push_subscriptions where endpoint = p_endpoint and auth = p_auth;
  if v_sub_id is null then
    return;
  end if;
  delete from favorite_fixtures where push_subscription_id = v_sub_id and fixture_id = p_fixture_id;
end;
$$;

create or replace function get_favorite_fixture_ids(
  p_endpoint text,
  p_auth text
) returns table (fixture_id int)
language sql
security definer
set search_path = public
as $$
  select ff.fixture_id
  from favorite_fixtures ff
  join push_subscriptions ps on ps.id = ff.push_subscription_id
  where ps.endpoint = p_endpoint and ps.auth = p_auth;
$$;

revoke all on function add_favorite_fixture(text, text, int) from public;
revoke all on function remove_favorite_fixture(text, text, int) from public;
revoke all on function get_favorite_fixture_ids(text, text) from public;
grant execute on function add_favorite_fixture(text, text, int) to anon;
grant execute on function remove_favorite_fixture(text, text, int) to anon;
grant execute on function get_favorite_fixture_ids(text, text) to anon;
