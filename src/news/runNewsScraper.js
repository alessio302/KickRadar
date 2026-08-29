import { createHash } from 'node:crypto';
import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { classifyOfficial } from './classify.js';
import { isTransferRelevant } from './relevance.js';
import { extractTransferInfo } from './extract.js';
import { llmExtractTransferInfo } from './llmExtract.js';
import { fetchArticleText } from './articleBody.js';
import { resolveClub } from './clubMatch.js';
import { resolvePlayerProfile } from './playerProfileResolver.js';
import { normalize } from '../util/normalize.js';
import { sendPushToTransferSubscribers } from '../push/sendPush.js';
import { pushStringsFor, SUPPORTED_PUSH_LANGUAGES } from '../push/pushI18n.js';

import tuttomercatoweb from './sources/tuttomercatoweb.js';
import kicker from './sources/kicker.js';
import skysports from './sources/skysports.js';
import footmercato from './sources/footmercato.js';
import marca from './sources/marca.js';

const SOURCES = { tuttomercatoweb, kicker, skysports, footmercato, marca };

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

// Looks up a player's real current club (+ real full name) from
// football-data.org's synced squad data (source of truth for direction
// corrections/backfills below) -- syncSquads.js stores both normalized_name
// and the original, properly-cased player_name from football-data.org's own
// squad list, so the same lookup that recovers the club can recover the
// full name too, essentially for free.
//
// Only trusts a FULL name (the extracted name contains a space). A bare
// single word -- whether a mononym ("Vitinha") or a bare surname ("Ricci")
// -- can be genuinely ambiguous: squad_memberships only covers 5 leagues'
// current rosters, so "exactly one match in our table" only means "the
// only one we happen to track," not "the only player with this name in the
// world." Confirmed live: a story about Olympique de Marseille's Vitinha
// moving to Rennes had its already-correct from_club silently overwritten
// to PSG, because PSG's own Vitinha -- a different, unrelated real player
// -- was the only "Vitinha" in our squad data. Growing our own squad
// coverage doesn't fix this: more players tracked means MORE short-name
// collisions, not fewer, and a transfer can always involve a club outside
// our 5 leagues we'd never have squad data for anyway. Gemini already
// resolves the player correctly from the article's own context in cases
// like this; a bare-name match against an inherently partial internal list
// must never be allowed to override that.
//
// This used to also recover a bare surname ("Ricci al Como") via a
// suffix match against full names in squad_memberships -- removed for the
// identical reason, just a different real-world example of the same risk
// (a single word coincidentally unique in our own limited table).
export async function lookupSquadMembership(supabase, playerName) {
  const normName = normalize(playerName);
  if (!normName.includes(' ')) return null; // bare single word -- too ambiguous to trust, see above

  const { data: exactRows, error: exactErr } = await supabase
    .from('squad_memberships')
    .select('club_id, player_name')
    .eq('normalized_name', normName)
    .limit(2);
  if (exactErr) throw exactErr;
  return exactRows.length === 1 ? { clubId: exactRows[0].club_id, fullName: exactRows[0].player_name } : null;
}

// resolvePlayerProfile() matches players by an EXACT normalized_name
// lookup, so two articles about the same real player using different name
// forms ("Kristjan Asllani" in one, just "Asllani" -- a shorter follow-up
// headline -- in another) resolve to two different `players` rows with two
// different ids. Confirmed live: exactly that pair inserted as two visibly
// duplicate cards a couple hours apart, because the id-based duplicate
// check below never saw them as the same player. Fixing resolution itself
// to fuzzy-match by surname was rejected -- that risks silently merging
// two genuinely *different* real players who share a surname into one
// transfermarkt profile, which is a worse failure than an occasional
// missed duplicate. Instead, treat one extracted name as a variant of
// another when every word of the shorter one appears in the longer one --
// this only gets consulted below alongside a matching destination club, so
// two unrelated same-surname players would also need to be linked to the
// exact same club at the same time to false-positive.
function isNameVariant(a, b) {
  const wordsA = new Set(normalize(a || '').split(/\s+/).filter(Boolean));
  const wordsB = new Set(normalize(b || '').split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  const [smaller, bigger] = wordsA.size <= wordsB.size ? [wordsA, wordsB] : [wordsB, wordsA];
  return [...smaller].every((w) => bigger.has(w));
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
    // The regex heuristic has no way to produce real prose -- aiSummary
    // stays null rather than faking one from the headline alone, same
    // "don't guess" policy as everywhere else in this fallback path.
    return { playerName, fromClub, toClub, isOfficial, aiSummary: null, source: 'regex' };
  }
}

// aiSummary is either null (regex fallback, or the LLM decided this isn't
// really a single-player transfer story) or an object with all 5 language
// keys -- either way, spreads into the 5 actual `ai_summary_<lang>` DB
// columns without the caller needing to know which case it is.
function aiSummaryColumns(aiSummary) {
  return {
    ai_summary_de: aiSummary?.de ?? null,
    ai_summary_en: aiSummary?.en ?? null,
    ai_summary_it: aiSummary?.it ?? null,
    ai_summary_fr: aiSummary?.fr ?? null,
    ai_summary_es: aiSummary?.es ?? null,
  };
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
  const { data: allClubs, error: clubsErr } = await supabase.from('clubs').select('id, name, short_name, aliases, league_id');
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

    // Extract from the actual article body, not just the headline (+ up to
    // 400 chars of RSS description for tuttomercatoweb/kicker -- marca,
    // rmcsport and skysports had only the headline at all, since list/
    // sitemap pages don't carry per-item body text). Confirmed live: a
    // headline-only item ("Joan Laporta: 'Seguimos muy interesados en
    // Julián Alvarez'") gave the LLM nothing but the bare word "Barcelona"
    // to work with for the destination club, and no from_club at all --
    // both are routinely stated explicitly in the article body itself.
    // Only fetched here, after the known-item and relevance gates above, so
    // this never costs a request for an item that wouldn't have reached
    // the LLM anyway. A failed fetch (network error, block, empty page)
    // just falls back to the headline/RSS summary as before -- extraction
    // is never blocked on this succeeding.
    const articleText = await fetchArticleText(item.link);
    const extractionItem = articleText ? { ...item, summary: articleText } : item;

    const { playerName, fromClub, toClub, isOfficial, aiSummary } = await extractInfo(extractionItem, allClubs, league.newsSource);

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

    // Cross-check direction (+ recover the player's full name, see
    // lookupSquadMembership()) against football-data.org's synced squad
    // data (see squad_memberships / syncSquads.js) -- the actual source of
    // truth for which club a player really plays for, rather than trusting
    // whichever of two independent articles about the same player got the
    // direction right. Confirmed live: two RMC Sport stories had Facundo
    // Medina going both Marseille->Leverkusen and Leverkusen->Marseille at
    // once. Only acts when both sides already resolved to a real club and
    // the squad lookup is unambiguous (exactly one match) -- with no clean
    // signal, the extracted direction is left as-is rather than guessed at.
    //
    // Runs before resolvePlayerProfile() below on purpose: that function
    // creates a new `players` row (and searches transfermarkt.de) using
    // whatever name it's given verbatim. Confirmed live: "Ricci" alone
    // would search transfermarkt for "Ricci" and could easily land on a
    // *different* real footballer who happens to share the surname --
    // resolving the full name here first, before that search ever runs,
    // fixes it at the source instead of only patching the displayed name
    // afterwards.
    let resolvedFromClub = fromClub;
    let resolvedToClub = toClub;
    let resolvedFromMatch = fromClubMatch;
    let resolvedToMatch = toClubMatch;
    let resolvedPlayerName = playerName;
    if (playerName && fromClubMatch && toClubMatch) {
      let membership;
      try {
        membership = await lookupSquadMembership(supabase, playerName);
      } catch (err) {
        console.error(`[${league.slug}] squad lookup failed:`, err.message);
      }
      if (membership) resolvedPlayerName = membership.fullName;
      if (membership?.clubId === toClubMatch.id) {
        // The extracted story has the player leaving for the club they're
        // actually already at -- backwards. Flip it.
        resolvedFromClub = toClub;
        resolvedToClub = fromClub;
        resolvedFromMatch = toClubMatch;
        resolvedToMatch = fromClubMatch;
      } else if (membership && membership.clubId !== fromClubMatch.id && membership.clubId !== toClubMatch.id) {
        // The player is confirmed at a *third* club, matching neither side
        // of the extracted story. Same principle as the flip above -- squad
        // data is the source of truth -- applied to the other axis: correct
        // the *from* side to where they actually play instead of discarding
        // a plausible "to" rumor entirely. Confirmed live: "Ange-Yoan Bonny,
        // Parma -> Fiorentina" while squad_memberships already had him at
        // Inter -- Fiorentina interest is real, newsworthy rumor content;
        // "Parma" was simply stale/wrong and is cheaply fixable, so fix it
        // rather than throw the whole story away.
        const realClub = allClubs.find((c) => c.id === membership.clubId);
        if (realClub) {
          resolvedFromClub = realClub.name;
          resolvedFromMatch = realClub;
        }
      }
    } else if (playerName && !fromClubMatch && toClubMatch) {
      // The article only named the destination -- common for "official
      // signing" headlines ("X ficha por Y") that don't mention where the
      // player came from. Confirmed live: this left the from_club/from_club_id
      // permanently null for a majority of a single Marca batch (Bouare,
      // Ratkov, Saliba, Driouech, Jonathan Jesus all null->club), and
      // useTransfers.js requires both sides non-null to display a card at
      // all -- real, relevant news was silently invisible in the app
      // forever, not just until a fuller follow-up (which usually never
      // comes for this kind of story). Same source-of-truth idea as the
      // block above, just recovering a missing side instead of correcting a
      // wrong one: if squad_memberships unambiguously has this player at a
      // club other than the destination, that's their real prior club.
      // Squad data only reflects the *current* roster (no transfer-history
      // concept), so this can't recover a case where the sync already
      // caught up to the new club -- in that case the lookup returns
      // toClubMatch.id and nothing is backfilled, same as today's behavior.
      let membership;
      try {
        membership = await lookupSquadMembership(supabase, playerName);
      } catch (err) {
        console.error(`[${league.slug}] squad lookup failed:`, err.message);
      }
      if (membership) resolvedPlayerName = membership.fullName;
      if (membership && membership.clubId !== toClubMatch.id) {
        const realClub = allClubs.find((c) => c.id === membership.clubId);
        if (realClub) {
          resolvedFromClub = realClub.name;
          resolvedFromMatch = realClub;
        }
      }
    }

    let playerId = null;
    if (resolvedPlayerName) {
      try {
        const player = await resolvePlayerProfile(supabase, resolvedPlayerName, [resolvedFromClub, resolvedToClub]);
        playerId = player.id;
      } catch (err) {
        console.warn(`[${league.slug}] player profile resolution failed for "${resolvedPlayerName}":`, err.message);
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
    // live twice now: "Rafael Leão, AC Milan -> Aston Villa" showed up
    // twice, a few hours apart, and separately "Kristjan Asllani, Inter ->
    // Al Jazira" / "Asllani, Inter -> Al-Jazira" (a Gulf club, never in our
    // curated `clubs` table, so to_club_id is always null -- and, the
    // second time, a shorter follow-up headline that only used the
    // player's surname, which is a different `players` row/id than the
    // first article's full name, see isNameVariant() above). Two cards are
    // only a legitimate pair when they disagree on the destination (a
    // player linked to two different clubs is real news); the *same*
    // player+from+to combination is the same story, not two. Club matching
    // uses the id when a side resolved to a curated club (exact, safe), or
    // a punctuation/diacritic-insensitive text comparison via dedupeKey()
    // when it didn't, so "Al Jazira" and "Al-Jazira" still count as the
    // same destination instead of silently bypassing dedup entirely.
    let duplicateOf = null;
    if (resolvedPlayerName) {
      // Scoped by from-club (not player_id, see isNameVariant() above) and
      // recency-bounded, so a name-variant fragmented across two `players`
      // rows still gets caught. .eq('from_club', null) would NOT match real
      // NULLs -- PostgREST reads a JS `null` value there as the literal
      // string "null", not IS NULL -- confirmed live via findDupes.js: a
      // from_club of null is common (many "official signing" headlines only
      // name the new club), so this needs .is() specifically or every one
      // of those never dedupes.
      let candidateQuery = supabase
        .from('transfers')
        .select('id, published_at, is_official, from_club, from_club_id, to_club, to_club_id, player_id, player_name')
        .order('published_at', { ascending: false })
        .limit(30);
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
          candidates.find((c) => {
            const sameTo = resolvedToMatch ? c.to_club_id === resolvedToMatch.id : dedupeKey(c.to_club) === targetToKey;
            if (!sameTo) return false;
            return (playerId && c.player_id === playerId) || isNameVariant(resolvedPlayerName, c.player_name);
          }) ?? null;
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
          ...aiSummaryColumns(aiSummary),
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

    const finalFromClub = resolvedFromMatch?.name ?? resolvedFromClub;
    const finalToClub = resolvedToMatch?.name ?? resolvedToClub;

    const { error: upsertErr } = await supabase
      .from('transfers')
      .upsert(
        {
          league_id: dbLeague.id,
          player_id: playerId,
          player_name: resolvedPlayerName,
          from_club: finalFromClub,
          to_club: finalToClub,
          from_club_id: resolvedFromMatch?.id ?? null,
          to_club_id: resolvedToMatch?.id ?? null,
          is_official: isOfficial,
          source: league.newsSource,
          source_url: item.link,
          summary: item.summary || item.title,
          ...aiSummaryColumns(aiSummary),
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
    // Only worth notifying about if it would actually show as a card --
    // confirmed live: a push fired for "Luis Henrique, FC Internazionale
    // Milano -> [no to_club]" (the article only named the club he's
    // already linked with, no origin), the user tapped it, and found
    // nothing, because useTransfers.js requires BOTH from_club and
    // to_club non-null to display a row at all. This comment already
    // claimed that match existed; the actual condition below just checked
    // playerName and let incomplete rows notify anyway. Requiring all
    // three here now actually enforces it.
    if (resolvedPlayerName && finalFromClub && finalToClub) {
      notifiable.push({
        playerName: resolvedPlayerName,
        fromClub: finalFromClub,
        toClub: finalToClub,
        league: league.name,
        leagueSlug: league.slug,
        isOfficial,
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

// Returns an array of payloadsByLanguage maps (one per notification to
// send, each itself keyed by language code -- de/en/it/fr/es) rather than
// a single fixed-language payload, so sendPushToTransferSubscribers can
// hand each subscriber the variant matching their own stored language
// (push_subscriptions.language). Club/player/league names are never
// translated here, same policy as the frontend's own translations.js.
function buildNotificationPayloads(notifiable) {
  if (notifiable.length === 0) return [];
  if (notifiable.length > MAX_INDIVIDUAL_NOTIFICATIONS) {
    const countByLeague = new Map();
    for (const t of notifiable) {
      countByLeague.set(t.league, (countByLeague.get(t.league) || 0) + 1);
    }
    const body = [...countByLeague.entries()].map(([league, count]) => `${league} (${count})`).join(', ');
    const byLanguage = {};
    for (const lang of SUPPORTED_PUSH_LANGUAGES) {
      byLanguage[lang] = { title: pushStringsFor(lang).summaryTitle(notifiable.length), body, url: '/' };
    }
    return [byLanguage];
  }
  return notifiable.map((t) => {
    // Both clubs are guaranteed non-null here -- notifiable only ever
    // collects rows that satisfy useTransfers.js's own display filter,
    // see where it's built above.
    const body = `${t.fromClub} → ${t.toClub} (${t.league})`;
    const byLanguage = {};
    for (const lang of SUPPORTED_PUSH_LANGUAGES) {
      const prefix = t.isOfficial ? pushStringsFor(lang).official : pushStringsFor(lang).rumor;
      byLanguage[lang] = { title: `${prefix}: ${t.playerName}`, body, url: `/?league=${t.leagueSlug}` };
    }
    return byLanguage;
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
