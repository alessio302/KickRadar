import { useState } from 'react';

// Renders the real club crest football-data.org's /teams response carries
// per club (see sql/031_club_crest.sql) -- confirmed live, a clean
// transparent PNG, not a screenshot or watermarked logo. No per-club
// hand-drawn fallback here on purpose: mixing real crest photos with a
// colorful illustrated jersey for whichever clubs hadn't synced one yet
// read as inconsistent side by side, not as a reasonable placeholder.
// Every club gets the same plain neutral badge until (or unless) its real
// crest is available, never a one-off substitute.
//
// The image always sits on a fixed white circle, in both themes -- crests
// are drawn assuming a white/light surface (many, like Juventus' current
// minimalist black "J", have no light element of their own at all), so on
// this app's dark background a crest like that was confirmed live to be
// almost invisible. Every club gets identical backing regardless of its
// own colors, rather than only patching the specific clubs that happen to
// look bad -- the same "one consistent treatment for everyone" call this
// component already makes for the missing-crest case below.
const CREST_BACKGROUND = '#ffffff';

export default function ClubJersey({ club, size = 24, theme }) {
  const [imgFailed, setImgFailed] = useState(false);
  if (!club) return null;

  if (club.crest_url && !imgFailed) {
    const padding = Math.round(size * 0.12);
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '999px',
          background: CREST_BACKGROUND,
          border: `1px solid ${theme.border}`,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 auto',
        }}
      >
        <img
          src={club.crest_url}
          alt={club.name}
          title={club.name}
          width={size - padding * 2}
          height={size - padding * 2}
          style={{ objectFit: 'contain' }}
          onError={() => setImgFailed(true)}
        />
      </div>
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
