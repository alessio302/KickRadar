import { CLUB_KIT_COLORS } from './clubKitColors.js';

// Deterministic, muted per-club fallback color, generated from the club id
// -- used only when a club isn't in CLUB_KIT_COLORS (see that file's own
// comment on why real kit colors are keyed by name, not id). Same club
// always gets the same fallback color, no per-club list to maintain for
// the long tail this can't cover yet.
function hashInt(n) {
  // Simple integer hash (splitmix32-ish), avoids clustering for
  // consecutive ids.
  let x = n ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return (x ^ (x >>> 15)) >>> 0;
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// WCAG relative luminance -- picks readable (near-black or white) text
// against an arbitrary background color, since real kit primaries range
// from near-black (Juventus) to near-white (Real Madrid), unlike the old
// hash-generated colors which had their lightness fixed low specifically
// so white text always worked.
function textColorFor(hex) {
  const { r, g, b } = hexToRgb(hex);
  const [rl, gl, bl] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  return luminance > 0.5 ? '#15181D' : '#FFFFFF';
}

// Badge = primary kit color as the fill (with contrast-safe text) and the
// secondary kit color as a border ring -- conveys "this club is these two
// colors" without the legibility risk of literally splitting the badge
// background in half (a real Juventus-style vertical stripe would put
// white text over both black AND white halves at once).
export function clubBadgeColor(club) {
  const kit = club?.name ? CLUB_KIT_COLORS[club.name] : null;
  if (kit) {
    return { bg: kit.primary, border: kit.secondary, fg: textColorFor(kit.primary) };
  }
  const hue = hashInt(club?.id ?? 0) % 360;
  const bg = `hsl(${hue}, 45%, 36%)`;
  return { bg, border: bg, fg: '#FFFFFF' };
}
