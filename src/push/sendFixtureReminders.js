import { getSupabaseClient } from '../db/supabaseClient.js';
import { sendPushToFixtureFavoriters } from './sendPush.js';
import { buildFixtureStatusPayloads } from './fixtureNotifier.js';

// Pure DB poll, no external API calls -- kickoff_at is already known from
// our own fixtures table (synced elsewhere), so unlike syncLiveScores.js
// this never touches football-data.org/GOAL API at all. Runs on its own
// 5-min cron (fixture-reminders.yml) rather than piggybacking on
// syncLiveScores.js's own loop, since that loop only wakes up within ~10
// minutes of kickoff (see its own UPCOMING_WINDOW_MS) -- too late for a
// 30-minute-before reminder.
const MINUTES_BEFORE = [30, 15];

// Wider than the 5-min poll cadence so a delayed/missed cron tick (GitHub
// Actions schedules can lag by a few minutes under load) still catches the
// milestone at least once -- fixture_reminders_sent's primary key is what
// actually prevents a duplicate send if two consecutive ticks both see the
// same fixture in-window, not the window's own width.
const WINDOW_SLACK_MS = 5 * 60 * 1000;

async function claimMilestone(supabase, fixtureId, milestone) {
  const { error } = await supabase.from('fixture_reminders_sent').insert({ fixture_id: fixtureId, milestone });
  if (!error) return true;
  if (error.code === '23505') return false; // already sent -- another tick got there first
  throw error;
}

export async function sendFixtureReminders() {
  const supabase = getSupabaseClient();

  const { data: clubs, error: clubsErr } = await supabase.from('clubs').select('id, name, crest_url');
  if (clubsErr) throw clubsErr;
  const clubById = new Map(clubs.map((c) => [c.id, c]));

  const { data: leagues, error: leaguesErr } = await supabase.from('leagues').select('id, slug');
  if (leaguesErr) throw leaguesErr;
  const leagueSlugById = new Map(leagues.map((l) => [l.id, l.slug]));

  const now = Date.now();
  let sent = 0;

  for (const minutesBefore of MINUTES_BEFORE) {
    const target = now + minutesBefore * 60 * 1000;
    const from = new Date(target - WINDOW_SLACK_MS).toISOString();
    const to = new Date(target + WINDOW_SLACK_MS).toISOString();
    const milestone = `before_${minutesBefore}`;

    const { data: fixtures, error } = await supabase
      .from('fixtures')
      .select('id, league_id, home_club_id, away_club_id, favorite_fixtures(id)')
      .eq('status', 'scheduled')
      .gte('kickoff_at', from)
      .lte('kickoff_at', to);
    if (error) throw error;

    for (const fixture of fixtures) {
      if (!fixture.favorite_fixtures?.length) continue; // no work for a fixture nobody favorited
      const homeClub = clubById.get(fixture.home_club_id);
      const awayClub = clubById.get(fixture.away_club_id);
      const leagueSlug = leagueSlugById.get(fixture.league_id);
      if (!homeClub || !awayClub || !leagueSlug) continue;

      if (!(await claimMilestone(supabase, fixture.id, milestone))) continue;

      const payloads = buildFixtureStatusPayloads({
        milestone: 'reminder',
        minutesBefore,
        homeClub,
        awayClub,
        leagueSlug,
        fixtureId: fixture.id,
      });
      try {
        await sendPushToFixtureFavoriters(fixture.id, payloads);
        sent += 1;
      } catch (err) {
        console.error(`Failed to push kickoff reminder for fixture ${fixture.id}:`, err.message);
      }
    }
  }

  return { sent };
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  sendFixtureReminders()
    .then((result) => console.log('Fixture reminders sent:', result))
    .catch((err) => {
      console.error('Fixture reminders failed:', err);
      process.exitCode = 1;
    });
}
