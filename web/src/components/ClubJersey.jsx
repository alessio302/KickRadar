import { useState } from 'react';

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
    return (
      <img
        src={club.crest_url}
        alt={club.name}
        title={club.name}
        width={size}
        height={size}
        style={{ objectFit: 'contain', flex: '0 0 auto' }}
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
