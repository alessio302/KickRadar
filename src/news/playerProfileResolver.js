import * as cheerio from 'cheerio';
import { normalize } from '../util/normalize.js';

const TRANSFERMARKT_BASE = 'https://www.transfermarkt.de';

function quickSearchUrl(playerName) {
  return `${TRANSFERMARKT_BASE}/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(playerName)}`;
}

// Scrapes transfermarkt's quick-search results for the first player profile
// link. Falls back to the search URL itself (per briefing: "Fallback auf
// Schnellsuche") when no direct profile can be resolved.
async function lookupTransfermarktUrl(playerName) {
  const searchUrl = quickSearchUrl(playerName);
  try {
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KickRadarBot/1.0)' },
    });
    if (!res.ok) return { url: searchUrl, resolved: false };

    const html = await res.text();
    const $ = cheerio.load(html);
    const firstProfileLink = $('a[href*="/profil/spieler/"]').first().attr('href');
    if (firstProfileLink) {
      return { url: new URL(firstProfileLink, TRANSFERMARKT_BASE).toString(), resolved: true };
    }
    return { url: searchUrl, resolved: false };
  } catch {
    return { url: searchUrl, resolved: false };
  }
}

// Resolves and caches a player's transfermarkt.de profile URL. `getPlayerId`
// callers should pass a Supabase client; resolution happens once per player
// name (normalized), subsequent calls hit the cache.
export async function resolvePlayerProfile(supabase, playerName) {
  const normalized = normalize(playerName);

  const { data: existing, error: lookupErr } = await supabase
    .from('players')
    .select('id, transfermarkt_url')
    .eq('normalized_name', normalized)
    .maybeSingle();
  if (lookupErr) throw lookupErr;
  if (existing) return existing;

  const { url } = await lookupTransfermarktUrl(playerName);

  const { data: inserted, error: insertErr } = await supabase
    .from('players')
    .insert({
      name: playerName,
      normalized_name: normalized,
      transfermarkt_url: url,
      resolved_at: new Date().toISOString(),
    })
    .select('id, transfermarkt_url')
    .single();
  if (insertErr) throw insertErr;

  return inserted;
}
