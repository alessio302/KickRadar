import { ArrowRightCircle, User, Sparkles } from 'lucide-react';
import { relativeTime } from '../lib/relativeTime.js';

// Shared by TransfersTab.jsx (league-wide feed) and ClubDetailOverlay.jsx
// (a single club's transfers tab) -- same card, same "View profile"/"AI
// Summary" actions in both places, per explicit request that the club
// overlay's transfers tab behave exactly like the main Transfers tab.
export default function TransferCard({ theme, t, language, transfer, onOpenProfile, onOpenSummary }) {
  return (
    <div style={{ background: theme.surfaceRaised, borderRadius: '12px', padding: '12px 14px', border: `1px solid ${theme.border}` }}>
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
          {transfer.players?.goal_api_id ? (
            <button
              onClick={() => onOpenProfile?.(transfer)}
              title={t.transfers.viewProfileTitle}
              style={{
                color: theme.textMuted,
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '11px',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <User size={13} /> {t.transfers.viewProfile}
            </button>
          ) : (
            transfer.players?.transfermarkt_url && (
              <a
                href={transfer.players.transfermarkt_url}
                target="_blank"
                rel="noreferrer"
                title={t.transfers.searchPlayerTitle}
                style={{ color: theme.textMuted, display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', textDecoration: 'none' }}
              >
                <User size={13} /> {t.transfers.searchPlayer}
              </a>
            )
          )}
          {transfer[`ai_summary_${language}`] && (
            <button
              onClick={() => onOpenSummary?.(transfer)}
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
  );
}
