import { useRef, useState } from 'react';
import LeagueSwitcher from './LeagueSwitcher.jsx';
import LeagueCarousel from './LeagueCarousel.jsx';
import NewsCard from './NewsCard.jsx';
import NewsSummaryOverlay from './NewsSummaryOverlay.jsx';
import PullToRefreshIndicator from './PullToRefreshIndicator.jsx';
import { useNewsArticles } from '../hooks/useNewsArticles.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';

// Same "rendered twice mid-swipe" shape as TransfersTab.jsx's own
// TransfersList -- see that file's header comment, unchanged here.
function NewsList({ theme, t, language, league, onOpenSummary, scrollRef, refetchRef }) {
  const { articles, loading, refetch } = useNewsArticles(league);
  if (refetchRef) refetchRef.current = refetch;

  return (
    <div
      ref={scrollRef}
      style={{
        height: '100%',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehaviorY: 'none',
        padding: '12px 16px 14px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {loading && (
          <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.common.loading}</p>
        )}
        {!loading && articles.length === 0 && (
          <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.transfers.empty}</p>
        )}
        {articles.map((article) => (
          <NewsCard key={article.id} theme={theme} t={t} language={language} article={article} onOpenSummary={onOpenSummary} />
        ))}
      </div>
    </div>
  );
}

// League-scoped news feed, same overall shape as TransfersTab.jsx (per
// explicit request: identical layout, League switcher up top selects which
// league's news is shown -- no separate source/quick filters). Rendered as
// the "News" half of the News/Transfers sub-tab split, see App.jsx's
// TransfersTab usage and this file's sibling TransfersTab.jsx.
export default function NewsTab({ theme, t, language, league, onSelectLeague, onSwipeLeague }) {
  const [summaryArticle, setSummaryArticle] = useState(null);
  const pullContainerRef = useRef(null);
  const refetchRef = useRef(() => {});
  const { scrollRef: pullScrollRef, pullDistance, pulling, refreshing: pullRefreshing } = usePullToRefresh(
    () => refetchRef.current(),
    pullContainerRef
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PullToRefreshIndicator theme={theme} containerRef={pullContainerRef} pullDistance={pullDistance} pulling={pulling} refreshing={pullRefreshing}>
        <div style={{ flexShrink: 0, padding: '14px 16px 0' }}>
          <LeagueSwitcher league={league} onSelectLeague={onSelectLeague} theme={theme} />
        </div>

        <LeagueCarousel
          league={league}
          onSwitchLeague={onSwipeLeague}
          renderPage={(slug) => (
            <NewsList
              key={slug}
              theme={theme}
              t={t}
              language={language}
              league={slug}
              onOpenSummary={slug === league ? setSummaryArticle : undefined}
              scrollRef={slug === league ? pullScrollRef : undefined}
              refetchRef={slug === league ? refetchRef : undefined}
            />
          )}
        />
      </PullToRefreshIndicator>

      {summaryArticle && (
        <NewsSummaryOverlay theme={theme} t={t} language={language} article={summaryArticle} onClose={() => setSummaryArticle(null)} />
      )}
    </div>
  );
}
