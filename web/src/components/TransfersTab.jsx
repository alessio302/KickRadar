import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightCircle, RefreshCw, User, ExternalLink } from 'lucide-react';
import LeagueSwitcher from './LeagueSwitcher.jsx';
import QuickFilters from './QuickFilters.jsx';
import { useClubs } from '../hooks/useClubs.js';
import { useTransfers } from '../hooks/useTransfers.js';

// Distance the indicator has to be pulled past before releasing triggers a
// refresh, and the cap on how far it visually travels while dragging.
const PULL_THRESHOLD = 60;
const PULL_MAX = 90;

// Rubber-band curve (grows fast at first, increasingly resists further
// pulling) instead of 1:1 finger tracking -- matches native overscroll
// physics; confirmed live that a linear mapping read as "not elastic
// enough, can barely pull it."
function dampen(rawDelta) {
  return Math.min(PULL_MAX, Math.sqrt(rawDelta) * 6);
}

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} Min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `vor ${hours} Std`;
  const days = Math.round(hours / 24);
  return `vor ${days} Tag${days === 1 ? '' : 'en'}`;
}

export default function TransfersTab({
  theme,
  league,
  onSelectLeague,
  favoriteClub,
  quickFilters,
  activeFilter,
  onSelectFilter,
  onAddQuickFilter,
  onRemoveQuickFilter,
  officialOnly,
  onToggleOfficialOnly,
}) {
  const { clubs } = useClubs(league);
  const { transfers, loading, refreshing, refetch } = useTransfers(league, { officialOnly });

  const filtered = useMemo(() => {
    if (!activeFilter) return transfers;
    return transfers.filter((t) => t.from_club_id === activeFilter.id || t.to_club_id === activeFilter.id);
  }, [transfers, activeFilter]);

  // Pull-to-refresh: only starts tracking when the list is already
  // scrolled to the top (a pull gesture mid-list would just be a normal
  // scroll), and lets go cleanly the moment either condition stops holding
  // mid-drag (scrolled away, or dragging back up).
  //
  // A real, non-passive touchmove listener (attached via useEffect), not
  // React's synthetic onTouchMove/onPointerMove props -- confirmed live
  // that those can't reliably preventDefault() the browser's own decision
  // to hand an ambiguous vertical drag off to native scrolling mid-gesture,
  // which showed up as the custom indicator flashing briefly and then the
  // pull just stopping tracking. Calling preventDefault() ourselves, once
  // we've decided this is a pull (not a scroll), keeps the whole gesture.
  const scrollRef = useRef(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [pulling, setPulling] = useState(false);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let startY = null;

    const handleTouchStart = (e) => {
      startY = el.scrollTop <= 0 ? e.touches[0].clientY : null;
    };

    const handleTouchMove = (e) => {
      if (startY == null) return;
      const rawDelta = e.touches[0].clientY - startY;
      if (rawDelta <= 0 || el.scrollTop > 0) {
        startY = null;
        setPulling(false);
        setPullDistance(0);
        return;
      }
      e.preventDefault();
      setPulling(true);
      setPullDistance(dampen(rawDelta));
    };

    const handleTouchEnd = () => {
      if (startY != null) {
        setPullDistance((current) => {
          if (current >= PULL_THRESHOLD) refetchRef.current();
          return 0;
        });
        setPulling(false);
      }
      startY = null;
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, padding: '14px 16px 0' }}>
        <LeagueSwitcher league={league} onSelectLeague={onSelectLeague} theme={theme} />

        <QuickFilters
          theme={theme}
          clubs={clubs}
          favoriteClub={favoriteClub}
          quickFilters={quickFilters}
          activeFilterId={activeFilter?.id ?? null}
          onSelectFilter={onSelectFilter}
          onAddQuickFilter={onAddQuickFilter}
          onRemoveQuickFilter={onRemoveQuickFilter}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 2px',
            borderTop: `1px solid ${theme.border}`,
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <span style={{ fontSize: '13px', color: theme.textMuted }}>Nur offizielle Transfers</span>
          <button
            onClick={onToggleOfficialOnly}
            aria-label="Nur offizielle Transfers umschalten"
            style={{
              width: '40px',
              height: '22px',
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer',
              background: officialOnly ? theme.accent : theme.border,
              position: 'relative',
            }}
          >
            <div
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: theme.surface,
                position: 'absolute',
                top: '3px',
                left: officialOnly ? '21px' : '3px',
                transition: 'left 0.15s',
              }}
            />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'none',
          padding: '12px 16px 14px',
        }}
      >
      <style>{'@keyframes kickradar-spin { to { transform: rotate(360deg); } }'}</style>
      <div
        style={{
          height: refreshing ? '40px' : `${pullDistance}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          overflow: 'hidden',
          color: theme.textMuted,
          fontSize: '12px',
          transition: pulling ? 'none' : 'height 0.2s ease',
        }}
      >
        <RefreshCw
          size={14}
          style={{
            animation: refreshing ? 'kickradar-spin 0.7s linear infinite' : 'none',
            transform: refreshing ? undefined : `rotate(${Math.min(pullDistance / PULL_THRESHOLD, 1) * 180}deg)`,
          }}
        />
        {refreshing ? 'Aktualisiert…' : pullDistance >= PULL_THRESHOLD ? 'Loslassen zum Aktualisieren' : 'Zum Aktualisieren ziehen'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {loading && (
          <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>Lädt…</p>
        )}
        {!loading && filtered.length === 0 && (
          <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>
            Keine Meldungen für diese Auswahl.
          </p>
        )}
        {filtered.map((t) => (
          <div
            key={t.id}
            style={{ background: theme.surfaceRaised, borderRadius: '12px', padding: '12px 14px', border: `1px solid ${theme.border}` }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  background: t.is_official ? theme.accent : 'transparent',
                  color: t.is_official ? theme.accentText : theme.danger,
                  border: t.is_official ? 'none' : `1px solid ${theme.danger}`,
                }}
              >
                {t.is_official ? 'offiziell' : 'gerücht'}
              </span>
              <span style={{ fontSize: '11px', color: theme.textMuted }}>{relativeTime(t.published_at)}</span>
            </div>
            <p style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 6px' }}>{t.player_name ?? t.summary}</p>
            {(t.from_club || t.to_club) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                {/* Arrow only when both sides are known -- confirmed live that a
                    lone club can be misdirected by the extraction (a "sale"
                    story mislabels the player's *current* club as the
                    destination), so asserting a direction from one club alone
                    can actively mislead. A bare, arrow-less name is neutral
                    context instead of a (possibly wrong) directional claim. */}
                {t.from_club && t.to_club ? (
                  <>
                    <span style={{ fontSize: '12px', color: theme.textMuted }}>{t.from_club}</span>
                    <ArrowRightCircle size={13} style={{ color: theme.textMuted, margin: '0 2px', flex: '0 0 auto' }} />
                    <span style={{ fontSize: '12px', color: theme.textMuted }}>{t.to_club}</span>
                  </>
                ) : (
                  <span style={{ fontSize: '12px', color: theme.textMuted }}>{t.from_club ?? t.to_club}</span>
                )}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: theme.textMuted }}>{t.source}</span>
              <div style={{ display: 'flex', gap: '10px' }}>
                {t.players?.transfermarkt_url && (
                  <a
                    href={t.players.transfermarkt_url}
                    target="_blank"
                    rel="noreferrer"
                    title="Spieler auf Transfermarkt suchen"
                    style={{ color: theme.textMuted, display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', textDecoration: 'none' }}
                  >
                    <User size={13} /> Spieler suchen
                  </a>
                )}
                <a
                  href={t.source_url}
                  target="_blank"
                  rel="noreferrer"
                  title="Artikel lesen"
                  style={{ color: theme.textMuted, display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', textDecoration: 'none' }}
                >
                  <ExternalLink size={13} /> Artikel
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
