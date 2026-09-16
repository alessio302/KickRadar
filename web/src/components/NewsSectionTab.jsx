import { useState } from 'react';
import NewsTab from './NewsTab.jsx';
import TransfersTab from './TransfersTab.jsx';

// Wraps NewsTab (general news, new) and TransfersTab (transfer market,
// unchanged) behind a News/Transfers sub-tab bar -- same underline pattern
// as LigenTab.jsx's own Spiele/Tabelle split. This is what the bottom nav's
// renamed "News" item (was "Transfers", see BottomNav.jsx) actually opens;
// the nav's own internal tab id stays 'transfers' (App.jsx branches on it,
// push notifications deep-link via it -- only the displayed label changed),
// so this component is what that id now renders instead of TransfersTab
// directly. Defaults to the 'news' sub-tab -- General news is the point of
// the rename; a user who wants Transfers is one tap away, same as before.
export default function NewsSectionTab(props) {
  const [subTab, setSubTab] = useState('news');
  const { theme, t } = props;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, display: 'flex', borderBottom: `1px solid ${theme.border}` }}>
        {[
          ['news', t.newsSection.tabNews],
          ['transfers', t.newsSection.tabTransfers],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            style={{
              flex: 1,
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              font: 'inherit',
              fontSize: '13px',
              fontWeight: 600,
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${subTab === id ? theme.accent : 'transparent'}`,
              color: subTab === id ? theme.accent : theme.textMuted,
              cursor: 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {subTab === 'news' ? (
          <NewsTab theme={props.theme} t={props.t} language={props.language} league={props.league} onSelectLeague={props.onSelectLeague} onSwipeLeague={props.onSwipeLeague} />
        ) : (
          <TransfersTab {...props} />
        )}
      </div>
    </div>
  );
}
