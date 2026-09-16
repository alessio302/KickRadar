import { getSupabaseClient } from '../db/supabaseClient.js';
import { fetchAllRows } from '../db/fetchAllRows.js';
import { normalize } from '../util/normalize.js';
import { searchPlayers } from '../lineups/goalApiClient.js';

// Follow-up to the surname-collision fix (PR #116): that fix resolves TWO
// genuinely different real players sharing a surname (Inter's Lautaro
// Martinez vs Josep Martinez). This investigates a DIFFERENT bug the user
// spotted -- ONE real player represented by TWO separate `players` rows
// under different name spellings (confirmed live: Napoli's "Frank
// Anguissa" and "André Zambo Anguissa" are the same person,
// André-Frank Zambo Anguissa). playerProfileResolver.js's own
// resolvePlayerProfile() only ever looked up an existing row by exact
// normalized_name, so a news story using a different spelling than the
// squad sync created a brand-new row instead of finding the real one --
// now fixed going forward (goal_api_id cross-check added), but this
// script finds whatever duplicates already exist.
//
// Deliberately does NOT auto-merge anything by string similarity alone --
// same "no match beats a wrong match" principle this codebase applies
// everywhere else (resolveClub(), season-stats collision handling, etc.).
// Two players sharing a surname with DIFFERENT first-name initials can be
// either a real duplicate (same person, different name variant) or two
// genuinely different squad-mates -- unlike the Martinez case, initials
// can't distinguish them. The only reliable signal is GOAL API's own
// player id: this re-runs a live name search for each candidate missing a
// goal_api_id and checks whether it now resolves to the SAME id a
// same-club sibling already has. Only that positive, external
// confirmation is reported as a real merge candidate.
async function main() {
  const supabase = getSupabaseClient();

  const players = await fetchAllRows(supabase, 'players', 'id, name, normalized_name, current_club_name, goal_api_id');
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
    for (const [, group] of byLastToken) {
      if (group.length < 2) continue;
      const withId = group.filter((p) => p.goal_api_id);
      const withoutId = group.filter((p) => !p.goal_api_id);
      if (withId.length >= 1 && withoutId.length >= 1) {
        candidates.push({ club, withId, withoutId });
      }
    }
  }

  console.log(`Found ${candidates.length} same-club, same-surname group(s) with at least one unresolved row.\n`);

  const confirmedMerges = [];
  const unconfirmed = [];

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  for (const { club, withId, withoutId } of candidates) {
    for (const missing of withoutId) {
      await sleep(1500); // pace against the shared GOAL API rate limit
      let results;
      try {
        results = await searchPlayers(missing.name);
      } catch (err) {
        console.log(`  [error] search failed for "${missing.name}" (${club}): ${err.message}`);
        unconfirmed.push({ club, missing, reason: 'search-error' });
        continue;
      }
      const resultIds = new Set(results.map((r) => String(r.id)));
      const matchingSibling = withId.find((p) => resultIds.has(String(p.goal_api_id)));
      if (matchingSibling) {
        console.log(
          `  [MERGE] "${missing.name}" (id ${missing.id}, ${club}) -> same GOAL API id as "${matchingSibling.name}" (id ${matchingSibling.id}, goal_api_id ${matchingSibling.goal_api_id})`
        );
        confirmedMerges.push({ from: missing, into: matchingSibling, club });
      } else {
        console.log(
          `  [no confirmation] "${missing.name}" (id ${missing.id}, ${club}) -- search returned ${results.length} result(s), none matching sibling(s) [${withId.map((p) => `${p.name}:${p.goal_api_id}`).join(', ')}]`
        );
        unconfirmed.push({ club, missing, reason: 'no-id-match', searchResultCount: results.length });
      }
    }
  }

  console.log(`\nConfirmed merge candidates: ${confirmedMerges.length}`);
  console.log(JSON.stringify(confirmedMerges.map((m) => ({ fromId: m.from.id, fromName: m.from.name, intoId: m.into.id, intoName: m.into.name, club: m.club })), null, 2));

  console.log(`\nUnconfirmed (left alone): ${unconfirmed.length}`);
  console.log(JSON.stringify(unconfirmed.map((u) => ({ id: u.missing.id, name: u.missing.name, club: u.club, reason: u.reason })), null, 2));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
