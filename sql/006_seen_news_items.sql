-- Decouples "we've already spent an LLM call extracting this article" from
-- "this article ended up stored as a displayable transfer". Previously the
-- scraper's skip-known check only looked at the `transfers` table, so an
-- item that got extracted but rejected (e.g. neither club belongs to that
-- league, see 005) was never recorded anywhere -- meaning it would be
-- re-fetched and re-run through the LLM on every single future run,
-- forever, since it can never appear in `transfers`.
create table if not exists seen_news_items (
  source text not null,
  external_id text not null,
  seen_at timestamptz not null default now(),
  primary key (source, external_id)
);

-- Backfill from existing transfers so already-processed items aren't
-- reprocessed once the scraper switches to reading from this table.
insert into seen_news_items (source, external_id, seen_at)
select source, external_id, published_at
from transfers
on conflict (source, external_id) do nothing;

-- Backend-only table (the frontend never reads this) -- RLS with zero
-- policies denies all access to the anon key, same treatment as
-- push_subscriptions in 004. The scraper uses the service_role key, which
-- bypasses RLS entirely.
alter table seen_news_items enable row level security;

