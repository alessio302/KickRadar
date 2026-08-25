import { useState } from 'react';
import { X, Users } from 'lucide-react';
import ClubBadge from './ClubBadge.jsx';
import { useLineups } from '../hooks/useLineups.js';

function formatKickoff(iso) {
  return new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Highlightly's real per-player shape isn't confirmed yet (every match
// checked during the source evaluation was too far out for lineups to be
// populated) -- stay defensive about the field name until a real payload
// is seen.
function playerLabel(p) {
  return p.name || p.player?.name || p.playerName || JSON.stringify(p);
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
  const starters = players.initialLineup || players.starters || [];
  const subs = players.substitutes || [];

  return (
    <div style={{ padding: '4px 16px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '8px 0 12px' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {row.confirmed ? 'Offizielle Aufstellung' : 'Voraussichtliche Aufstellung'}
        </span>
        {row.formation && row.formation !== 'Unknown' && (
          <span style={{ fontSize: '12px', fontWeight: 700, color: theme.accent }}>{row.formation}</span>
        )}
      </div>

      {starters.length === 0 ? (
        <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>Noch keine Spieler gemeldet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: subs.length ? '16px' : 0 }}>
          {starters.map((p, i) => (
            <div key={i} style={{ fontSize: '14px' }}>{playerLabel(p)}</div>
          ))}
        </div>
      )}

      {subs.length > 0 && (
        <>
          <p style={{ fontSize: '11px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px' }}>
            Ersatzbank
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {subs.map((p, i) => (
              <div key={i} style={{ fontSize: '13px', color: theme.textMuted }}>{playerLabel(p)}</div>
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

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
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
        }}
      >
        <div style={{ flexShrink: 0, padding: '14px 16px 10px', borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
            <button
              onClick={onClose}
              aria-label="Schließen"
              style={{ border: 'none', background: 'transparent', color: theme.textMuted, cursor: 'pointer', padding: '4px' }}
            >
              <X size={18} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '4px' }}>
            <ClubBadge club={homeClub} size={22} />
            <span style={{ fontSize: '14px', fontWeight: 700 }}>
              {fixture.status === 'finished' ? `${fixture.home_score} : ${fixture.away_score}` : 'vs'}
            </span>
            <ClubBadge club={awayClub} size={22} />
          </div>
          <p style={{ fontSize: '12px', color: theme.textMuted, textAlign: 'center', margin: '0 0 12px' }}>{formatKickoff(fixture.kickoff_at)}</p>

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
