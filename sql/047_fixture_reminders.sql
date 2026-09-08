-- Tracks which push milestones (30-min reminder, 15-min reminder, kickoff,
-- full-time) have already been sent for a fixture, so a poller that runs
-- every few minutes doesn't re-send the same milestone on every tick it
-- sees the fixture still matching -- same insert-as-claim pattern as
-- notified_match_events (026_favorite_fixtures.sql): the primary key does
-- the deduplication, no separate "have I sent this" read needed first.
-- See src/push/sendFixtureReminders.js (before_30/before_15) and
-- src/football-api/syncLiveScores.js (kickoff/finished).
create table if not exists fixture_reminders_sent (
  fixture_id int not null references fixtures(id) on delete cascade,
  milestone text not null, -- 'before_30' | 'before_15' | 'kickoff' | 'finished'
  sent_at timestamptz not null default now(),
  primary key (fixture_id, milestone)
);

alter table fixture_reminders_sent enable row level security;
-- Written only by the backend (service_role, bypasses RLS) -- no anon
-- access needed at all, same as notified_match_events.
