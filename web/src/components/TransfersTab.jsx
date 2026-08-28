import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightCircle, RefreshCw, User, Sparkles } from 'lucide-react';
import LeagueSwitcher from './LeagueSwitcher.jsx';
import QuickFilters from './QuickFilters.jsx';
import TransferSummaryOverlay from './TransferSummaryOverlay.jsx';
import { useClubs } from '../hooks/useClubs.js';
import { useTransfers } from '../hooks/useTransfers.js';
import { relativeTime } from '../lib/relativeTime.js';

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

export default function TransfersTab({
  theme,
  t,
  language,
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
  const [summaryTransfer, setSummaryTransfer] = useState(null);

  const filtered = useMemo(() => {
    if (!activeFilter) return transfers;
    return transfers.filter((transfer) => transfer.from_club_id === activeFilter.id || transfer.to_club_id === activeFilter.id);
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
          t={t}
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
          <span style={{ fontSize: '13px', color: theme.textMuted }}>{t.transfers.officialOnly}</span>
          <button
            onClick={onToggleOfficialOnly}
            aria-label={t.transfers.officialOnlyToggle}
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
        {refreshing ? t.transfers.refreshing : pullDistance >= PULL_THRESHOLD ? t.transfers.releaseToRefresh : t.transfers.pullToRefresh}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {loading && (
          <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.common.loading}</p>
        )}
        {!loading && filtered.length === 0 && (
          <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>
            {t.transfers.empty}
          </p>
        )}
        {filtered.map((transfer) => (
          <div
            key={transfer.id}
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
                  background: transfer.is_official ? theme.accent : 'transparent',
                  color: transfer.is_official ? theme.accentText : theme.danger,
                  border: transfer.is_official ? 'none' : `1px solid ${theme.danger}`,
                }}
              >
                {transfer.is_official ? t.transfers.official : t.transfers.rumor}
              </span>
              <span style={{ fontSize: '11px', color: theme.textMuted }}>{relativeTime(transfer.published_at, t)}</span>
            </div>
            <p style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 6px' }}>{transfer.player_name ?? transfer.summary}</p>
            {(transfer.from_club || transfer.to_club) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                {/* Arrow only when both sides are known -- confirmed live that a
                    lone club can be misdirected by the extraction (a "sale"
                    story mislabels the player's *current* club as the
                    destination), so asserting a direction from one club alone
                    can actively mislead. A bare, arrow-less name is neutral
                    context instead of a (possibly wrong) directional claim. */}
                {transfer.from_club && transfer.to_club ? (
                  <>
                    <span style={{ fontSize: '12px', color: theme.textMuted }}>{transfer.from_club}</span>
                    <ArrowRightCircle size={13} style={{ color: theme.textMuted, margin: '0 2px', flex: '0 0 auto' }} />
                    <span style={{ fontSize: '12px', color: theme.textMuted }}>{transfer.to_club}</span>
                  </>
                ) : (
                  <span style={{ fontSize: '12px', color: theme.textMuted }}>{transfer.from_club ?? transfer.to_club}</span>
                )}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: theme.textMuted }}>{transfer.source}</span>
              <div style={{ display: 'flex', gap: '10px' }}>
                {transfer.players?.transfermarkt_url && (
                  <a
                    href={transfer.players.transfermarkt_url}
                    target="_blank"
                    rel="noreferrer"
                    title={t.transfers.searchPlayerTitle}
                    style={{ color: theme.textMuted, display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', textDecoration: 'none' }}
                  >
                    <User size={13} /> {t.transfers.searchPlayer}
                  </a>
                )}
                {transfer[`ai_summary_${language}`] && (
                  <button
                    onClick={() => setSummaryTransfer(transfer)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: theme.accent,
                      background: `${theme.accent}24`,
                      border: 'none',
                      borderRadius: '999px',
                      padding: '4px 9px 4px 7px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <Sparkles size={12} /> AI Summary
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      </div>

      {summaryTransfer && (
        <TransferSummaryOverlay theme={theme} t={t} language={language} transfer={summaryTransfer} onClose={() => setSummaryTransfer(null)} />
      )}
    </div>
  );
}
