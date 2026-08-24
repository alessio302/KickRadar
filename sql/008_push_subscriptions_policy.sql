-- Adds the anon-key policies push_subscriptions needed but intentionally
-- didn't get in 004: RLS with zero policies denies all access, which was
-- correct until the push feature itself existed. Now that the frontend
-- subscribes/unsubscribes directly with the anon key (no login system in
-- this app), it needs insert/update (upsert by endpoint) and delete.
--
-- No select policy: the frontend never needs to read subscription rows
-- back (it tracks its own subscribed/unsubscribed state from the browser's
-- own PushManager, not the DB), and an endpoint is an unguessable
-- browser-issued value that functions like a bearer credential, so scoping
-- writes to "you already know this endpoint" is a reasonable model for a
-- single-user app with no auth system.
create policy "Anyone can insert a subscription" on push_subscriptions for insert with check (true);
create policy "Anyone can update a subscription" on push_subscriptions for update using (true);
create policy "Anyone can delete a subscription" on push_subscriptions for delete using (true);
