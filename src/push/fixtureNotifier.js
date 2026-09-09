import { pushStringsFor, SUPPORTED_PUSH_LANGUAGES } from './pushI18n.js';

// Builds the multi-language payload set for a favorited-fixture status
// push -- a 30/15-minute pre-kickoff reminder (sendFixtureReminders.js,
// its own poller), or kickoff/full-time (syncLiveScores.js, piggybacked on
// its existing status-write loop). Shared so the wording/shape lives in
// exactly one place rather than drifting between the two callers.
//
// No crest icon (per explicit request) -- left as the default app icon,
// same as every other push category. Web Push only supports one small
// icon anyway, not two club logos side by side, so this was always going
// to be one-sided at best.
export function buildFixtureStatusPayloads({ milestone, minutesBefore, homeClub, awayClub, leagueSlug, fixtureId, homeScore, awayScore }) {
  const byLanguage = {};
  for (const lang of SUPPORTED_PUSH_LANGUAGES) {
    const strings = pushStringsFor(lang);
    let title;
    let body;
    if (milestone === 'reminder') {
      title = `${strings.fixtureReminder.icon} ${strings.fixtureReminder.title(minutesBefore)}`;
      body = `${homeClub.name} – ${awayClub.name}`;
    } else if (milestone === 'kickoff') {
      title = `${strings.matchStarted.icon} ${strings.matchStarted.title}`;
      body = `${homeClub.name} – ${awayClub.name}`;
    } else {
      title = `${strings.matchFinished.icon} ${strings.matchFinished.title}`;
      body = `${homeClub.name} ${homeScore ?? '?'}:${awayScore ?? '?'} ${awayClub.name}`;
    }
    byLanguage[lang] = {
      title,
      body,
      url: `/?league=${leagueSlug}&fixture=${fixtureId}`,
    };
  }
  return byLanguage;
}
