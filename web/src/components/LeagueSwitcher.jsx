import { LEAGUES } from '../lib/leagues.js';

export default function LeagueSwitcher({ league, onSelectLeague, theme }) {
  return (
    <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
      {LEAGUES.map((l) => (
        <button
          key={l.slug}
          onClick={() => onSelectLeague(l.slug)}
          title={l.label}
          style={{
            flex: '1',
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px 4px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: league === l.slug ? 700 : 600,
            border: 'none',
            cursor: 'pointer',
            background: theme.surface,
            color: league === l.slug ? theme.accent : theme.textMuted,
            borderBottom: `2px solid ${league === l.slug ? theme.accent : 'transparent'}`,
          }}
        >
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: l.color, flex: '0 0 auto' }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.short}</span>
        </button>
      ))}
    </div>
  );
}
