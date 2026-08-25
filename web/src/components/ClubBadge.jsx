import { clubShortCode } from '../lib/clubShortCodes.js';

// Flat, theme-neutral badge -- no per-club color. Used only where there's
// no adjacent club-name text (quick-filter chips): confirmed live that
// coloring every chip per-club, next to short unlabeled codes, read as
// cluttered rather than helpful. See ClubJersey.jsx for the colored
// treatment used everywhere the name is already shown as text.
export default function ClubBadge({ club, size = 24, theme }) {
  if (!club) return null;
  const code = clubShortCode(club);
  // Almost every code is 3 chars, and the badge is a fixed square sized
  // for that. Confirmed live: shrinking the font to fit a longer code
  // (e.g. "ESTAC", the one current override that isn't 3 chars, see
  // clubShortCodes.js) into that same square either overflows it or
  // shrinks past legibility -- there's no font size that fits 5 characters
  // in a ~20-24px square and still reads. Past 3 chars, let the badge
  // widen into a short pill instead of forcing the square; every
  // ClubBadge call site is inside a flex row (never a fixed-size grid
  // cell), so a wider badge here doesn't break any layout.
  const isLong = (code?.length ?? 0) > 3;
  const fontSize = isLong ? Math.max(8, size * 0.3) : Math.max(9, size * 0.36);
  return (
    <div
      title={club.name}
      aria-label={club.name}
      style={{
        width: isLong ? 'auto' : size,
        minWidth: isLong ? size : undefined,
        height: size,
        padding: isLong ? '0 4px' : 0,
        borderRadius: '6px',
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        boxSizing: 'border-box',
        color: theme.textMuted,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize,
        fontWeight: 800,
        flex: '0 0 auto',
        letterSpacing: '-0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {code}
    </div>
  );
}
