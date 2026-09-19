-- Widens insert_new_match_events()'s own minute-tolerance dup-check from
-- ±1 to ±3, matching the identical bump just made to
-- matchEventsReconciler.js's own MINUTE_TOLERANCE -- see that file's own
-- comment for the confirmed-live case (Roma vs Inter, 2026-09-19: GOAL
-- API's WS and REST paths disagreed by 2 minutes on the same real Kone
-- goal, one more than ±1 allowed).
--
-- The two checks have to move together: matchEventsReconciler.js's own
-- isSameEvent() decides what NOT to delete when the REST reconciler runs,
-- but this function is the one that then decides whether a still-fresh
-- row looks "new" enough to insert (and notify favoriters for) inside the
-- same advisory-locked transaction. Leaving this one at ±1 while the JS
-- side moved to ±3 would have fixed the wrong half of the bug -- the old
-- WS row would correctly survive reconcileMatchEvents()'s delete step,
-- but insert_new_match_events() would still not recognize the REST row as
-- the same event (its own ±1 check), so it would insert a second row and
-- fire a second push regardless.
create or replace function insert_new_match_events(p_fixture_id int, p_rows jsonb)
returns setof match_events
language plpgsql
as $$
declare
  r jsonb;
  existing match_events%rowtype;
  new_minute numeric;
  new_player text;
  new_substituted text;
  new_type_family text;
  is_dup boolean;
  inserted_row match_events%rowtype;
begin
  perform pg_advisory_xact_lock(p_fixture_id);

  for r in select * from jsonb_array_elements(p_rows)
  loop
    new_minute := match_event_minute_value(r->>'minute');
    new_player := r->>'player';
    new_substituted := coalesce(r->>'substituted', '');
    new_type_family := match_event_type_family(r->>'type');
    is_dup := false;

    for existing in select * from match_events where fixture_id = p_fixture_id
    loop
      if match_event_type_family(existing.type) = new_type_family
        and existing.player is not distinct from new_player
        and coalesce(existing.substituted, '') = new_substituted
        and abs(match_event_minute_value(existing.minute) - new_minute) <= 3
      then
        is_dup := true;
        exit;
      end if;
    end loop;

    if not is_dup then
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
