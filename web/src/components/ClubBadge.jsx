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
  // Most codes are 3 chars, sized for that; a couple of overrides (see
  // clubShortCodes.js -- "ESTAC" is the only current one) run longer and
  // would overflow a 3-char-tuned font size, so scale down past 3 chars
  // instead of letting text spill out of the badge.
  const fontSize = Math.max(7, (size * 0.36) * Math.min(1, 3 / (code?.length ?? 3)));
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
        fontSize,
        fontWeight: 800,
        flex: '0 0 auto',
        letterSpacing: '-0.02em',
      }}
    >
      {code}
    </div>
  );
}
