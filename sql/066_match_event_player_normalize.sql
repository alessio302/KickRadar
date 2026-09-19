-- Applies the same case/diacritic/whitespace-insensitive player matching
-- to insert_new_match_events()'s own dup-check that
-- matchEventsReconciler.js's isSameEvent() just got (see that file's own
-- comment: confirmed live 2026-09-19, Roma vs Inter, GOAL API's REST
-- player-name formatting isn't guaranteed byte-identical between two
-- separate calls for the same real event). This RPC's own check is the
-- last line of defense against the OTHER writer (syncLiveEvents.js's WS
-- path) racing a concurrent insert for the same fixture under a
-- differently-formatted player string -- matchEventsReconciler.js's own
-- fix covers the REST reconciler's read-then-decide step, but this
-- function is what actually decides whether to insert under the
-- pg_advisory_xact_lock, so it needs the identical normalization or the
-- same class of bug can still slip through that path.
create or replace function match_event_player_key(p_player text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(normalize(lower(coalesce(p_player, '')), NFD), '[̀-ͯ]', '', 'g'));
$$;

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
        and match_event_player_key(existing_rows[i].player) = match_event_player_key(new_player)
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
