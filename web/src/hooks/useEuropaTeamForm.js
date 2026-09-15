import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const FORM_LIMIT = 5;

// Name-keyed counterpart to useTeamForm.js (club_id-keyed) -- European
// fixtures have no clubs table row, so home_team_name/away_team_name is
// all there is to match on (see syncEuropeanFixtures.js's own comment).
// Only ever sees fixtures that themselves carry a team_name, i.e. UEFA
// competition matches -- a team's domestic-league form doesn't show up
// here, same gap useTeamForm.js has in the other direction (a domestic
// club's European results never show up in its own Form widget, since
// those fixtures carry no club_id either). Fixing that symmetrically
// would need a real cross-competition data source; out of scope here.
function resultFor(fixture, teamName) {
  const isHome = fixture.home_team_name === teamName;
  const own = isHome ? fixture.home_score : fixture.away_score;
  const opp = isHome ? fixture.away_score : fixture.home_score;
  if (own > opp) return 'W';
  if (own < opp) return 'L';
  return 'D';
}

// PostgREST's `.or()` filter string needs a value containing a comma,
// parenthesis or double-quote escaped/quoted -- club/team names occasionally
// have one of these (e.g. "Sporting CP (women)" doesn't happen here, but a
// bare apostrophe or an accented name with an embedded comma isn't
// impossible). Wrapping in double quotes and escaping embedded ones covers
// it; useTeamForm.js's own club_id equivalent is a plain integer and never
// needed this.
function orEq(field, value) {
  return `${field}.eq."${String(value).replace(/"/g, '\\"')}"`;
}

export function useEuropaTeamForm(teamName) {
  const [form, setForm] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamName) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('fixtures')
      .select('id, home_team_name, away_team_name, home_score, away_score, kickoff_at')
      .eq('status', 'finished')
      .or(`${orEq('home_team_name', teamName)},${orEq('away_team_name', teamName)}`)
      .order('kickoff_at', { ascending: false })
      .limit(FORM_LIMIT)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load Europa team form for', teamName, error);
          setForm([]);
          setLoading(false);
          return;
        }
        const results = [...data].reverse().map((f) => ({ fixtureId: f.id, result: resultFor(f, teamName) }));
        setForm(results);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamName]);

  return { form, loading };
}
