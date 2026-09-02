import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// Transfer news filtered to one club (either side of the move), for the
// club-detail overlay's "Transfers" tab -- same table/filters useTransfers.js
// already applies league-wide (a resolved player_name and both club sides,
// see that file's own comment on why), just scoped by club id directly
// instead of by league, so no new sync job is needed for this tab either.
// Select list (ai_summary_*, source_url, players(...) join) mirrors
// useTransfers.js exactly -- the club overlay's transfer cards reuse the
// same TransferCard component and need the same fields for "View profile"
// and "AI Summary" to work identically there.
export function useClubTransfers(clubId) {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clubId == null) return;
    let cancelled = false;
    setLoading(true);

    supabase
      .from('transfers')
      .select(
        'id, player_name, from_club, to_club, from_club_id, to_club_id, is_official, source, source_url, summary, ai_summary_de, ai_summary_en, ai_summary_it, ai_summary_fr, ai_summary_es, published_at, players(transfermarkt_url, photo_url, birthdate, position, current_club_name, current_club_badge, nationality_name, nationality_badge, squad_number, injured, stats, goal_api_updated_at, stats_refreshed_at, resolved_at)'
      )
      .or(`from_club_id.eq.${clubId},to_club_id.eq.${clubId}`)
      .not('player_name', 'is', null)
      .not('from_club', 'is', null)
      .not('to_club', 'is', null)
      .order('published_at', { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load club transfers', clubId, error);
          setTransfers([]);
        } else {
          setTransfers(data);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clubId]);

  return { transfers, loading };
}
