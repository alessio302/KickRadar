import { RefreshCw } from 'lucide-react';
import { PULL_THRESHOLD } from '../hooks/usePullToRefresh.js';

// Extracted from TransfersTab.jsx (its original home) so FixturesTab.jsx
// can render the identical indicator instead of duplicating the markup.
export default function PullToRefreshIndicator({ theme, t, pullDistance, pulling, refreshing }) {
  return (
    <>
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
        {refreshing ? t.common.refreshing : pullDistance >= PULL_THRESHOLD ? t.common.releaseToRefresh : t.common.pullToRefresh}
      </div>
    </>
  );
}
