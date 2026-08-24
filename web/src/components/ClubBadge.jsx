import { clubBadgeColor } from '../lib/clubColor.js';

export default function ClubBadge({ club, size = 24 }) {
  if (!club) return null;
  const { bg, fg } = clubBadgeColor(club.id);
  return (
    <div
      title={club.name}
      aria-label={club.name}
      style={{
        width: size,
        height: size,
        borderRadius: '6px',
        background: bg,
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
