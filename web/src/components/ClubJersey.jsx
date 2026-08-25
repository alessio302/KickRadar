import { useId } from 'react';
import { clubBadgeColor } from '../lib/clubColor.js';

// Lucide's own "shirt" icon path (see
// node_modules/lucide-react/dist/esm/icons/shirt.mjs) -- reused as-is
// rather than hand-drawn, split into two vertically-clipped halves colored
// with the club's real home-kit colors (lib/clubKitColors.js) instead of
// Lucide's usual single-color stroke rendering. For clubs without a
// curated kit color, clubBadgeColor()'s hash fallback returns the same
// color for both bg/border, so the jersey just renders as one solid
// generated color instead of a two-tone split -- graceful, not broken.
//
// Used wherever the club's name is already shown as text right next to
// it (Fixtures, the fixture detail overlay, Settings' quick-filter list,
// the quick-filter remove-confirm dialog) -- a decorative color cue, not
// an identifier, since the name already does that job. ClubBadge.jsx (the
// flat, neutral, code-only badge) is for the opposite case: quick-filter
// chips, where there's no adjacent name and the badge itself has to
// carry identification -- confirmed live that coloring those per-club
// read as cluttered/unprofessional next to short, unlabeled codes.
const SHIRT_PATH =
  'M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z';

export default function ClubJersey({ club, size = 24, theme }) {
  const clipId = useId();
  if (!club) return null;
  const { bg: primary, border: secondary } = clubBadgeColor(club);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={club.name}
      style={{ flex: '0 0 auto' }}
    >
      <title>{club.name}</title>
      <defs>
        <clipPath id={clipId}>
          <path d={SHIRT_PATH} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="0" width="12" height="24" fill={primary} />
        <rect x="12" y="0" width="12" height="24" fill={secondary} />
      </g>
      {/* Thin outline for definition regardless of theme/jersey color --
          without it, light kits (Real Madrid white, Leeds white) all but
          disappear against a light theme background. */}
      <path d={SHIRT_PATH} fill="none" stroke={theme.border} strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}
