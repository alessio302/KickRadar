import { useState } from 'react';

// Clubs whose real crest is a solid/near-solid black mark with no color of
// its own (confirmed live: Juventus FC's current minimalist "J") vanish
// against this app's dark background. Rather than inventing a background
// behind every crest that isn't there in the source image, this inverts
// just these specific crests to white in dark mode only -- same approach
// LiveScore uses, and light mode is untouched since black-on-light already
// reads fine there. Same accreting-override-list pattern this project
// already uses for club naming quirks (see syncClubs.js's
// SHORT_NAME_OVERRIDES) -- add a club here if a future one turns out to
// have the same solid-black-crest problem.
const INVERT_IN_DARK_MODE = new Set(['Juventus FC']);

// Renders the real club crest football-data.org's /teams response carries
// per club (see sql/031_club_crest.sql) -- confirmed live, a clean
// transparent PNG, not a screenshot or watermarked logo. No per-club
// hand-drawn fallback here on purpose: mixing real crest photos with a
// colorful illustrated jersey for whichever clubs hadn't synced one yet
// read as inconsistent side by side, not as a reasonable placeholder.
// Every club gets the same plain neutral badge until (or unless) its real
// crest is available, never a one-off substitute.
export default function ClubJersey({ club, size = 24, theme }) {
  const [imgFailed, setImgFailed] = useState(false);
  if (!club) return null;

  if (club.crest_url && !imgFailed) {
    const invert = theme.isDark && INVERT_IN_DARK_MODE.has(club.name);
    return (
      <img
        src={club.crest_url}
        alt={club.name}
        title={club.name}
        width={size}
        height={size}
        style={{ objectFit: 'contain', flex: '0 0 auto', filter: invert ? 'invert(1)' : 'none' }}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div
      title={club.name}
      aria-label={club.name}
      style={{
        width: size,
        height: size,
        borderRadius: '999px',
        background: theme.surfaceRaised,
        border: `1px solid ${theme.border}`,
        boxSizing: 'border-box',
        flex: '0 0 auto',
      }}
    />
  );
}
