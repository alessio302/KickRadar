-- Fixes a real event-loss risk introduced (and widened) by migration 064:
-- insert_new_match_events()'s dup-check matched each fresh row against
-- "any existing row within N minutes for this player/type", with no
-- tracking of which existing row a given fresh row actually matched. Two
-- GENUINE goals (or cards) by the SAME player a few minutes apart -- a
-- real rebound brace, not a provider clock correction -- would both match
-- the SAME already-stored first row, so the second, real event would
-- silently never be inserted (and never pushed) at all. This existed
-- already at the old ±1 tolerance (needed an exact 1-minute gap to
-- trigger), but widening to ±3 in migration 064 -- to fix the Roma/Inter
-- duplicate-push case -- made this collision meaningfully more likely to
-- hit in practice. Confirmed as a real gap while investigating that same
-- Roma vs Inter match, user-raised: "was passiert wenn 2 Tore in 2 min
-- vom gleichen Spieler erzielt werden?" -- prior code would have silently
-- dropped the second one.
--
-- Fix: snapshot existing match_events for the fixture ONCE at the start
-- of the call (not re-queried after each insert -- a row THIS call just
-- inserted is a sibling fresh event, not a prior stored one, and must
-- never be used to dedupe another row in the same batch), then greedily
-- claim the CLOSEST still-unclaimed matching row (by minute delta) for
-- each fresh row in turn. A second fresh row can no longer match an
-- already-claimed row, so two real close-together events by the same
-- player each get their own row -- while a single real event reported
-- twice with a drifted minute (the original migration-064 case) still
-- correctly claims its one existing row and is skipped.
create or replace function insert_new_match_events(p_fixture_id int, p_rows jsonb)
returns setof match_events
language plpgsql
as $$
declare
  r jsonb;
  new_minute numeric;
  new_player text;
  new_substituted text;
  new_type_family text;
  inserted_row match_events%rowtype;
  existing_rows match_events[];
  claimed boolean[];
  n int;
  i int;
  best_i int;
  best_delta numeric;
  delta numeric;
begin
  perform pg_advisory_xact_lock(p_fixture_id);

  select coalesce(array_agg(e), '{}') into existing_rows
  from match_events e where e.fixture_id = p_fixture_id;

  n := coalesce(array_length(existing_rows, 1), 0);
  claimed := array_fill(false, array[n]);

  for r in select * from jsonb_array_elements(p_rows)
  loop
    new_minute := match_event_minute_value(r->>'minute');
    new_player := r->>'player';
    new_substituted := coalesce(r->>'substituted', '');
    new_type_family := match_event_type_family(r->>'type');
    best_i := null;
    best_delta := null;

    for i in 1 .. n
    loop
      if not claimed[i]
        and match_event_type_family(existing_rows[i].type) = new_type_family
        and existing_rows[i].player is not distinct from new_player
        and coalesce(existing_rows[i].substituted, '') = new_substituted
      then
        delta := abs(match_event_minute_value(existing_rows[i].minute) - new_minute);
        if delta <= 3 and (best_delta is null or delta < best_delta) then
          best_i := i;
          best_delta := delta;
        end if;
      end if;
    end loop;

    if best_i is not null then
      claimed[best_i] := true;
    else
      insert into match_events (fixture_id, club_id, team_name, type, minute, player, assist, substituted, event_key)
      values (
        p_fixture_id,
        nullif(r->>'club_id', '')::int,
        nullif(r->>'team_name', ''),
        r->>'type',
        r->>'minute',
        new_player,
        r->>'assist',
        nullif(r->>'substituted', ''),
        r->>'event_key'
      )
      on conflict (fixture_id, event_key) do nothing
      returning * into inserted_row;

      if found then
        return next inserted_row;
      end if;
    end if;
  end loop;

  return;
end;
$$;
