-- webhook_debug_log logs every verified GOAL API delivery indefinitely --
-- fine for the initial payload-shape investigation, not something to keep
-- growing forever. Daily prune of anything older than 7 days.
create extension if not exists pg_cron;

select cron.schedule(
  'webhook_debug_log_cleanup',
  '0 3 * * *',
  $$ delete from public.webhook_debug_log where received_at < now() - interval '7 days'; $$
);
