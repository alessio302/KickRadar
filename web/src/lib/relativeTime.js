// Shared by TransfersTab.jsx's cards and TransferSummaryOverlay.jsx's
// header -- both need to show "how long ago" for the same transfer, and
// duplicating this per-component invites the two silently drifting apart.
export function relativeTime(iso, t) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return t.transfers.justNow;
  if (mins < 60) return t.transfers.minutesAgo(mins);
  const hours = Math.round(mins / 60);
  if (hours < 24) return t.transfers.hoursAgo(hours);
  const days = Math.round(hours / 24);
  return t.transfers.daysAgo(days);
}
