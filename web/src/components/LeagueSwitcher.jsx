import { LEAGUES } from '../lib/leagues.js';

// Fixed 5-column grid, not a scrolling row -- per explicit feedback, all
// five leagues need to sit fully in view with equal left/right margins
// instead of overflowing the screen edge (the previous horizontal-scroll
// version left the last badge/label cut off, which read as "everything is
// shifted right"). grid-template-columns is LEAGUES.length-driven rather
// than hardcoded to 5, but this is still a fixed layout tuned to fit
// exactly today's five leagues on one row -- a 6th league would need this
// reconsidered (narrower badges, or back to a scrolling row), not silently
// keep shrinking forever.
//
// No text label under the badge -- per explicit feedback, the logos are
// already legible enough to identify the league on their own, and dropping
// the label saves vertical space. The league name still exists for anyone
// who needs it as the button's title (hover tooltip) and the image's own
// alt text (screen readers), just not rendered as visible text.
const BADGE_SIZE = 56;
// Inset from the tile edge on every side, on top of object-fit: contain --
// not just cosmetic. Confirmed live: Bundesliga's and LaLiga's actual logo
// PNGs run their wordmark ("BUNDESLIGA", "Santander") close enough to
// their own image edges that with zero padding, the tile's rounded corners
// clipped the outermost letters at both bottom corners ("BUNDESLIGA" ->
// "UNDESLIG"), and LaLiga's text sat flush against the tile border with no
// breathing room ("Santander" read as cut off even where technically still
// rendered). Reproduced both failure patterns in an isolated test (a
// same-shape synthetic logo placed close to its own canvas edge) before
// and after adding this padding to confirm it actually fixes them, since
// this session's sandbox has no network access to load the real GOAL API
// logo CDN directly. A well-margined logo (Serie A, Premier League, Ligue
// 1) loses nothing from this padding; a tightly-cropped one gains the
// margin it was missing.
const BADGE_PADDING = 6;

// Contain, not cover: GOAL API's league logo assets are NOT all the same
// aspect ratio -- Bundesliga's and LaLiga's carry a wide wordmark alongside
// the crest, unlike Serie A/Premier League/Ligue 1's more square marks.
// object-fit: cover (tried first, per a FlashScore-style reference) forced
// every logo into a square crop and sliced text off those two -- confirmed
// live ("UNDESLIGA" missing its "B", LaLiga's "Santander" cut off).
// contain guarantees the whole logo is always visible, at the cost of a
// little letterboxing against the badge's own background on non-square
// logos -- a visible whole logo beats a cropped one.
//
// Fixed white badge background, not theme.surface: these are official
// third-party league logos, most already opaque white or a fixed brand
// colour (Bundesliga's is red) baked into the PNG itself, not artwork this
// app owns the palette of. Tinting the tile with the app's own accent
// fought that -- forced a dark violet/green sliver to show in any
// letterboxed margin around a non-square logo, on top of the corner bug
// below. A fixed white tile is what every one of these logos was actually
// designed to sit on (also matches the FlashScore-style reference), and
// reads as deliberate on both the light and dark theme.
//
// overflow: hidden is required here, not optional -- confirmed live: an
// <img> is a plain rectangle and does not inherit its parent's
// border-radius on its own, so without this the image's square corners
// showed past the tile's rounded corners as small hard-edged slivers
// instead of a clean rounded tile. Radius is deliberately modest (10px on
// a 56px tile, not a heavier squircle) so that combined with
// BADGE_PADDING, the rounded corners only ever cut into the padding, never
// into actual logo content.
// The badge background above is fixed white regardless of theme (see that
// comment), so the active ring sits between two different backgrounds at
// once: the tile's own fixed-white fill on the inside, and theme.bg (which
// itself flips between white and black across light/dark mode) on the
// outside. A saturated accent colour (terracotta/violet/green) is distinct
// enough from both white and black to read as a clear ring against either,
// so a single border in theme.accent already works there.
//
// Mono has no hue to fall back on -- its accent IS white in dark mode and
// black in light mode, i.e. always one of the two colours already in play.
// A plain border in that colour merges into whichever side happens to
// match: confirmed live twice -- white blended into the tile's own white
// fill (the tile just looked like it had grown a little, no visible ring),
// and switching to black instead merely moved the same problem to dark
// mode's black page background (the ring vanished there instead, this time
// reading as no active indicator at all, worse than before since inactive
// tiles' grey border was still faintly visible next to it).
//
// Fixed with a genuine two-colour ring: a black inner border (always
// visible against the tile's own constant white fill, in both themes) plus
// a white outer ring via box-shadow, added ONLY in dark mode where theme.bg
// is black and would otherwise swallow that black border. In light mode
// theme.bg is white, so the black border already contrasts against the
// page directly and the extra ring is skipped (adding a white-on-white
// outer ring there would do nothing anyway).
function isMonoAccent(theme) {
  const c = theme.accent.toUpperCase();
  return c === '#FFFFFF' || c === '#000000';
}
function activeBadgeStyle(theme) {
  if (!isMonoAccent(theme)) {
    return { border: `2px solid ${theme.accent}`, boxShadow: 'none' };
  }
  return {
    border: '2px solid #000000',
    boxShadow: theme.isDark ? '0 0 0 2px #FFFFFF' : 'none',
  };
}

export default function LeagueSwitcher({ league, onSelectLeague, theme }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${LEAGUES.length}, 1fr)`,
        gap: '6px',
        padding: '2px 0 12px',
      }}
    >
      {LEAGUES.map((l) => {
        const active = league === l.slug;
        return (
          <button
            key={l.slug}
            onClick={() => onSelectLeague(l.slug)}
            title={l.label}
            style={{
              minWidth: 0,
              display: 'flex',
              background: 'none',
              border: 'none',
              padding: 0,
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: `${BADGE_SIZE}px`,
                height: `${BADGE_SIZE}px`,
                borderRadius: '10px',
                background: '#FFFFFF',
                boxSizing: 'border-box',
                overflow: 'hidden',
                padding: `${BADGE_PADDING}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                ...(active ? activeBadgeStyle(theme) : { border: `2px solid ${theme.border}`, boxShadow: 'none' }),
              }}
            >
              <img src={l.logo} alt={l.label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
