import { useId } from 'react';
import { CLUB_KIT_COLORS } from '../lib/clubKitColors.js';

const SHIRT_PATH =
  'M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z';

// Renders the actual real-kit pattern inside the shirt clip, not just a
// flat fill -- confirmed via feedback that a uniform primary/secondary
// split looked "billig und nicht korrekt" regardless of the club, since
// e.g. Real Madrid (plain white) and Inter (black+blue vertical stripes)
// both have "2 colors" but look nothing alike on the actual shirt. See
// clubKitColors.js for the per-club pattern classification and its
// research notes.
function KitFill({ pattern, primary, secondary }) {
  switch (pattern) {
    case 'stripes': {
      // Odd count so the body starts and ends on the primary color, like
      // the real Juventus/Inter/Athletic Club shirts -- a plain 2-stripe
      // half-split was exactly the "billig" look being replaced.
      const STRIPES = 5;
      const w = 24 / STRIPES;
      return (
        <>
          {Array.from({ length: STRIPES }, (_, i) => (
            <rect key={i} x={i * w} y="0" width={w} height="24" fill={i % 2 === 0 ? primary : secondary} />
          ))}
        </>
      );
    }
    case 'hoops': {
      const HOOPS = 5;
      const h = 24 / HOOPS;
      return (
        <>
          {Array.from({ length: HOOPS }, (_, i) => (
            <rect key={i} x="0" y={i * h} width="24" height={h} fill={i % 2 === 0 ? primary : secondary} />
          ))}
        </>
      );
    }
    case 'sash':
      // Diagonal band from the lower-left to the upper-right, like the
      // real Monaco/Rayo Vallecano shirts (a sash draped over one
      // shoulder), not a straight 50/50 split.
      return (
        <>
          <rect x="0" y="0" width="24" height="24" fill={primary} />
          <line x1="-4" y1="29" x2="29" y2="-4" stroke={secondary} strokeWidth="9" />
        </>
      );
    case 'band':
      // Single vertical stripe down the center, like PSG's real shirt.
      return (
        <>
          <rect x="0" y="0" width="24" height="24" fill={primary} />
          <rect x="9.5" y="0" width="5" height="24" fill={secondary} />
        </>
      );
    case 'chestband':
      // Horizontal secondary band across the chest, like VfB Stuttgart's
      // red "Brustring" on white -- a century-old identity element, not a
      // stripe or sash shape.
      return (
        <>
          <rect x="0" y="0" width="24" height="24" fill={primary} />
          <rect x="0" y="9" width="24" height="5" fill={secondary} />
        </>
      );
    case 'cross':
      // A black cross on white, like Parma's "Maglia Crociata" -- the
      // club's defining shirt identity since 1913, not a stripe or sash.
      return (
        <>
          <rect x="0" y="0" width="24" height="24" fill={primary} />
          <rect x="9.5" y="0" width="5" height="24" fill={secondary} />
          <rect x="0" y="9.5" width="24" height="5" fill={secondary} />
        </>
      );
    case 'quarters':
      // Diagonally-alternating quadrants, like Cagliari's real shirt.
      return (
        <>
          <rect x="0" y="0" width="12" height="12" fill={primary} />
          <rect x="12" y="0" width="12" height="12" fill={secondary} />
          <rect x="0" y="12" width="12" height="12" fill={secondary} />
          <rect x="12" y="12" width="12" height="12" fill={primary} />
        </>
      );
    case 'solid':
    default:
      return <rect x="0" y="0" width="24" height="24" fill={primary} />;
  }
}

export default function ClubJersey({ club, size = 24, theme }) {
  const clipId = useId();
  if (!club) return null;
  const kit = CLUB_KIT_COLORS[club.name];
  const primary = kit?.primary ?? theme.border;
  const secondary = kit?.secondary ?? theme.border;
  const pattern = kit?.pattern ?? 'solid';

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={club.name} style={{ flex: '0 0 auto' }}>
      <title>{club.name}</title>
      <defs>
        <clipPath id={clipId}>
          <path d={SHIRT_PATH} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <KitFill pattern={pattern} primary={primary} secondary={secondary} />
      </g>
      <path d={SHIRT_PATH} fill="none" stroke={theme.border} strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}
