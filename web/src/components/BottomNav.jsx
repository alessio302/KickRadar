import { ArrowLeftRight, Calendar, Settings } from 'lucide-react';

// No separate "Aufstellungen" tab -- lineups live in a per-fixture overlay
// opened from the Spiele tab instead (tap a match card), see
// FixtureDetailOverlay.jsx. Tab ids stay the fixed internal keys they
// always were (App.jsx branches on them, notifications deep-link via
// them) -- only the displayed label is translated.
const TABS = [
  ['transfers', (t) => t.nav.transfers, ArrowLeftRight],
  ['spiele', (t) => t.nav.fixtures, Calendar],
  ['einstellungen', (t) => t.nav.settings, Settings],
];

export default function BottomNav({ tab, onSelectTab, theme, t }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-around',
        padding: '10px 0',
        paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
        background: theme.surface,
        borderTop: `1px solid ${theme.border}`,
      }}
    >
      {TABS.map(([id, getLabel, Icon]) => (
        <button
          key={id}
          onClick={() => onSelectTab(id)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: tab === id ? theme.accent : theme.textMuted,
          }}
        >
          <Icon size={20} />
          <span style={{ fontSize: '10px', fontWeight: 600 }}>{getLabel(t)}</span>
        </button>
      ))}
    </div>
  );
}
