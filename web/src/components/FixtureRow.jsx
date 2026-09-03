import { Star } from 'lucide-react';
import ClubJersey from './ClubJersey.jsx';
import MatchScore from './MatchScore.jsx';

// Fixed gold, not theme.accent -- confirmed live that using the theme
// accent made the favorited indicator blend into the (also accent-colored)
// kickoff time right next to it instead of standing out. A literal
// star-yellow reads as "favorited" against both the light and dark surface
// colors, matching how league dots/club badges elsewhere in this app also
// use their own fixed colors rather than theme tokens.
const FAVORITE_STAR_COLOR = '#FFC107';

// A permanent tappable star, not swipe-to-reveal (what this replaced) --
// confirmed live: a row-level horizontal swipe and LeagueCarousel's own
// full-screen horizontal swipe (switch league) both claimed the same
// gesture, so a swipe meant to reveal the star often also flipped the
// league underneath it, or the other way around. A persistent icon needs
// no drag at all, so there's nothing left for the two gestures to fight
// over -- same pattern LiveScore uses for exactly this reason.
export default function FixtureRow({ theme, t, locale, formatTime, clubsById, fixture, isFavorite, onSelectFixture, onToggleFavorite }) {
  // A finished match never goes live again, so the live-events pipeline
  // (src/lineups/syncLiveEvents.js) has nothing left to push regardless of
  // favoriting it -- offering the star here would just leave a permanently
  // "on" favorite that can never do anything. A same-width blank spacer
  // keeps the row's other columns aligned with favoritable rows above/below
  // it in the same matchday group instead of shifting everything left.
  const favoritable = fixture.status !== 'finished';

  const handleStarClick = (e) => {
    e.stopPropagation();
    onToggleFavorite(fixture);
  };

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
        gap: '8px',
        cursor: 'pointer',
      }}
    >
      {favoritable ? (
        <button
          onClick={handleStarClick}
          aria-label={isFavorite ? t.fixtures.unfavoriteAria : t.fixtures.favoriteAria}
          style={{
            flex: '0 0 auto',
            width: '30px',
            height: '30px',
            margin: '-4px',
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Star size={18} fill={isFavorite ? FAVORITE_STAR_COLOR : 'none'} color={isFavorite ? FAVORITE_STAR_COLOR : theme.textMuted} />
        </button>
      ) : (
        <span style={{ width: '30px', flex: '0 0 auto' }} aria-hidden="true" />
      )}
      <span style={{ fontSize: '13px', fontWeight: 700, color: theme.accent, minWidth: '46px', flex: '0 0 auto', whiteSpace: 'nowrap' }}>
        {fixture.status === 'finished'
          ? t.fixtures.finished
          : fixture.status === 'live' && fixture.live_minute
            ? fixture.live_minute === 'HT'
              ? fixture.live_minute
              : `${fixture.live_minute}'`
            : // Confirmed live: a fixture far enough out that the
              // broadcaster hasn't announced its kickoff time yet still
              // carries a kickoff_at (football-data.org's own 00:00:00 UTC
              // placeholder, see syncFixtures.js's own comment) -- showing
              // that formatted as a real clock time read as a live time
              // that just happened to be wrong. kickoff_confirmed flips to
              // true automatically once a scheduled sync re-fetches after
              // the real time is published, so this resolves itself with
              // no further action once that happens.
              fixture.kickoff_confirmed === false
              ? t.fixtures.kickoffTbd
              : formatTime(fixture.kickoff_at, locale)}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
        <ClubJersey club={clubsById.get(fixture.home_club_id)} size={20} theme={theme} />
        <span style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {clubsById.get(fixture.home_club_id)?.short_name || clubsById.get(fixture.home_club_id)?.name}
        </span>
      </div>
      <MatchScore fixture={fixture} t={t} theme={theme} style={{ fontSize: '11px', color: theme.textMuted, flex: '0 0 auto' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {clubsById.get(fixture.away_club_id)?.short_name || clubsById.get(fixture.away_club_id)?.name}
        </span>
        <ClubJersey club={clubsById.get(fixture.away_club_id)} size={20} theme={theme} />
      </div>
    </div>
  );
}
