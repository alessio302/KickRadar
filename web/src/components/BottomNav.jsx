import { ArrowLeftRight, Calendar, Users, Settings } from 'lucide-react';

const TABS = [
  ['transfers', 'Transfers', ArrowLeftRight],
  ['spiele', 'Spiele', Calendar],
  ['aufstellungen', 'Aufstellungen', Users],
  ['einstellungen', 'Einstellungen', Settings],
];

export default function BottomNav({ tab, onSelectTab, theme }) {
  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        display: 'flex',
        justifyContent: 'space-around',
        padding: '10px 0',
        background: theme.surface,
        borderTop: `1px solid ${theme.border}`,
      }}
    >
      {TABS.map(([id, label, Icon]) => (
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
          <span style={{ fontSize: '10px', fontWeight: 600 }}>{label}</span>
        </button>
      ))}
    </div>
  );
}
