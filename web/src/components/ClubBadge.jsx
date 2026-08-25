import { clubBadgeColor } from '../lib/clubColor.js';

export default function ClubBadge({ club, size = 24 }) {
  if (!club) return null;
  const { bg, border, fg } = clubBadgeColor(club);
  // Border (not a split background) carries the kit's second color -- puts
  // the short code on a single solid fill, so text contrast only ever has
  // to work against one color regardless of how light or dark either kit
  // color is (real primaries range from near-black to near-white, unlike
  // the old hash-generated fallback colors).
  const borderWidth = Math.max(1.5, size * 0.09);
  return (
    <div
      title={club.name}
      aria-label={club.name}
      style={{
        width: size,
        height: size,
        borderRadius: '6px',
        background: bg,
        border: `${borderWidth}px solid ${border}`,
        boxSizing: 'border-box',
        color: fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(9, size * 0.36),
        fontWeight: 800,
        flex: '0 0 auto',
        letterSpacing: '-0.02em',
      }}
    >
      {club.short_code}
    </div>
  );
}
