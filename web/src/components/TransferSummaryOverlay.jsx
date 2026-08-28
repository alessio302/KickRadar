import { useState } from 'react';
import { X, Sparkles, ArrowRightCircle, ExternalLink } from 'lucide-react';
import { relativeTime } from '../lib/relativeTime.js';

// Same bottom-sheet chrome/drag-to-dismiss mechanics as
// FixtureDetailOverlay.jsx -- kept as a second copy rather than a shared
// wrapper component since the two overlays' internal layouts (tabs +
// pitch vs. a single scrolling text body) don't actually share much
// beyond "rounded sheet that slides up from the bottom", and forcing that
// into one shared component would need as many special cases as it'd save.
const DISMISS_THRESHOLD_PX = 100;

export default function TransferSummaryOverlay({ theme, t, transfer, onClose }) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  let dragStartY = null;

  const handlePointerDown = (e) => {
    dragStartY = e.clientY;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e) => {
    if (dragStartY == null) return;
    const delta = e.clientY - dragStartY;
    if (delta > 0) setDragY(delta);
  };
  const handlePointerUp = () => {
    if (dragY > DISMISS_THRESHOLD_PX) {
      onClose();
    } else {
      setDragY(0);
    }
    setDragging(false);
    dragStartY = null;
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
          transform: `translateY(${dragY}px)`,
          transition: dragging ? 'none' : 'transform 0.2s ease',
        }}
      >
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ flexShrink: 0, padding: '10px 18px 12px', borderBottom: `1px solid ${theme.border}`, cursor: 'grab', touchAction: 'none' }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
            <div style={{ width: '36px', height: '4px', borderRadius: '999px', background: theme.border }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: theme.textMuted }}>
              <span>{transfer.source}</span>
              <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: theme.textMuted }} />
              <span>{relativeTime(transfer.published_at, t)}</span>
            </div>
            <button
              onClick={onClose}
              aria-label={t.common.cancel}
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                border: `1px solid ${theme.border}`,
                background: theme.surfaceRaised,
                color: theme.textMuted,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 4px' }}>
          <p style={{ fontSize: '16.5px', fontWeight: 800, lineHeight: 1.3, margin: '0 0 6px' }}>{transfer.player_name}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
            <span style={{ fontSize: '12.5px', color: theme.textMuted }}>{transfer.from_club}</span>
            <ArrowRightCircle size={13} style={{ color: theme.textMuted, flex: '0 0 auto' }} />
            <span style={{ fontSize: '12.5px', color: theme.textMuted }}>{transfer.to_club}</span>
          </div>

          {/* "AI Summary" is deliberately never translated -- stays literal
              in every app language, per explicit call. */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '10.5px',
              fontWeight: 700,
              letterSpacing: '0.02em',
              color: theme.accent,
              background: `${theme.accent}24`,
              borderRadius: '999px',
              padding: '4px 10px 4px 8px',
              marginBottom: '14px',
            }}
          >
            <Sparkles size={11} /> AI Summary
          </span>

          <p style={{ fontSize: '14.5px', lineHeight: 1.62, margin: 0 }}>{transfer.ai_summary}</p>
        </div>

        <div
          style={{
            flexShrink: 0,
            padding: '14px 18px calc(16px + env(safe-area-inset-bottom))',
            borderTop: `1px solid ${theme.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <a
            href={transfer.source_url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              width: '100%',
              padding: '11px',
              borderRadius: '10px',
              background: theme.accent,
              color: theme.accentText,
              fontSize: '13.5px',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            <ExternalLink size={14} /> {t.transfers.readOriginal}
          </a>
          <p style={{ fontSize: '10.5px', color: theme.textMuted, textAlign: 'center', margin: 0, lineHeight: 1.4 }}>
            {t.transfers.aiSummaryDisclaimer}
          </p>
        </div>
      </div>
    </div>
  );
}
