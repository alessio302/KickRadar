-- Confirmed live: the two push-notification toggles in Settings looked
-- "synchronized" -- turning either one on turned the other on too. Root
-- cause: transfer push had no real preference of its own, just the
-- subscription's existence, while notify_lineups defaults true on a fresh
-- row -- so subscribing via either toggle immediately satisfied both
-- toggles' visual "on" condition. Giving transfers a real, independent
-- preference column (same shape as notify_lineups) decouples them.
alter table push_subscriptions add column if not exists notify_transfers boolean not null default true;
