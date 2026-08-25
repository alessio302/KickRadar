import { getSupabaseClient } from '../db/supabaseClient.js';
import { normalize } from '../util/normalize.js';

const BASE_URL = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';

async function getTeamSquad(externalTeamId) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) throw new Error('Missing FOOTBALL_DATA_API_KEY env var.');
  const res = await fetch(`${BASE_URL}/teams/${externalTeamId}`, { headers: { 'X-Auth-Token': apiKey } });
  if (!res.ok) throw new Error(`GET /teams/${externalTeamId} failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.squad || [];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Syncs every club's current squad (across all five leagues, since a
// transfer story frequently involves clubs from two different ones) so
// runNewsScraper.js can resolve transfer direction against a real "where
// does this player actually play" signal instead of guessing between two
// conflicting articles. Replaces each club's rows wholesale rather than
// upserting -- a player who moved on must disappear from their old club's
// squad here, not linger as a stale leftover (see 007's comment for the
// exact failure this avoids).
export async function syncAllSquads() {
  const supabase = getSupabaseClient();

  const { data: clubs, error: clubsErr } = await supabase
    .from('clubs')
    .select('id, name, external_team_id')
    .not('external_team_id', 'is', null);
  if (clubsErr) throw clubsErr;

  const results = {};
  for (const club of clubs) {
    try {
      const squad = await getTeamSquad(club.external_team_id);

      const { error: deleteErr } = await supabase.from('squad_memberships').delete().eq('club_id', club.id);
      if (deleteErr) throw deleteErr;

      if (squad.length > 0) {
        const rows = squad.map((p) => ({
          club_id: club.id,
          external_player_id: p.id,
          player_name: p.name,
          normalized_name: normalize(p.name),
          position: p.position,
        }));
        const { error: insertErr } = await supabase.from('squad_memberships').insert(rows);
        if (insertErr) throw insertErr;
      }
      results[club.name] = squad.length;
    } catch (err) {
      console.error(`Squad sync failed for ${club.name}:`, err.message);
      results[club.name] = { error: err.message };
    }
    // Free tier: 10 requests/minute. 6.5s spacing keeps a comfortable
    // margin -- ~95 clubs across 5 leagues takes ~10 minutes end to end.
    await sleep(6500);
  }
  return results;
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncAllSquads()
    .then((results) => {
      console.log('Squad sync complete:', results);
    })
    .catch((err) => {
      console.error('Squad sync failed:', err);
      process.exitCode = 1;
    });
}
