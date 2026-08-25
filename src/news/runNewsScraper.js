import { createHash } from 'node:crypto';
import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { classifyOfficial } from './classify.js';
import { isTransferRelevant } from './relevance.js';
import { extractTransferInfo } from './extract.js';
import { llmExtractTransferInfo } from './llmExtract.js';
import { resolveClub } from './clubMatch.js';
import { resolvePlayerProfile } from './playerProfileResolver.js';
import { normalize } from '../util/normalize.js';
import { sendPushToTransferSubscribers } from '../push/sendPush.js';

import tuttomercatoweb from './sources/tuttomercatoweb.js';
import kicker from './sources/kicker.js';
import skysports from './sources/skysports.js';
import rmcsport from './sources/rmcsport.js';
import marca from './sources/marca.js';

const SOURCES = { tuttomercatoweb, kicker, skysports, rmcsport, marca };

function externalIdFor(item) {
  return createHash('sha256').update(item.guid || item.link).digest('hex');
}

// For comparing club names that never resolve to a curated club id (a club
// outside our 5 tracked leagues, e.g. a Gulf/MLS/Saudi destination in a
// rumor) -- strips everything but letters/digits on top of normalize()'s
// diacritics/case folding, so spelling variants across two articles about
// the same move ("Al Jazira" vs "Al-Jazira") still compare equal.
function dedupeKey(text) {
  return normalize(text || '').replace(/[^a-z0-9]/g, '');
}

// LLM extraction is the primary path (see llmExtract.js for why); the regex
// heuristic only kicks in if the API call itself fails (rate limit, outage,
// missing key), so a bad run degrades to the old behavior instead of losing
// the item entirely.
async function extractInfo(item, clubs, sourceKey) {
  try {
    const result = await llmExtractTransferInfo(item.title, item.summary || item.title);
    return { ...result, source: 'llm' };
  } catch (err) {
    console.warn(`[${sourceKey}] LLM extraction failed, falling back to regex heuristic:`, err.message);
    const isOfficial = classifyOfficial(sourceKey, `${item.title} ${item.summary || ''}`);
    const { playerName, fromClub, toClub } = extractTransferInfo(item.title, clubs, sourceKey);
    return { playerName, fromClub, toClub, isOfficial, source: 'regex' };
  }
}

async function scrapeLeague(supabase, league) {
  const source = SOURCES[league.newsSource];
  if (!source) throw new Error(`No source module for "${league.newsSource}"`);

  const { data: dbLeague, error: leagueErr } = await supabase
    .from('leagues')
    .select('id')
    .eq('slug', league.slug)
    .single();
  if (leagueErr) throw leagueErr;

  // Not scoped to this league: a transfer story routinely involves a club
  // from a different one of our four tracked leagues (Ligue 1's RMC Sport
  // covering a Bundesliga<->Ligue 1 move, say), and resolving only against
  // this league's clubs meant the other side could never get a club_id at
  // all -- confirmed live, this is why Facundo Medina's Marseille/
  // Leverkusen saga never had both sides resolved, which in turn meant the
  // squad-based direction check (needs both sides) never had anything to
  // work with. league_id is carried along so the "does this story actually
  // involve a club from *this* league" gate below can still tell resolved
  // clubs apart by which league they're really in.
  const { data: allClubs, error: clubsErr } = await supabase.from('clubs').select('id, name, aliases, league_id');
  if (clubsErr) throw clubsErr;

  // Only ever process genuinely new items -- avoids re-running the LLM call
  // (and the relevance/player-resolution work) on the same ~150 items every
  // hourly run just because they're still in the source's latest-20/N list.
  //
  // Tracked via seen_news_items, not the transfers table: an item that gets
  // extracted but then rejected (e.g. neither club belongs to this league,
  // see 005) never becomes a transfers row, so checking transfers alone
  // meant a rejected item would be re-fetched and re-run through the LLM on
  // every future run forever -- confirmed live, this is what made a run
  // balloon past 11 minutes after a batch of bad rows got cleaned up.
  const { data: seenRows, error: seenErr } = await supabase
    .from('seen_news_items')
    .select('external_id')
    .eq('source', league.newsSource);
  if (seenErr) throw seenErr;
  const knownIds = new Set(seenRows.map((r) => r.external_id));

  const items = await source.fetchLatest();
  let inserted = 0;
  let skipped = 0;
  let merged = 0;
  const notifiable = [];

  for (const item of items) {
    const externalId = externalIdFor(item);
    if (knownIds.has(externalId)) {
      continue; // already stored from a previous run, nothing to do
    }

    const text = `${item.title} ${item.summary || ''}`;
    if (!isTransferRelevant(league.newsSource, text)) {
      skipped += 1;
      continue;
    }

    const { playerName, fromClub, toClub, isOfficial } = await extractInfo(item, allClubs, league.newsSource);

    // Mark as seen right after paying the LLM cost, regardless of what
    // happens below -- an item rejected for an unrelated league (or a
    // failed transfers upsert) must never be re-extracted on the next run.
    const { error: markSeenErr } = await supabase
      .from('seen_news_items')
      .upsert({ source: league.newsSource, external_id: externalId }, { onConflict: 'source,external_id' });
    if (markSeenErr) console.error(`[${league.slug}] failed to record seen item:`, markSeenErr.message);

    // Resolve to our curated club table when possible -- normalizes naming
    // ("OM" and "Olympique de Marseille" both become the same canonical
    // record) and gives the frontend a real FK for badges/filtering instead
    // of free-standing text. A miss just keeps the raw extracted string.
    // Matched against all five leagues' clubs (see allClubs above), so a
    // cross-league story gets a real club_id on both sides, not just the
    // side that happens to belong to this scraper's own league.
    const fromClubMatch = resolveClub(fromClub, allClubs);
    const toClubMatch = resolveClub(toClub, allClubs);

    // News sources cover transfers well beyond their "home" league (RMC
    // Sport writes about Chelsea-to-Crystal-Palace just as much as
    // Ligue 1) -- confirmed live: filtering the frontend by Ligue 1 showed
    // Alvarez (Atletico -> Arsenal) and Disasi (Chelsea -> Crystal Palace),
    // neither of which has anything to do with France. league_id was being
    // set to "whichever league's scraper found this article" regardless of
    // the actual clubs involved. Require at least one side to actually be a
    // club in *this* league specifically -- now that matches can come from
    // any league, checking that a match merely exists isn't enough anymore.
    const fromInThisLeague = fromClubMatch?.league_id === dbLeague.id;
    const toInThisLeague = toClubMatch?.league_id === dbLeague.id;
    if (!fromInThisLeague && !toInThisLeague) {
      skipped += 1;
      continue;
    }

    let playerId = null;
    if (playerName) {
      try {
        const player = await resolvePlayerProfile(supabase, playerName);
        playerId = player.id;
      } catch (err) {
        console.warn(`[${league.slug}] player profile resolution failed for "${playerName}":`, err.message);
      }
    }

    // Cross-check direction against football-data.org's synced squad data
    // (see squad_memberships / syncSquads.js) -- the actual source of truth
    // for which club a player really plays for, rather than trusting
    // whichever of two independent articles about the same player got the
    // direction right. Confirmed live: two RMC Sport stories had Facundo
    // Medina going both Marseille->Leverkusen and Leverkusen->Marseille at
    // once. Only acts when both sides already resolved to a real club and
    // the squad lookup is unambiguous (exactly one match) -- with no clean
    // signal, the extracted direction is left as-is rather than guessed at.
    let resolvedFromClub = fromClub;
    let resolvedToClub = toClub;
    let resolvedFromMatch = fromClubMatch;
    let resolvedToMatch = toClubMatch;
    if (playerName && fromClubMatch && toClubMatch) {
      const { data: squadRows, error: squadErr } = await supabase
        .from('squad_memberships')
        .select('club_id')
        .eq('normalized_name', normalize(playerName))
        .limit(2);
      if (squadErr) {
        console.error(`[${league.slug}] squad lookup failed:`, squadErr.message);
      } else if (squadRows.length === 1 && squadRows[0].club_id === toClubMatch.id) {
        // The extracted story has the player leaving for the club they're
        // actually already at -- backwards. Flip it.
        resolvedFromClub = toClub;
        resolvedToClub = fromClub;
        resolvedFromMatch = toClubMatch;
        resolvedToMatch = fromClubMatch;
      } else if (
        squadRows.length === 1 &&
        squadRows[0].club_id !== fromClubMatch.id &&
        squadRows[0].club_id !== toClubMatch.id
      ) {
        // The player is confirmed at a *third* club, matching neither side
        // of the extracted story. Same principle as the flip above -- squad
        // data is the source of truth -- applied to the other axis: correct
        // the *from* side to where they actually play instead of discarding
        // a plausible "to" rumor entirely. Confirmed live: "Ange-Yoan Bonny,
        // Parma -> Fiorentina" while squad_memberships already had him at
        // Inter -- Fiorentina interest is real, newsworthy rumor content;
        // "Parma" was simply stale/wrong and is cheaply fixable, so fix it
        // rather than throw the whole story away.
        const realClub = allClubs.find((c) => c.id === squadRows[0].club_id);
        if (realClub) {
          resolvedFromClub = realClub.name;
          resolvedFromMatch = realClub;
        }
      }
    }

    // A story whose from/to resolve to the same club isn't a transfer at
    // all -- confirmed live: "Sivera renueva hasta 2030" (a contract
    // renewal, not a move) was extracted as "Antonio Sivera, Deportivo
    // Alavés -> Deportivo Alavés". marca.js has no relevance.js keyword
    // gate (same as tuttomercatoweb, see relevance.js's comment), so this
    // kind of item relies entirely on llmExtract.js correctly recognizing
    // non-transfer stories -- worth revisiting there too if this keeps
    // showing up, but a same-club "move" is cheap to catch here regardless
    // of why extraction produced it. Compares by id when both sides
    // resolved to a curated club, else by dedupeKey() text (same
    // normalization the duplicate check below uses) -- either way, "no
    // club on either side" (both empty) must NOT count as a match.
    const sameClub = resolvedFromMatch && resolvedToMatch
      ? resolvedFromMatch.id === resolvedToMatch.id
      : dedupeKey(resolvedFromClub) !== '' && dedupeKey(resolvedFromClub) === dedupeKey(resolvedToClub);
    if (sameClub) {
      skipped += 1;
      continue;
    }

    // Multiple articles (often the same outlet, different days) reporting
    // the exact same rumor produce visually identical cards -- confirmed
    // live: "Rafael Leão, AC Milan -> Aston Villa" showed up twice, a few
    // hours apart, and separately "Kristjan Asllani, Inter -> Al Jazira"/
    // "Al-Jazira" (a Gulf club, never in our curated `clubs` table, so
    // to_club_id is always null and the old id-only check below never even
    // ran). Two cards are only a legitimate pair when they disagree on the
    // destination (a player linked to two different clubs is real news);
    // the *same* player+from+to combination is the same story, not two.
    // Only requires the player to be resolved -- club matching then uses
    // the id when a side resolved to a curated club (exact, safe), or a
    // punctuation/diacritic-insensitive text comparison via dedupeKey()
    // when it didn't, so "Al Jazira" and "Al-Jazira" still count as the
    // same destination instead of silently bypassing dedup entirely.
    let duplicateOf = null;
    if (playerId) {
      let candidateQuery = supabase
        .from('transfers')
        .select('id, published_at, is_official, from_club, from_club_id, to_club, to_club_id')
        .eq('player_id', playerId)
        .limit(20);
      // .eq('from_club', null) would NOT match real NULLs -- PostgREST reads
      // a JS `null` value there as the literal string "null", not IS NULL --
      // confirmed live via findDupes.js: a from_club of null is common (many
      // "official signing" headlines only name the new club), so this needs
      // .is() specifically or every one of those never dedupes.
      if (resolvedFromMatch) {
        candidateQuery = candidateQuery.eq('from_club_id', resolvedFromMatch.id);
      } else if (resolvedFromClub) {
        candidateQuery = candidateQuery.eq('from_club', resolvedFromClub);
      } else {
        candidateQuery = candidateQuery.is('from_club', null);
      }
      const { data: candidates, error: dupErr } = await candidateQuery;
      if (dupErr) {
        console.error(`[${league.slug}] duplicate lookup failed:`, dupErr.message);
      } else {
        const targetToKey = dedupeKey(resolvedToMatch?.name ?? resolvedToClub);
        duplicateOf =
          candidates.find((c) =>
            resolvedToMatch ? c.to_club_id === resolvedToMatch.id : dedupeKey(c.to_club) === targetToKey
          ) ?? null;
      }
    }

    if (duplicateOf) {
      const newerPublishedAt =
        new Date(item.publishedAt) > new Date(duplicateOf.published_at) ? item.publishedAt : duplicateOf.published_at;
      const { error: mergeErr } = await supabase
        .from('transfers')
        .update({
          published_at: newerPublishedAt,
          summary: item.summary || item.title,
          source: league.newsSource,
          source_url: item.link,
          // Once confirmed official, a later, less-certain rumor-flavored
          // article about the same move shouldn't walk that back.
          is_official: duplicateOf.is_official || isOfficial,
        })
        .eq('id', duplicateOf.id);
      if (mergeErr) console.error(`[${league.slug}] failed to merge duplicate transfer:`, mergeErr.message);
      else merged += 1;
      continue;
    }

    const { error: upsertErr } = await supabase
      .from('transfers')
      .upsert(
        {
          league_id: dbLeague.id,
          player_id: playerId,
          player_name: playerName,
          from_club: resolvedFromMatch?.name ?? resolvedFromClub,
          to_club: resolvedToMatch?.name ?? resolvedToClub,
          from_club_id: resolvedFromMatch?.id ?? null,
          to_club_id: resolvedToMatch?.id ?? null,
          is_official: isOfficial,
          source: league.newsSource,
          source_url: item.link,
          summary: item.summary || item.title,
          published_at: item.publishedAt,
          external_id: externalId,
        },
        { onConflict: 'source,external_id' }
      );

    if (upsertErr) {
      console.error(`[${league.slug}] failed to upsert transfer:`, upsertErr.message);
      continue;
    }
    inserted += 1;
    // Only worth notifying about if it would actually show as a card (see
    // useTransfers.js's own player_name/from_club/to_club filter) --
    // notifying about a roundup story with no single identifiable player
    // would just be confusing.
    if (playerName) {
      notifiable.push({
        playerName,
        fromClub: resolvedFromMatch?.name ?? resolvedFromClub,
        toClub: resolvedToMatch?.name ?? resolvedToClub,
        league: league.name,
        leagueSlug: league.slug,
      });
    }
  }

  return { inserted, skipped, merged, notifiable };
}

// One notification per transfer, naming the player, so tapping it (or
// just reading it) tells you which card to look for -- confirmed live:
// a grouped "3 neue Transfers" notification didn't say who, and opening
// the app landed on a different, previously-selected league besides,
// so the new transfers weren't even visible without knowing to switch.
// url carries the league so the app can jump straight to it (see sw.js's
// notificationclick and App.jsx's read of the ?league= param).
//
// Capped: a big backlog catch-up run once inserted 63 transfers in a
// single go for Ligue 1 alone -- one push per transfer beyond a handful
// would be a notification storm, so a run past the cap falls back to one
// summary notification instead (steady-state hourly runs stay well under
// it in practice).
const MAX_INDIVIDUAL_NOTIFICATIONS = 8;

function buildNotificationPayloads(notifiable) {
  if (notifiable.length === 0) return [];
  if (notifiable.length > MAX_INDIVIDUAL_NOTIFICATIONS) {
    const countByLeague = new Map();
    for (const t of notifiable) {
      countByLeague.set(t.league, (countByLeague.get(t.league) || 0) + 1);
    }
    const body = [...countByLeague.entries()].map(([league, count]) => `${league} (${count})`).join(', ');
    return [{ title: `${notifiable.length} neue Transfer-Meldungen`, body, url: '/' }];
  }
  return notifiable.map((t) => {
    const body = t.fromClub && t.toClub ? `${t.fromClub} → ${t.toClub} (${t.league})` : `${t.toClub ?? t.fromClub} (${t.league})`;
    return { title: `Neuer Transfer: ${t.playerName}`, body, url: `/?league=${t.leagueSlug}` };
  });
}

export async function runNewsScraper() {
  const supabase = getSupabaseClient();
  const results = {};
  const allNotifiable = [];
  for (const league of LEAGUES) {
    try {
      const result = await scrapeLeague(supabase, league);
      results[league.slug] = { inserted: result.inserted, skipped: result.skipped, merged: result.merged };
      allNotifiable.push(...result.notifiable);
    } catch (err) {
      console.error(`[${league.slug}] scrape failed:`, err.message);
      results[league.slug] = { error: err.message };
    }
  }

  const payloads = buildNotificationPayloads(allNotifiable);
  if (payloads.length > 0) {
    const pushResults = [];
    for (const payload of payloads) {
      try {
        pushResults.push(await sendPushToTransferSubscribers(payload));
      } catch (err) {
        // Missing/misconfigured VAPID keys or a send failure shouldn't fail
        // the whole scrape run -- the transfers are already stored either way.
        console.error('Push notification send failed:', err.message);
      }
    }
    results.push = pushResults;
  }

  return results;
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  runNewsScraper()
    .then((results) => {
      console.log('News scrape complete:', results);
    })
    .catch((err) => {
      console.error('News scrape failed:', err);
      process.exitCode = 1;
    });
}
