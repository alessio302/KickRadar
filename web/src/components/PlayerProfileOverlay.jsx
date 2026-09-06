import { useRef, useState } from 'react';

// Same bottom-sheet chrome/drag-to-dismiss mechanics as
// TransferSummaryOverlay.jsx/FixtureDetailOverlay.jsx -- kept as a third
// copy rather than a shared wrapper for the same reason TransferSummaryOverlay
// gives: the three overlays' internal layouts don't share enough beyond
// "rounded sheet that slides up from the bottom" to be worth forcing into
// one component.
const DISMISS_THRESHOLD_PX = 100;

// player.season_goals/assists/yellow_cards/red_cards come from
// syncPlayerSeasonStats.js's own match_events aggregation, not GOAL API's
// player.stats snapshot -- that snapshot carries no season identifier at
// all (see formatStatsDate's own comment below) and used to show a wall of
// stat categories with no way to tell whether any of them belonged to the
// current season. Only these four survive here on purpose: every scoring/
// carding match_event is tied to a fixture_id, and fixtures are only ever
// synced for the current season, so these counts are provably
// current-season, exact, not an estimate. Every other GOAL-API-only
// category (minutes, rating, shots, passes, tackles, ...) has no
// season-clean source at all and was removed rather than shown next to
// reliable numbers with no way for someone looking at the profile to tell
// the two apart.
const STAT_FIELDS = ['season_goals', 'season_assists', 'season_yellow_cards', 'season_red_cards'];
const STAT_LABEL_KEYS = {
  season_goals: 'goals',
  season_assists: 'assists',
  season_yellow_cards: 'yellowCards',
  season_red_cards: 'redCards',
};

function calculateAge(birthdate) {
  if (!birthdate) return null;
  const dob = new Date(birthdate);
  if (Number.isNaN(dob.getTime())) return null;
  const ageMs = Date.now() - dob.getTime();
  return Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));
}

// player.season_stats_updated_at is syncPlayerSeasonStats.js's own
// aggregation timestamp -- when this ran last, not when the underlying
// numbers last changed, but unlike GOAL API's undated snapshot this is at
// least honest about being current-season data (the aggregation only ever
// reads from fixtures/match_events, which never contain a past season).
function formatStatsDate(iso, locale) {
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function PlayerProfileOverlay({ theme, t, player, locale, onClose, loading }) {
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

  // null (not 0) means syncPlayerSeasonStats.js couldn't attribute this
  // stat to the player at all (not yet synced, or a same-club surname
  // collision it deliberately left unresolved -- see that file's own
  // comment) -- an explicit 0 is a verified fact and stays shown.
  const statRows = STAT_FIELDS.filter((key) => player[key] != null);
  const hasStats = statRows.length > 0;

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
          // Fixed, not maxHeight -- confirmed live (FixtureDetailOverlay.jsx
          // had the exact same complaint first) that a content-driven height
          // visibly resizes the sheet depending on how many of the (0-4)
          // season stats a given player actually has. Fixed height keeps
          // every profile opening at the same size regardless.
          height: '82vh',
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
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '4px' }}>
                <p style={{ fontSize: '17px', fontWeight: 800, margin: 0, lineHeight: 1.25 }}>{player.name}</p>
                {player.squad_number && <span style={{ fontSize: '13px', fontWeight: 700, color: theme.textMuted }}>#{player.squad_number}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: theme.textMuted, flexWrap: 'wrap' }}>
                {positionLabel && <span>{positionLabel}</span>}
                {positionLabel && age != null && <span>·</span>}
                {age != null && <span>{t.playerProfile.age(age)}</span>}
                {player.injured && (
                  <span style={{ fontSize: '10px', fontWeight: 700, color: theme.danger, border: `1px solid ${theme.danger}`, borderRadius: '999px', padding: '1px 7px' }}>
                    {t.playerProfile.injured}
                  </span>
                )}
              </div>
              {player.current_club_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                  {player.current_club_badge && (
                    <img src={player.current_club_badge} alt="" style={{ width: '16px', height: '16px', objectFit: 'contain', flexShrink: 0 }} />
                  )}
                  <span style={{ fontSize: '12.5px', color: theme.textMuted }}>{player.current_club_name}</span>
                </div>
              )}
              {player.nationality_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                  {player.nationality_badge && (
                    <img src={player.nationality_badge} alt="" style={{ width: '16px', height: '16px', objectFit: 'contain', flexShrink: 0 }} />
                  )}
                  <span style={{ fontSize: '12.5px', color: theme.textMuted }}>{player.nationality_name}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 18px 18px', borderTop: `1px solid ${theme.border}` }}>
          {!loading && hasStats && player.season_stats_updated_at && (
            <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: theme.textMuted, margin: '0 0 10px' }}>
              {t.playerProfile.statsAsOf(formatStatsDate(player.season_stats_updated_at, locale))}
            </p>
          )}
          {loading ? (
            <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.common.loading}</p>
          ) : !hasStats ? (
            <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.playerProfile.noStats}</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {statRows.map((key) => (
                <div key={key} style={{ background: theme.surfaceRaised, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '10px 12px' }}>
                  <p style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 2px' }}>{player[key]}</p>
                  <p style={{ fontSize: '11px', color: theme.textMuted, margin: 0 }}>{t.playerProfile[STAT_LABEL_KEYS[key]]}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
