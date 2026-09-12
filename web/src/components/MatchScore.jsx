// Shared between the fixtures list (FixturesTab) and the detail overlay's
// header (FixtureDetailOverlay) so the three states -- upcoming, live,
// finished -- read the same way in both places. `style` carries each call
// site's own sizing (they differ: a compact list row vs. a bigger overlay
// header); only the live variant adds its own color/weight/dot on top of
// whatever's passed in, since "live" needs to stand out regardless of
// where it's shown.
//
// Live minute sits under the score instead of a "LIVE" word next to it
// (per explicit feedback -- the red dot and colour already say "live",
// repeating the word next to the score was redundant, and the minute is
// the actually useful piece of information). Same live_minute fallback
// EuropaFixtureRow/FixtureRow already use: falls back to the "LIVE" word
// only in the gap before a first minute tick has arrived at all.
export default function MatchScore({ fixture, t, theme, style }) {
  const scoreText = `${fixture.home_score} : ${fixture.away_score}`;

  if (fixture.status === 'live') {
    const minuteLabel = fixture.live_minute
      ? fixture.live_minute === 'HT'
        ? fixture.live_minute
        : `${fixture.live_minute}'`
      : t.fixtures.live;
    return (
      <span style={{ ...style, display: 'inline-flex', flexDirection: 'column', alignItems: 'center', color: theme.danger, fontWeight: 700 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: theme.danger, flexShrink: 0 }} />
          {scoreText}
        </span>
        <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.03em', marginTop: '2px' }}>{minuteLabel}</span>
      </span>
    );
  }

  if (fixture.status === 'finished') {
    return <span style={style}>{scoreText}</span>;
  }

  return <span style={style}>{t.common.vs}</span>;
}
