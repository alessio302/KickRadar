import { getSupabaseClient } from '../db/supabaseClient.js';
import { fetchAllRows } from '../db/fetchAllRows.js';
import { normalize } from '../util/normalize.js';
import { getTeamSquad } from '../lineups/goalApiClient.js';

// Second attempt at finding duplicate `players` rows for the same real
// person (see diagnoseDuplicatePlayers.js, removed -- GOAL API's own
// global name SEARCH proved unreliable: it returned a single, WRONG
// result for both "Ibrahim Sulemana" -> "Kamal Deen Sulemana" and "Nico
// Williams" -> "Inaki Williams", two pairs of genuinely different real
// players, surviving every tightening pass).
//
// This uses a completely different, much smaller-blast-radius data
// source: the CLUB'S OWN current squad list (getTeamSquad, the same
// endpoint syncPlayerProfiles.js's regular sync already trusts as
// authoritative for "who really plays here"), not a global cross-database
// text search. The question this asks is narrow and factual -- "how many
// real players with this surname does this specific club's roster
// currently carry" -- instead of the earlier broad, fuzzy "who globally
// matches this name best", which is exactly what let two unrelated same-
// surname players from anywhere in the world get confused for each
// other. A club fielding exactly one real "Sulemana" or "Williams" is a
// hard fact this list either does or doesn't support; there's no room
// for a same-surname stranger from a different club/country to sneak in.
async function main() {
  const supabase = getSupabaseClient();

  const players = await fetchAllRows(supabase, 'players', 'id, name, normalized_name, current_club_name, goal_api_id');
  const { data: clubs, error: clubsErr } = await supabase.from('clubs').select('name, goal_api_id').not('goal_api_id', 'is', null);
  if (clubsErr) throw clubsErr;
  const clubGoalApiIdByName = new Map(clubs.map((c) => [c.name, c.goal_api_id]));

  const byClub = new Map();
  for (const p of players) {
    if (!p.current_club_name) continue;
    if (!byClub.has(p.current_club_name)) byClub.set(p.current_club_name, []);
    byClub.get(p.current_club_name).push(p);
  }

  const lastToken = (name) => {
    const parts = normalize(name).trim().split(/\s+/);
    return parts[parts.length - 1];
  };

  const candidates = [];
  for (const [club, roster] of byClub) {
    const byLastToken = new Map();
    for (const p of roster) {
      const key = lastToken(p.name);
      if (!byLastToken.has(key)) byLastToken.set(key, []);
      byLastToken.get(key).push(p);
    }
    for (const [surnameKey, group] of byLastToken) {
      if (group.length < 2) continue;
      const withId = group.filter((p) => p.goal_api_id);
      const withoutId = group.filter((p) => !p.goal_api_id);
      if (withId.length >= 1 && withoutId.length >= 1) {
        candidates.push({ club, surnameKey, withId, withoutId });
      }
    }
  }

  console.log(`Found ${candidates.length} same-club, same-surname group(s) with at least one unresolved row.\n`);

  const clubsNeeded = [...new Set(candidates.map((c) => c.club))];
  const squadByClub = new Map();
  for (const club of clubsNeeded) {
    const goalApiId = clubGoalApiIdByName.get(club);
    if (!goalApiId) {
      console.log(`  [skip club] "${club}" has no known GOAL API club id (likely outside the 5 tracked leagues) -- cannot verify.`);
      continue;
    }
    try {
      const squad = await getTeamSquad(goalApiId);
      squadByClub.set(club, squad);
    } catch (err) {
      console.log(`  [error] squad fetch failed for "${club}": ${err.message}`);
    }
  }

  const confirmedMerges = [];
  const flaggedInconsistent = [];
  const unconfirmed = [];

  for (const { club, surnameKey, withId, withoutId } of candidates) {
    const squad = squadByClub.get(club);
    if (!squad) {
      unconfirmed.push({ club, group: [...withId, ...withoutId], reason: 'no-squad-data' });
      continue;
    }
    const squadMatches = squad.filter((sp) => lastToken(sp.name) === surnameKey);

    if (squadMatches.length !== 1) {
      console.log(
        `  [no confirmation] "${surnameKey}" @ ${club} -- club's real squad currently has ${squadMatches.length} player(s) with this surname (need exactly 1 to safely merge): [${squadMatches.map((s) => s.name).join(', ') || 'none'}]`
      );
      unconfirmed.push({ club, surnameKey, group: [...withId, ...withoutId], reason: `squad-has-${squadMatches.length}` });
      continue;
    }

    const soleSquadMember = squadMatches[0];
    const matchingSibling = withId.find((p) => String(p.goal_api_id) === String(soleSquadMember.id));

    if (!matchingSibling) {
      // The row(s) we already trust with a goal_api_id don't match the
      // club's own single real squad member with this surname -- our own
      // "into" candidate's current_club_name or goal_api_id may itself be
      // stale, not just the "from" row. Flagged for a human, not merged.
      console.log(
        `  [inconsistent] "${surnameKey}" @ ${club} -- squad's sole match is "${soleSquadMember.name}" (id ${soleSquadMember.id}), but none of our own already-resolved row(s) [${withId.map((p) => `${p.name}:${p.goal_api_id}`).join(', ')}] carry that id -- one of OUR rows may have a stale club/id, needs a human look.`
      );
      flaggedInconsistent.push({ club, surnameKey, soleSquadMember, withId, withoutId });
      continue;
    }

    for (const missing of withoutId) {
      console.log(
        `  [MERGE] "${missing.name}" (id ${missing.id}, ${club}) -> club's sole real "${surnameKey}" is "${matchingSibling.name}" (id ${matchingSibling.id}, goal_api_id ${matchingSibling.goal_api_id})`
      );
      confirmedMerges.push({ from: missing, into: matchingSibling, club });
    }
  }

  console.log(`\nConfirmed merge candidates: ${confirmedMerges.length}`);
  console.log(
    JSON.stringify(
      confirmedMerges.map((m) => ({ fromId: m.from.id, fromName: m.from.name, intoId: m.into.id, intoName: m.into.name, club: m.club })),
      null,
      2
    )
  );

  console.log(`\nFlagged inconsistent (needs a human, our own data may be stale): ${flaggedInconsistent.length}`);
  console.log(
    JSON.stringify(
      flaggedInconsistent.map((f) => ({
        club: f.club,
        surname: f.surnameKey,
        squadMember: f.soleSquadMember,
        ourRows: [...f.withId, ...f.withoutId].map((p) => ({ id: p.id, name: p.name, goal_api_id: p.goal_api_id })),
      })),
      null,
      2
    )
  );

  console.log(`\nUnconfirmed (left alone): ${unconfirmed.length}`);
  console.log(
    JSON.stringify(
      unconfirmed.map((u) => ({ club: u.club, surname: u.surnameKey, reason: u.reason, names: u.group.map((p) => p.name) })),
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
