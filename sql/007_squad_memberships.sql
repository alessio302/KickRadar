-- Synced squad data (player -> current club) from football-data.org's free
-- GET /teams/{id} endpoint (confirmed live: includes a real `squad` array,
-- no paid "deep data pack" needed). Used to resolve which direction a
-- transfer story actually goes, instead of trusting whichever of two
-- independent, possibly-conflicting articles about the same player got it
-- right -- confirmed live: two RMC Sport stories had Facundo Medina going
-- both Marseille->Leverkusen and Leverkusen->Marseille at once.
--
-- No unique constraint: src/football-api/syncSquads.js replaces a club's
-- rows wholesale on every sync (delete then insert), the same "never just
-- upsert-and-forget" fix already applied to clubs -- a stale leftover here
-- would silently point a transferred player at their old club forever.
create table if not exists squad_memberships (
  id serial primary key,
  club_id int not null references clubs(id) on delete cascade,
  external_player_id int,
  player_name text not null,
  normalized_name text not null, -- lowercased, diacritics-stripped, for lookups (see util/normalize.js)
  position text,
  synced_at timestamptz not null default now()
);
create index if not exists idx_squad_memberships_club on squad_memberships(club_id);
create index if not exists idx_squad_memberships_name on squad_memberships(normalized_name);

-- Backend-only table (the frontend never reads this) -- RLS with zero
-- policies denies all access to the anon key, same treatment as
-- push_subscriptions/seen_news_items. The sync script uses the
-- service_role key, which bypasses RLS entirely.
alter table squad_memberships enable row level security;
