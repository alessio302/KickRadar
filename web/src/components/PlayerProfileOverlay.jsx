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
//
// Grouped into tabs by football content (summary/attack/defense/
// discipline), same underline-tab pattern FixtureDetailOverlay.jsx
// already uses for Aufstellungen/Spielinfo/Statistiken -- a flat list of
// 14 numbers read as a wall once passing and defensive stats joined the
// original 7, the same way that overlay's own event list needed lineups
// split out once it grew.
const STAT_GROUPS = [
  { key: 'overview', labelKey: 'tabOverview', fields: ['matchPlayed', 'minutes', 'rating'] },
  { key: 'attack', labelKey: 'tabAttack', fields: ['goals', 'assists', 'shotsTotal', 'passes', 'keyPasses', 'dribbleSucc'] },
  { key: 'defense', labelKey: 'tabDefense', fields: ['tackles', 'interceptions', 'duelsWon'] },
  { key: 'discipline', labelKey: 'tabDiscipline', fields: ['yellowCards', 'redCards'] },
];

function calculateAge(birthdate) {
  if (!birthdate) return null;
  const dob = new Date(birthdate);
  if (Number.isNaN(dob.getTime())) return null;
  const ageMs = Date.now() - dob.getTime();
  return Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));
}

// GOAL API's player profile carries no season identifier at all (confirmed
// live, including checking its statistics[] field -- empty for every
// player sampled) -- these stat fields are just whatever GOAL API most
// recently had on file, which for an inactive player (long-term injury,
// no minutes since) can silently be many months stale with nothing in the
// response to reveal that. A guessed "Saison 2026/27" label used to be
// shown here regardless -- confirmed live wrong for a player who hadn't
// played since before the season even started.
//
// player.goal_api_updated_at (GOAL API's own `updatedAt`) is the real
// freshness signal, NOT player.stats_refreshed_at -- confirmed live those
// two disagree: stats_refreshed_at is stamped to now() by
// refreshPlayerProfiles.js on every successful poll regardless of whether
// GOAL API actually recomputed anything, so a first attempt at this fix
// showed "Stand: <today>" for a player whose underlying numbers hadn't
// moved since two months earlier. No fallback to stats_refreshed_at here
// on purpose -- showing our own poll time as a freshness date is exactly
// the bug just described, so a player without goal_api_updated_at (not
// yet backfilled, or GOAL API omitted it) shows no date at all rather
// than a misleading one.
function formatStatsDate(iso, locale) {
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function PlayerProfileOverlay({ theme, t, player, locale, onClose }) {
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

  const groups = STAT_GROUPS.map((group) => ({ ...group, rows: group.fields.filter((key) => stats[key] != null) })).filter(
    (group) => group.rows.length > 0
  );
  const hasStats = groups.length > 0;
  // A lone populated group (a sparse profile, e.g. only overview numbers on
  // file) shows its grid directly -- a one-tab bar would just be a label
  // with nothing to switch to.
  const showTabs = groups.length > 1;
  const [statTab, setStatTab] = useState(groups[0]?.key);
  const activeGroup = groups.find((g) => g.key === statTab) ?? groups[0];

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
          // visibly resizes the sheet on every tab switch, since Übersicht's
          // 3 stats and Angriff's 6 don't fill the same space. Fixed height
          // keeps every tab landing in the same place regardless of how many
          // rows it has.
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
          {hasStats && player.goal_api_updated_at && (
            <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: theme.textMuted, margin: '0 0 10px' }}>
              {t.playerProfile.statsAsOf(formatStatsDate(player.goal_api_updated_at, locale))}
            </p>
          )}
          {showTabs && (
            <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', borderBottom: `1px solid ${theme.border}` }}>
              {groups.map((group) => (
                <button
                  key={group.key}
                  onClick={() => setStatTab(group.key)}
                  style={{
                    padding: '2px 2px 8px',
                    fontSize: '13px',
                    fontWeight: activeGroup.key === group.key ? 700 : 600,
                    border: 'none',
                    borderBottom: activeGroup.key === group.key ? `2px solid ${theme.accent}` : '2px solid transparent',
                    background: 'transparent',
                    color: activeGroup.key === group.key ? theme.text : theme.textMuted,
                    cursor: 'pointer',
                  }}
                >
                  {t.playerProfile[group.labelKey]}
                </button>
              ))}
            </div>
          )}
          {!hasStats ? (
            <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.playerProfile.noStats}</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {activeGroup.rows.map((key) => (
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
