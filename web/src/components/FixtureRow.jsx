import ClubJersey from './ClubJersey.jsx';
import MatchScore from './MatchScore.jsx';

export default function FixtureRow({ theme, t, locale, formatTime, clubsById, fixture, onSelectFixture }) {
  return (
    <div
      onClick={() => onSelectFixture(fixture)}
      style={{
        background: theme.surfaceRaised,
        padding: '10px 14px',
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: '13px', fontWeight: 700, color: theme.accent, width: '48px', flex: '0 0 auto' }}>
        {formatTime(fixture.kickoff_at, locale)}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
        <ClubJersey club={clubsById.get(fixture.home_club_id)} size={20} theme={theme} />
        <span style={{ fontSize: '13px' }}>{clubsById.get(fixture.home_club_id)?.name}</span>
      </div>
      <MatchScore fixture={fixture} t={t} theme={theme} style={{ fontSize: '11px', color: theme.textMuted }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: '13px' }}>{clubsById.get(fixture.away_club_id)?.name}</span>
        <ClubJersey club={clubsById.get(fixture.away_club_id)} size={20} theme={theme} />
      </div>
    </div>
  );
}
