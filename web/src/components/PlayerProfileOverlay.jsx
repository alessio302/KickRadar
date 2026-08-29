import { useRef, useState } from 'react';

// Same bottom-sheet chrome/drag-to-dismiss mechanics as
// TransferSummaryOverlay.jsx/FixtureDetailOverlay.jsx -- kept as a third
// copy rather than a shared wrapper for the same reason TransferSummaryOverlay
// gives: the three overlays' internal layouts don't share enough beyond
// "rounded sheet that slides up from the bottom" to be worth forcing into
// one component.
const DISMISS_THRESHOLD_PX = 100;

// player.stats is a snapshot from whenever this player was first resolved
// (src/news/playerProfileResolver.js), not refreshed later -- same
// accepted tradeoff the old transfermarkt_url cache already had. Only
// shows the fields that are actually present; GOAL API's own coverage
// leaves many stat fields null depending on the player/competition.
const STAT_ROWS = ['matchPlayed', 'goals', 'assists', 'yellowCards', 'redCards', 'rating', 'minutes'];

function calculateAge(birthdate) {
  if (!birthdate) return null;
  const dob = new Date(birthdate);
  if (Number.isNaN(dob.getTime())) return null;
  const ageMs = Date.now() - dob.getTime();
  return Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));
}

export default function PlayerProfileOverlay({ theme, t, player, onClose }) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef(null);

  const handlePointerDown = (e) => {
    dragStartY.current = e.clientY;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e) => {
    if (dragStartY.current == null) return;
    const delta = e.clientY - dragStartY.current;
    if (delta > 0) setDragY(delta);
  };
  const handlePointerUp = () => {
    if (dragY > DISMISS_THRESHOLD_PX) onClose();
    else setDragY(0);
    setDragging(false);
    dragStartY.current = null;
  };

  const age = calculateAge(player.birthdate);
  const positionLabel = player.position ? t.lineup.positions[player.position] || player.position : null;
  const stats = player.stats || {};
  const statRows = STAT_ROWS.filter((key) => stats[key] != null);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: `rgba(0,0,0,${0.5 * Math.max(0, 1 - dragY / 400)})`,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.bg,
          width: '100%',
          maxWidth: '420px',
          maxHeight: '82vh',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: 'env(safe-area-inset-bottom)',
          transform: `translateY(${dragY}px)`,
          transition: dragging ? 'none' : 'transform 0.2s ease',
        }}
      >
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ flexShrink: 0, padding: '10px 18px 14px', cursor: 'grab', touchAction: 'none' }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
            <div style={{ width: '36px', height: '4px', borderRadius: '999px', background: theme.border }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {player.photo_url ? (
              <img
                src={player.photo_url}
                alt=""
                style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: theme.surfaceRaised }}
              />
            ) : (
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: theme.surfaceRaised, flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 4px', lineHeight: 1.25 }}>{player.name}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: theme.textMuted, flexWrap: 'wrap' }}>
                {positionLabel && <span>{positionLabel}</span>}
                {positionLabel && age != null && <span>·</span>}
                {age != null && <span>{t.playerProfile.age(age)}</span>}
              </div>
              {player.current_club_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                  {player.current_club_badge && (
                    <img src={player.current_club_badge} alt="" style={{ width: '16px', height: '16px', objectFit: 'contain', flexShrink: 0 }} />
                  )}
                  <span style={{ fontSize: '12.5px', color: theme.textMuted }}>{player.current_club_name}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 18px 18px', borderTop: `1px solid ${theme.border}` }}>
          {statRows.length === 0 ? (
            <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.playerProfile.noStats}</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {statRows.map((key) => (
                <div key={key} style={{ background: theme.surfaceRaised, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '10px 12px' }}>
                  <p style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 2px' }}>{stats[key]}</p>
                  <p style={{ fontSize: '11px', color: theme.textMuted, margin: 0 }}>{t.playerProfile[key]}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
