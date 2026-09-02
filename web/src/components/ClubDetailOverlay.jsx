import { useRef, useState } from 'react';
import { Crown } from 'lucide-react';
import ClubJersey from './ClubJersey.jsx';
import PlayerProfileOverlay from './PlayerProfileOverlay.jsx';
import { useClubSquad } from '../hooks/useClubSquad.js';
import { useClubFixtures } from '../hooks/useClubFixtures.js';
import { useClubTransfers } from '../hooks/useClubTransfers.js';
import { useClubs } from '../hooks/useClubs.js';
import { relativeTime } from '../lib/relativeTime.js';
import { DATE_LOCALES } from '../i18n/languages.js';

const DISMISS_THRESHOLD_PX = 100;

// Same 4-category grouping syncLineups.js's groupByPositionRows() already
// uses for a fixture's lineup -- GOAL API's squad response uses the same
// plural type names ("Goalkeepers" etc.), so this reuses the exact
// position keys the app's own i18n (t.lineup.positions) already covers.
const ROW_ORDER = ['Goalkeepers', 'Defenders', 'Midfielders', 'Forwards'];
const SINGULAR = { Goalkeepers: 'Goalkeeper', Defenders: 'Defender', Midfielders: 'Midfielder', Forwards: 'Forward' };

function SquadTab({ theme, t, clubId, onSelectPlayer }) {
  const { squad, squadAvailable, loading } = useClubSquad(clubId);

  if (loading) {
    return <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.common.loading}</p>;
  }
  if (!squadAvailable) {
    return <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.clubDetail.squadUnavailable}</p>;
  }
  if (squad.length === 0) {
    return <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.clubDetail.squadEmpty}</p>;
  }

  const rows = ROW_ORDER.map((pos) => squad.filter((p) => p.position === pos)).filter((row) => row.length > 0);

  return (
    <div style={{ padding: '4px 16px 16px' }}>
      {rows.map((row, i) => (
        <div key={i} style={{ marginBottom: '14px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px' }}>
            {t.lineup.positions[SINGULAR[ROW_ORDER[i]]] || ROW_ORDER[i]}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {row.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelectPlayer(p)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  padding: '6px 0',
                  font: 'inherit',
                  cursor: 'pointer',
                  color: theme.text,
                }}
              >
                {p.photo ? (
                  <img src={p.photo} alt="" width={34} height={34} style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: theme.surfaceRaised }} />
                ) : (
                  <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: theme.surfaceRaised, flexShrink: 0 }} />
                )}
                <span style={{ width: '20px', flexShrink: 0, fontSize: '12px', color: theme.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                  {p.number ?? '–'}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: '13.5px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
                {p.isCaptain && <Crown size={14} style={{ color: theme.accent, flexShrink: 0 }} title={t.clubDetail.captain} />}
                {p.injured && (
                  <span style={{ fontSize: '10px', fontWeight: 700, color: theme.danger, border: `1px solid ${theme.danger}`, borderRadius: '999px', padding: '1px 6px', flexShrink: 0 }}>
                    {t.clubDetail.injured}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FixturesTabContent({ theme, t, locale, clubId, leagueSlug }) {
  const { fixtures, loading } = useClubFixtures(clubId);
  const { clubs } = useClubs(leagueSlug);
  const clubsById = new Map(clubs.map((c) => [c.id, c]));

  if (loading) {
    return <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.common.loading}</p>;
  }
  if (fixtures.length === 0) {
    return <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.clubDetail.noFixtures}</p>;
  }

  return (
    <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {fixtures.map((f) => {
        const isHome = f.home_club_id === clubId;
        const opponent = clubsById.get(isHome ? f.away_club_id : f.home_club_id);
        const scoreOrTime =
          f.status === 'finished'
            ? t.fixtures.finished
            : f.status === 'live'
              ? (f.live_minute ? `${f.live_minute}'` : t.fixtures.live)
              : new Date(f.kickoff_at).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const score = f.home_score != null && f.away_score != null ? `${f.home_score} : ${f.away_score}` : null;

        return (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderBottom: `1px solid ${theme.border}` }}>
            <span style={{ width: '16px', flexShrink: 0, fontSize: '11px', fontWeight: 700, color: theme.textMuted }}>{isHome ? 'H' : 'A'}</span>
            <ClubJersey club={opponent} size={20} theme={theme} />
            <span style={{ flex: 1, minWidth: 0, fontSize: '13.5px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {opponent?.short_name || opponent?.name || '–'}
            </span>
            <span style={{ fontSize: '12.5px', color: theme.textMuted, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {score ?? scoreOrTime}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TransfersTabContent({ theme, t, clubId }) {
  const { transfers, loading } = useClubTransfers(clubId);

  if (loading) {
    return <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.common.loading}</p>;
  }
  if (transfers.length === 0) {
    return <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.clubDetail.noTransfers}</p>;
  }

  return (
    <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {transfers.map((tr) => (
        <div key={tr.id} style={{ background: theme.surfaceRaised, borderRadius: '12px', padding: '12px 14px', border: `1px solid ${theme.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '999px',
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                background: tr.is_official ? theme.accent : 'transparent',
                color: tr.is_official ? theme.accentText : theme.danger,
                border: tr.is_official ? 'none' : `1px solid ${theme.danger}`,
              }}
            >
              {tr.is_official ? t.transfers.official : t.transfers.rumor}
            </span>
            <span style={{ fontSize: '11px', color: theme.textMuted }}>{relativeTime(tr.published_at, t)}</span>
          </div>
          <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 4px' }}>{tr.player_name}</p>
          <p style={{ fontSize: '12px', color: theme.textMuted, margin: 0 }}>
            {tr.from_club} → {tr.to_club}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function ClubDetailOverlay({ theme, t, language, league, club, onClose }) {
  const [tab, setTab] = useState('squad'); // 'squad' | 'fixtures' | 'transfers'
  const locale = DATE_LOCALES[language];

  const [profilePlayer, setProfilePlayer] = useState(null);

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

  const TABS = [
    ['squad', t.clubDetail.tabSquad],
    ['fixtures', t.clubDetail.tabFixtures],
    ['transfers', t.clubDetail.tabTransfers],
  ];

  return (
    <>
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
            <ClubJersey club={club} size={56} theme={theme} />
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 4px', lineHeight: 1.25 }}>{club.name}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: theme.textMuted, flexWrap: 'wrap' }}>
                {club.founded && <span>{t.clubDetail.founded(club.founded)}</span>}
                {club.founded && club.venue_capacity && <span>·</span>}
                {club.venue_capacity && <span>{t.clubDetail.capacity(club.venue_capacity.toLocaleString(locale))}</span>}
              </div>
              {club.venue && <p style={{ fontSize: '12.5px', color: theme.textMuted, margin: '4px 0 0' }}>{club.venue}</p>}
            </div>
          </div>
        </div>

        <div style={{ flexShrink: 0, display: 'flex', gap: '16px', padding: '0 18px', borderBottom: `1px solid ${theme.border}` }}>
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: '2px 2px 10px',
                fontSize: '13px',
                fontWeight: tab === key ? 700 : 600,
                border: 'none',
                borderBottom: tab === key ? `2px solid ${theme.accent}` : '2px solid transparent',
                background: 'transparent',
                color: tab === key ? theme.text : theme.textMuted,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {tab === 'squad' && <SquadTab theme={theme} t={t} clubId={club.id} onSelectPlayer={setProfilePlayer} />}
          {tab === 'fixtures' && <FixturesTabContent theme={theme} t={t} locale={locale} clubId={club.id} leagueSlug={league} />}
          {tab === 'transfers' && <TransfersTabContent theme={theme} t={t} clubId={club.id} />}
        </div>
      </div>
    </div>
    {profilePlayer && (
      <PlayerProfileOverlay
        theme={theme}
        t={t}
        player={{ name: profilePlayer.name, photo_url: profilePlayer.photo, position: profilePlayer.position, injured: profilePlayer.injured }}
        locale={locale}
        onClose={() => setProfilePlayer(null)}
      />
    )}
    </>
  );
}
