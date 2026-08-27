-- Stores the full match-event timeline (goals/cards/subs) per fixture, for
-- the "Spielinfo" tab in the fixture detail overlay. Unlike the earlier,
-- since-reverted live-polling design, this is fetched exactly ONCE per
-- fixture, right after it finishes -- see syncLineups.js. events_synced_at
-- marks "we already tried" (even a 0-0 draw with no cards has 0 real
-- events, so this can't just be "does match_events have any rows").
alter table fixtures add column if not exists events_synced_at timestamptz;

create table if not exists match_events (
  id uuid primary key default gen_random_uuid(),
  fixture_id int not null references fixtures(id) on delete cascade,
  club_id int references clubs(id), -- null when Highlightly's own team name didn't resolve to a curated club
  type text not null,               -- 'Goal' | 'Yellow Card' | 'Red Card' | 'Substitution' | ... (Highlightly's own type string, stored as-is)
  minute text not null,             -- Highlightly's own display string, e.g. "40" or "45+2"
  player text,
  assist text,
  substituted text,                 -- player coming off, for a Substitution event
  event_key text not null,          -- dedup key, same shape as the old notified_match_events (type|club_id|player|minute)
  created_at timestamptz not null default now(),
  unique (fixture_id, event_key)
);
create index if not exists idx_match_events_fixture on match_events(fixture_id);

alter table match_events enable row level security;
create policy "Public read access" on match_events for select using (true);
-- No anon write policy: only the service_role-backed sync job writes here,
-- same pattern as lineups/transfers/fixtures.
