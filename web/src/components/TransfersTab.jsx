import { useMemo } from 'react';
import { ArrowRightCircle, User, ExternalLink } from 'lucide-react';
import LeagueSwitcher from './LeagueSwitcher.jsx';
import QuickFilters from './QuickFilters.jsx';
import { useClubs } from '../hooks/useClubs.js';
import { useTransfers } from '../hooks/useTransfers.js';

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
  const { transfers, loading } = useTransfers(league, { officialOnly });

  const filtered = useMemo(() => {
    if (!activeFilter) return transfers;
    return transfers.filter((t) => t.from_club_id === activeFilter.id || t.to_club_id === activeFilter.id);
  }, [transfers, activeFilter]);

  return (
    <div style={{ padding: '14px 16px 90px' }}>
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
          marginBottom: '12px',
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
                    title="Spielerprofil auf Transfermarkt"
                    style={{ color: theme.textMuted, display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', textDecoration: 'none' }}
                  >
                    <User size={13} /> Profil
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
  );
}
