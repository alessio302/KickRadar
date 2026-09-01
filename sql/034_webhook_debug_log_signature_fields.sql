-- Adds fields needed to verify GOAL API's x-goal-signature header (Stripe-
-- style HMAC scheme, confirmed live against a real delivery) before
-- trusting a webhook payload -- see supabase/functions/goal-api-webhook.
alter table webhook_debug_log add column if not exists raw_body text;
alter table webhook_debug_log add column if not exists signature_valid boolean;
alter table webhook_debug_log add column if not exists signature_reason text;
