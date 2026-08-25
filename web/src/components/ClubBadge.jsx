import { clubBadgeColor } from '../lib/clubColor.js';
import { clubShortCode } from '../lib/clubShortCodes.js';

export default function ClubBadge({ club, size = 24 }) {
  if (!club) return null;
  const { bg, border, fg } = clubBadgeColor(club);
  const code = clubShortCode(club);
  // Border (not a split background) carries the kit's second color -- puts
  // the short code on a single solid fill, so text contrast only ever has
  // to work against one color regardless of how light or dark either kit
  // color is (real primaries range from near-black to near-white, unlike
  // the old hash-generated fallback colors).
  const borderWidth = Math.max(1.5, size * 0.09);
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
        background: bg,
        border: `${borderWidth}px solid ${border}`,
        boxSizing: 'border-box',
        color: fg,
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
