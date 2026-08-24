-- Adds real club FKs to transfers.from_club/to_club, so the LLM-extracted
-- club names that match our curated `clubs` table are linkable (badges,
-- filtering) rather than just free-standing, possibly inconsistent text
-- (e.g. "OM" vs "Olympique de Marseille" for the same club).
alter table transfers add column if not exists from_club_id int references clubs(id);
alter table transfers add column if not exists to_club_id int references clubs(id);
create index if not exists idx_transfers_from_club on transfers(from_club_id);
create index if not exists idx_transfers_to_club on transfers(to_club_id);
