import { useRef, useState } from 'react';
import { Users } from 'lucide-react';
import ClubBadge from './ClubBadge.jsx';
import { useLineups } from '../hooks/useLineups.js';

// Drag distance past which releasing counts as "dismiss" rather than
// "snap back" -- matches the rough feel of native bottom sheets (iOS
// Maps, most drawer libraries) without pulling in a gesture library for
// one interaction.
const DISMISS_THRESHOLD_PX = 100;

function formatKickoff(iso) {
  return new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Confirmed live against a real populated Highlightly response (Kazakhstan
// Premier League, FK Tobol Kostanay vs Kaisar, 2026-08-25): initialLineup
// is an array of arrays -- one per formation row (GK, then each tactical
// line) -- not a flat list, and each player is { name, number, position,
// id }. substitutes is a flat array of the same player shape.
const POSITION_LABELS = {
  Goalkeeper: 'Torwart',
  Defender: 'Verteidiger',
  Midfielder: 'Mittelfeld',
  Forward: 'Sturm',
};

function playerLabel(p) {
  const pos = POSITION_LABELS[p.position] || p.position;
  return (
    <>
      <span style={{ color: 'inherit', opacity: 0.6, marginRight: '8px' }}>{p.number ?? '–'}</span>
      {p.name}
      {pos && <span style={{ opacity: 0.6 }}> · {pos}</span>}
    </>
  );
}

// initialLineup's own row grouping (GK, then each tactical line, forwards
// last) already *is* a formation layout -- one horizontal rank per row,
// top to bottom -- so no separate formation-string parsing is needed to
// place players.
//
// A real pitch is 105 x 68m; a half (halfway line to goal line) is
// 52.5 x 68m -- wider than tall, which is why this stays compact instead
// of stacking ranks at a generous fixed height. But a literal
// `aspectRatio` CSS property combined with `overflow: hidden` clips
// silently once content needs more room than the ratio provides --
// confirmed live: a 5-rank formation (4-2-3-1's GK/DF/DM/AM/FW split)
// lost its entire forward line, cropped out with no visual warning.
// minHeight scaled to the actual rank count guarantees every rank fits
// while staying close to the real proportions for the common 4-rank case.
function PitchFormation({ formation, rows }) {
  return (
    <div
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        overflow: 'hidden',
        borderRadius: '14px',
        background: 'linear-gradient(180deg, #1e6b3a, #164d2a)',
        padding: '30px 6px 10px',
        minHeight: `${Math.max(4, rows.length) * 44 + 40}px`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {formation && (
        <span
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            fontSize: '11px',
            fontWeight: 700,
            color: '#fff',
            background: 'rgba(0,0,0,0.35)',
            padding: '3px 8px',
            borderRadius: '999px',
          }}
        >
          {formation}
        </span>
      )}

      {/* Own penalty area, open at the field boundary (top edge) -- real
          proportions are ~40.3m wide x 16.5m deep out of a 68 x 52.5m half. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '58%',
          height: '27%',
          border: '1.5px solid rgba(255,255,255,0.32)',
          borderTop: 'none',
          borderBottomLeftRadius: '4px',
          borderBottomRightRadius: '4px',
        }}
      />
      {/* Halfway line + center-circle arc, both clipped by the container
          edge -- this is a half-pitch view, the other half is off-screen. */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, borderBottom: '1.5px solid rgba(255,255,255,0.32)' }} />
      <div
        style={{
          position: 'absolute',
          bottom: '-46px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '92px',
          height: '92px',
          borderRadius: '50%',
          border: '1.5px solid rgba(255,255,255,0.32)',
        }}
      />

      <div
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        {rows.map((rank, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-evenly' }}>
            {rank.map((p) => (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '54px' }}>
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.94)',
                    color: '#15181D',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {p.number ?? '–'}
                </div>
                <span
                  style={{
                    fontSize: '9px',
                    color: '#fff',
                    textAlign: 'center',
                    marginTop: '2px',
                    lineHeight: 1.1,
                    textShadow: '0 1px 3px rgba(0,0,0,0.7)',
                  }}
                >
                  {p.name}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function LineupList({ theme, row }) {
  if (!row) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center' }}>
        <Users size={22} style={{ color: theme.textMuted, marginBottom: '8px' }} />
        <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>
          Aufstellung noch nicht bekannt. Wird veröffentlicht, sobald die Vereine sie bestätigen (meist 30–60 Min vor Anpfiff).
        </p>
      </div>
    );
  }

  const players = row.players || {};
  const rows = players.initialLineup || [];
  const subs = players.substitutes || [];

  return (
    <div style={{ padding: '4px 16px 16px' }}>
      <p style={{ fontSize: '12px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '8px 0 10px' }}>
        {row.confirmed ? 'Offizielle Aufstellung' : 'Voraussichtliche Aufstellung'}
      </p>

      {rows.length === 0 ? (
        <p style={{ fontSize: '13px', color: theme.textMuted, margin: '0 0 16px' }}>Noch keine Spieler gemeldet.</p>
      ) : (
        <div style={{ marginBottom: subs.length ? '16px' : 0 }}>
          <PitchFormation formation={row.formation} rows={rows} />
        </div>
      )}

      {subs.length > 0 && (
        <>
          <p style={{ fontSize: '11px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px' }}>
            Ersatzbank
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {subs.map((p) => (
              <div key={p.id} style={{ fontSize: '13px', color: theme.textMuted }}>{playerLabel(p)}</div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function FixtureDetailOverlay({ theme, fixture, homeClub, awayClub, onClose }) {
  const [side, setSide] = useState('home');
  const { byClubId } = useLineups(fixture.id);

  const activeClub = side === 'home' ? homeClub : awayClub;
  const activeRow = activeClub ? byClubId.get(activeClub.id) : null;

  // Pointer capture (not window listeners) so move/up events keep routing
  // to the handle even once the finger/cursor drifts off it -- avoids an
  // effect just to attach/detach window-level handlers for one gesture.
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
    if (dragY > DISMISS_THRESHOLD_PX) {
      onClose();
    } else {
      setDragY(0);
    }
    setDragging(false);
    dragStartY.current = null;
  };

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
        <div style={{ flexShrink: 0, padding: '10px 16px 10px', borderBottom: `1px solid ${theme.border}` }}>
          {/* Only the handle + match info is a drag target -- the toggle
              buttons below need normal click/tap handling, and a pointerdown
              there capturing into this handler would fight that. */}
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ cursor: 'grab', touchAction: 'none' }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
              <div style={{ width: '36px', height: '4px', borderRadius: '999px', background: theme.border }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '4px' }}>
              <ClubBadge club={homeClub} size={22} />
              <span style={{ fontSize: '14px', fontWeight: 700 }}>
                {fixture.status === 'finished' ? `${fixture.home_score} : ${fixture.away_score}` : 'vs'}
              </span>
              <ClubBadge club={awayClub} size={22} />
            </div>
            <p style={{ fontSize: '12px', color: theme.textMuted, textAlign: 'center', margin: '0 0 12px' }}>{formatKickoff(fixture.kickoff_at)}</p>
          </div>

          <div style={{ display: 'flex', background: theme.surface, borderRadius: '10px', padding: '3px', border: `1px solid ${theme.border}` }}>
            {[['home', homeClub], ['away', awayClub]].map(([key, club]) => (
              <button
                key={key}
                onClick={() => setSide(key)}
                style={{
                  flex: 1,
                  padding: '8px',
                  fontSize: '13px',
                  fontWeight: side === key ? 700 : 600,
                  borderRadius: '7px',
                  border: 'none',
                  cursor: 'pointer',
                  background: side === key ? theme.surfaceRaised : 'transparent',
                  color: side === key ? theme.text : theme.textMuted,
                }}
              >
                {club?.name ?? '–'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <LineupList theme={theme} row={activeRow} />
        </div>
      </div>
    </div>
  );
}
