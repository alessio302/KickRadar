import { Star } from 'lucide-react';
import ClubJersey from './ClubJersey.jsx';

// Fixed gold, not theme.accent -- confirmed live that using the theme
// accent made the favorited indicator blend into the (also accent-colored)
// kickoff time right next to it instead of standing out. A literal
// star-yellow reads as "favorited" against both the light and dark surface
// colors, matching how league dots/club badges elsewhere in this app also
// use their own fixed colors rather than theme tokens.
const FAVORITE_STAR_COLOR = '#FFC107';

// One team's badge/name (left) and score (right, only while live or
// finished -- a scheduled fixture has no score yet). Split out of the main
// row body since it's rendered twice, identically, once per side. The
// score (not the name) turns red while live -- user-reported the row's
// only live indicator being the left accent bar and the status-column
// minute wasn't enough, the number itself should read as live too, same
// as LiveCarousel.jsx/MatchScore.jsx already do elsewhere.
function TeamRow({ club, theme, score, isLive }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <ClubJersey club={club} size={22} theme={theme} />
        <span
          style={{
            fontSize: '14px',
            fontWeight: 700,
            color: theme.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {club?.short_name || club?.name}
        </span>
      </div>
      {score != null && (
        // fontVariantNumeric: 'tabular-nums' -- same fix LiveCarousel.jsx's
        // own ClubRow already has. User-reported: without it, home/away
        // scores didn't line up right-aligned even though both spans sit
        // flush against the identical right edge (justify-content:
        // 'space-between' on the row above) -- a proportional font gives
        // narrow digits like "1" less ink-width than "2"/"8", so the
        // VISIBLE glyph looked shifted relative to the row below it even
        // though the CSS box itself was correctly aligned. Uniform digit
        // width removes that mismatch.
        <span style={{ fontSize: '14px', fontWeight: 700, color: isLive ? theme.danger : theme.text, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {score}
        </span>
      )}
    </div>
  );
}

// LiveScore-style layout (2026-09-11, replacing an earlier single-row
// "home vs away" side-by-side design): user-reported that layout ran out
// of room for real club names ("Crystal P..." etc, mid-word truncation) --
// two full-width stacked rows (home above away, each with its own
// right-aligned score) give each team name the full card width instead of
// splitting it between two names sharing one row, matching how LiveScore/
// most other score apps lay this out. No "LIVE" text label anymore either
// (same request): the live minute (or, absent one -- see below -- just the
// left accent bar) plus its red color are already the live indicator, a
// separate word saying so is redundant. A permanent tappable star, not
// swipe-to-reveal (what this replaced originally) -- confirmed live: a
// row-level horizontal swipe and LeagueCarousel's own full-screen
// horizontal swipe (switch league) both claimed the same gesture, so a
// swipe meant to reveal the star often also flipped the league underneath
// it, or the other way around. A persistent icon needs no drag at all, so
// there's nothing left for the two gestures to fight over -- same pattern
// LiveScore uses for exactly this reason.
export default function FixtureRow({ theme, t, locale, formatTime, clubsById, fixture, isFavorite, onSelectFixture, onToggleFavorite }) {
  // A finished match never goes live again, so the live-events pipeline
  // (src/lineups/syncLiveEvents.js) has nothing left to push regardless of
  // favoriting it -- offering the star here would just leave a permanently
  // "on" favorite that can never do anything. A same-width blank spacer
  // keeps the row's other columns aligned with favoritable rows above/below
  // it in the same matchday group instead of shifting everything left.
  const favoritable = fixture.status !== 'finished';
  const isLive = fixture.status === 'live';
  const isFinished = fixture.status === 'finished';
  const showScore = isLive || isFinished;

  const handleStarClick = (e) => {
    e.stopPropagation();
    onToggleFavorite(fixture);
  };

  // live_minute lags status by however long syncLiveEvents.js's WS takes to
  // push a first tick for this match (or never arrives at all -- confirmed
  // live 2026-09-10 GOAL API's WS doesn't reliably push for every
  // subscribed match). Rendering nothing here in that gap (rather than
  // falling back to a "LIVE" word, since that's exactly what this redesign
  // dropped) still reads as live via the left accent bar's own color --
  // just without a minute number until one arrives.
  let statusLabel;
  if (isFinished) {
    statusLabel = t.fixtures.finished;
  } else if (isLive) {
    statusLabel = fixture.live_minute ? (fixture.live_minute === 'HT' ? fixture.live_minute : `${fixture.live_minute}'`) : null;
  } else if (fixture.kickoff_confirmed === false) {
    // Confirmed live: a fixture far enough out that the broadcaster hasn't
    // announced its kickoff time yet still carries a kickoff_at (football-
    // data.org's own 00:00:00 UTC placeholder, see syncFixtures.js's own
    // comment) -- showing that formatted as a real clock time read as a
    // live time that just happened to be wrong. kickoff_confirmed flips to
    // true automatically once a scheduled sync re-fetches after the real
    // time is published, so this resolves itself with no further action
    // once that happens.
    statusLabel = t.fixtures.kickoffTbd;
  } else {
    statusLabel = formatTime(fixture.kickoff_at, locale);
  }

  return (
    <div
      onClick={() => onSelectFixture(fixture)}
      style={{
        background: theme.surfaceRaised,
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'stretch',
        gap: '10px',
        padding: '12px 14px',
        cursor: 'pointer',
      }}
    >
      <span aria-hidden="true" style={{ width: '3px', borderRadius: '2px', background: isLive ? theme.danger : 'transparent', flexShrink: 0 }} />
      {/* Fixed width, not minWidth -- confirmed live: the translated
          "finished" label (e.g. Spanish "Finalizado", 63.6px at this
          font/weight) is wider than a clock time ("20:45", 33.3px) in
          every one of the app's 5 languages, so minWidth alone let a
          finished row's label overflow past a scheduled row's own width.
          A true fixed width keeps this column identical regardless of
          which status text a given row happens to show. */}
      <div style={{ width: '66px', flex: '0 0 auto', display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: isLive ? theme.danger : isFinished ? theme.textMuted : theme.accent, whiteSpace: 'nowrap' }}>
          {statusLabel}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'center' }}>
        <TeamRow club={clubsById.get(fixture.home_club_id)} theme={theme} score={showScore ? fixture.home_score : null} isLive={isLive} />
        <TeamRow club={clubsById.get(fixture.away_club_id)} theme={theme} score={showScore ? fixture.away_score : null} isLive={isLive} />
      </div>
      {/* User-reported (2026-09-11): a same-session detour anchoring this
          to the card's own top-right corner "sah kacke aus" -- reverted
          back to this, a flex sibling centered against the two-team-row
          block via alignSelf. Horizontal-only negative margin (not the
          original uniform '-4px'): that enlarges the tap target without
          widening the layout footprint on the sides, but a vertical
          negative margin here would render the button's enlarged tap
          target over the score numbers above/below it (confirmed live --
          see this file's own git history for that specific regression). */}
      {favoritable ? (
        <button
          onClick={handleStarClick}
          aria-label={isFavorite ? t.fixtures.unfavoriteAria : t.fixtures.favoriteAria}
          style={{
            flex: '0 0 auto',
            width: '30px',
            height: '30px',
            margin: '0 -4px',
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'center',
          }}
        >
          <Star size={18} fill={isFavorite ? FAVORITE_STAR_COLOR : 'none'} color={isFavorite ? FAVORITE_STAR_COLOR : theme.textMuted} />
        </button>
      ) : (
        // margin matches the star button's own (horizontal-only) negative
        // margin -- there to enlarge its tap target without widening its
        // layout footprint. Confirmed live: without this, this plain
        // spacer took up a genuine 30px while the button's negative margin
        // shrank its own effective footprint by 8px, so every column after
        // this one sat 8px further right on a finished row than on a
        // favoritable one.
        <span style={{ width: '30px', margin: '0 -4px', flex: '0 0 auto' }} aria-hidden="true" />
      )}
    </div>
  );
}
