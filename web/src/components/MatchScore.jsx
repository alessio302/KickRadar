// Shared between the fixtures list (FixturesTab) and the detail overlay's
// header (FixtureDetailOverlay) so the three states -- upcoming, live,
// finished -- read the same way in both places. `style` carries each call
// site's own sizing (they differ: a compact list row vs. a bigger overlay
// header); only the live variant adds its own color/weight/dot on top of
// whatever's passed in, since "live" needs to stand out regardless of
// where it's shown.
export default function MatchScore({ fixture, t, theme, style }) {
  const scoreText = `${fixture.home_score} : ${fixture.away_score}`;

  if (fixture.status === 'live') {
    return (
      <span style={{ ...style, display: 'inline-flex', alignItems: 'center', gap: '4px', color: theme.danger, fontWeight: 700 }}>
        <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: theme.danger, flexShrink: 0 }} />
        <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.03em' }}>{t.fixtures.live}</span>
        {scoreText}
      </span>
    );
  }

  if (fixture.status === 'finished') {
    return <span style={style}>{scoreText}</span>;
  }

  return <span style={style}>{t.common.vs}</span>;
}
