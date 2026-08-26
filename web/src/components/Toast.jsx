import { useEffect } from 'react';

// Rendered by App.jsx directly above BottomNav (see the "position:
// relative" wrapper there) so it reads as app-chrome feedback -- "above
// the menu items" -- regardless of which tab triggered it, not scoped to
// one tab's own scrolling content area.
export default function Toast({ theme, message, onDismiss, durationMs = 2000 }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="status"
      style={{
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginBottom: '10px',
        background: theme.surfaceRaised,
        color: theme.text,
        border: `1px solid ${theme.border}`,
        borderRadius: '999px',
        padding: '9px 16px',
        fontSize: '13px',
        fontWeight: 600,
        boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
        whiteSpace: 'nowrap',
        zIndex: 40,
        pointerEvents: 'none',
      }}
    >
      {message}
    </div>
  );
}
