import { useRef, useState } from 'react';
import { Star } from 'lucide-react';
import ClubJersey from './ClubJersey.jsx';
import MatchScore from './MatchScore.jsx';

// Width of the revealed star action, and the drag distance past which
// releasing snaps the row open instead of springing back -- half the
// panel width feels right (has to be a deliberate swipe, not a stray
// touch-move), matching the kind of threshold iOS/Mail-style swipe
// actions use.
const PANEL_WIDTH = 72;
const OPEN_THRESHOLD = PANEL_WIDTH / 2;
// Below this total movement, a gesture counts as a tap, not a swipe --
// distinguishes "opening the fixture detail" from "the finger wobbled a
// few px while pressing".
const TAP_SLOP = 8;

export default function FixtureRow({ theme, t, locale, formatTime, clubsById, fixture, isFavorite, isOpen, onOpenRow, onCloseRow, onSelectFixture, onToggleFavorite }) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef(null);
  const directionRef = useRef(null); // 'horizontal' | 'vertical' | null while undecided

  const baseX = isOpen ? -PANEL_WIDTH : 0;

  const handlePointerDown = (e) => {
    startRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    directionRef.current = null;
    setDragging(true);
  };

  const handlePointerMove = (e) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;

    if (directionRef.current === null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; // not enough movement yet to tell
      directionRef.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      if (directionRef.current === 'horizontal') {
        e.currentTarget.setPointerCapture(startRef.current.pointerId);
      } else {
        // A vertical gesture is the list's own scroll -- hand it back to
        // the browser entirely rather than fighting it.
        startRef.current = null;
        setDragging(false);
        return;
      }
    }
    if (directionRef.current !== 'horizontal') return;

    const next = Math.min(0, Math.max(-PANEL_WIDTH, baseX + dx));
    setDragX(next);
  };

  const endGesture = (e) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const wasTap = directionRef.current !== 'horizontal' && Math.abs(dx) < TAP_SLOP;

    if (wasTap) {
      if (isOpen) onCloseRow();
      else onSelectFixture(fixture);
    } else if (directionRef.current === 'horizontal') {
      const finalX = Math.min(0, Math.max(-PANEL_WIDTH, baseX + dx));
      if (finalX <= -OPEN_THRESHOLD) onOpenRow();
      else onCloseRow();
    }

    startRef.current = null;
    directionRef.current = null;
    setDragging(false);
  };

  const handleStarClick = (e) => {
    e.stopPropagation();
    onToggleFavorite(fixture);
    onCloseRow();
  };

  const displayX = dragging && directionRef.current === 'horizontal' ? dragX : baseX;

  return (
    <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: `${PANEL_WIDTH}px`,
          background: theme.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <button
          onClick={handleStarClick}
          aria-label={isFavorite ? t.fixtures.unfavoriteAria : t.fixtures.favoriteAria}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            background: 'transparent',
            color: theme.accentText,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Star size={22} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        style={{
          position: 'relative',
          background: theme.surfaceRaised,
          padding: '10px 14px',
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          touchAction: 'pan-y',
          transform: `translateX(${displayX}px)`,
          transition: dragging ? 'none' : 'transform 0.2s ease',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 700, color: theme.accent, width: '40px', flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '3px' }}>
          {formatTime(fixture.kickoff_at, locale)}
          {isFavorite && <Star size={10} fill={theme.accent} color={theme.accent} />}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
          <ClubJersey club={clubsById.get(fixture.home_club_id)} size={20} theme={theme} />
          <span style={{ fontSize: '13px' }}>{clubsById.get(fixture.home_club_id)?.name}</span>
        </div>
        <MatchScore fixture={fixture} t={t} theme={theme} style={{ fontSize: '11px', color: theme.textMuted }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'flex-end' }}>
          <span style={{ fontSize: '13px' }}>{clubsById.get(fixture.away_club_id)?.name}</span>
          <ClubJersey club={clubsById.get(fixture.away_club_id)} size={20} theme={theme} />
        </div>
      </div>
    </div>
  );
}
