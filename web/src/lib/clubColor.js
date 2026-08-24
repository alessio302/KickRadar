// Deterministic, muted per-club badge color, generated from the club id --
// same club always gets the same color, no per-club color list to maintain
// (the original prototype hand-picked a color per club, which doesn't scale
// to a real, API-sourced list of ~20 clubs per league). White text reads
// fine against every generated background since lightness is fixed low.
function hashInt(n) {
  // Simple integer hash (splitmix32-ish), avoids clustering for
  // consecutive ids.
  let x = n ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return (x ^ (x >>> 15)) >>> 0;
}

export function clubBadgeColor(clubId) {
  const hue = hashInt(clubId) % 360;
  return { bg: `hsl(${hue}, 45%, 36%)`, fg: '#FFFFFF' };
}
