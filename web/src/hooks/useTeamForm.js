import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const FORM_LIMIT = 5;

// Result letter from clubId's own perspective, not the raw home/away score
// order -- a fixture row doesn't know or care which side is "us".
function resultFor(fixture, clubId) {
  const isHome = fixture.home_club_id === clubId;
  const own = isHome ? fixture.home_score : fixture.away_score;
  const opp = isHome ? fixture.away_score : fixture.home_score;
  if (own > opp) return 'W';
  if (own < opp) return 'L';
  return 'D';
}

// Last FORM_LIMIT finished results for one club, oldest first (so the most
// recent match reads as the rightmost circle, matching how the row is
// meant to be scanned left-to-right). Early in a season there just aren't
// 5 results yet -- callers render however many come back, not a fixed 5
// slots with empty placeholders.
export function useTeamForm(clubId) {
  const [form, setForm] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clubId == null) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('fixtures')
      .select('id, home_club_id, away_club_id, home_score, away_score, kickoff_at')
      .eq('status', 'finished')
      .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
      .order('kickoff_at', { ascending: false })
      .limit(FORM_LIMIT)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load team form for club', clubId, error);
          setForm([]);
          setLoading(false);
          return;
        }
        const results = [...data].reverse().map((f) => ({ fixtureId: f.id, result: resultFor(f, clubId) }));
        setForm(results);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  return { form, loading };
}
