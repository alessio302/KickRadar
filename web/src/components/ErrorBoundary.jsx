import { Component } from 'react';

// Catches render/lifecycle errors thrown by whichever tab is currently
// mounted (see App.jsx) so one broken tab shows a recoverable fallback
// instead of taking the whole app down to a blank white screen -- React
// unmounts the entire tree below the nearest boundary on an uncaught
// error, and until now App.jsx had none. "Retry" just resets the boundary
// state; switching tabs (via BottomNav, which stays mounted outside this
// boundary) also naturally recovers since it mounts a fresh tab component.
export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('KickRadar tab crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const { theme, t } = this.props;
      return (
        <div
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '14px',
            padding: '24px',
            textAlign: 'center',
            color: theme.text,
          }}
        >
          <div style={{ fontSize: '15px', fontWeight: 600 }}>{t.errors.tabCrashed}</div>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            style={{
              background: theme.accent,
              color: theme.accentText,
              border: 'none',
              borderRadius: '999px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t.errors.retry}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
