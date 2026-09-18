-- Fixes duplicated goals/cards/subs in a fixture's match-events timeline
-- (user-reported, screenshot, 2026-09-18: every event in Espanyol vs Elche
-- appeared twice). matchEventsReconciler.js's dedup (type-family + player
-- + substituted + minute-within-1) runs entirely in application code as a
-- separate select-then-insert from each of the two independent writers
-- (syncLiveEvents.js's WebSocket path and syncLineups.js/
-- syncEuropeanLineups.js's REST path) -- confirmed live via
-- diagnoseMatchEventsDuplication.js: the duplicated rows' `player` values
-- were byte-identical (character codes matched exactly, ruling out a
-- string-formatting mismatch), and every duplicate pair's REST/WS
-- created_at timestamps were only minutes (sometimes seconds) apart --
-- both writers ran their own "does this already exist?" read before
-- either one's insert had committed, so both concluded "genuinely new"
-- and both wrote a row for the same real event. No amount of correct
-- content-matching logic in application code can close this race by
-- itself: two independent processes each doing read-then-write with no
-- shared lock will always have a window where both reads see the same
-- (stale) state.
--
-- Moves the whole check-and-insert into one Postgres function, holding a
-- pg_advisory_xact_lock scoped to fixture_id for the duration of the
-- call (auto-released at the end of the calling transaction) -- so the
-- two writers now genuinely serialize on the same fixture instead of
-- racing, whichever one calls first does its insert-or-skip atomically
-- before the other's read is even allowed to start.
create or replace function match_event_minute_value(p_minute text)
returns numeric
language sql
immutable
as $$
  select case
    when p_minute is null or p_minute = '' then null
    else
      coalesce(nullif(split_part(p_minute, '+', 1), '')::numeric, 0)
      + coalesce(nullif(split_part(p_minute, '+', 2), '')::numeric, 0)
  end;
$$;

create or replace function match_event_type_family(p_type text)
returns text
language sql
immutable
as $$
  select case when p_type in ('Goal', 'Own Goal', 'Penalty') then 'goal' else p_type end;
$$;

-- p_rows: jsonb array of {club_id, team_name, type, minute, player, assist,
-- substituted, event_key} -- the same shape both buildLiveEventRows()
-- (syncLiveEvents.js) and buildEventRowsFromRest() (eventRows.js) already
-- produce. Returns the subset actually inserted (never previously seen,
-- by content, for this fixture, including against other rows in this same
-- batch) so callers can still notify favoriters for exactly those rows,
-- same as before.
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
        and abs(match_event_minute_value(existing.minute) - new_minute) <= 1
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
