import { GoogleGenAI, Type } from '@google/genai';
import { recordGeminiUsage } from './geminiUsageTracker.js';

// Regex-based extraction (extract.js) hit a hard ceiling: RMC Sport alone
// needed five rounds of prefix/stopword patches (confirmed live each time)
// and still produced garbage like "MercatoMercato" or missed club
// nicknames not in our alias list ("Barça"). Free-text NER across four
// languages is exactly the kind of task a small LLM handles far more
// robustly than pattern matching.
//
// Uses Google's Gemini API free tier (no credit card required, generous
// daily quota for Flash-Lite -- comfortably covers this project's volume
// of a few dozen genuinely-new items/day) rather than a paid API, per the
// project's "stay free at this scope" constraint. This replaces
// extract.js + classify.js as the primary path; the regex versions are
// kept only as a fallback for when the API call itself fails (rate limit,
// outage, missing key).
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    playerName: {
      type: Type.STRING,
      nullable: true,
      description:
        "The player's full name this story is centrally about, or null if no single player is clearly identifiable (multi-player roundup, non-transfer story, etc.). Use the fullest form of the name found anywhere in the given text -- if the headline only gives a bare surname (e.g. \"Pedersen\") but the summary text spells out the full name (e.g. \"Marcus Pedersen\"), extract the full form, not just whatever the headline itself literally says. Only fall back to the shorter form if the full name never appears anywhere in the given text.",
    },
    fromClub: {
      type: Type.STRING,
      nullable: true,
      description:
        "The player's current club (the one they'd be leaving), or null if not stated/unclear. This includes \"club X wants to sell/is open to selling player\" stories with no named buyer -- that's still fromClub = X, toClub = null, NOT toClub = X.",
    },
    toClub: {
      type: Type.STRING,
      nullable: true,
      description:
        'The new/destination club the player would join, or null if no specific destination is named. Never the club the player is already at.',
    },
    isOfficial: {
      type: Type.BOOLEAN,
      description: 'True only if the deal is confirmed/done (e.g. "ufficiale", "offiziell", "confirmed", "signs", "s\'engage", "officiel"). False for rumors, negotiations, links, or interest.',
    },
    // One summary per app language (see web/src/i18n/languages.js), not
    // one field -- a transfer row is shown to every viewer regardless of
    // their own app language, so a single-language summary would only
    // ever serve readers of that one language. Asking for all 5 here costs
    // no extra API calls (still one request per article), just a larger
    // JSON response -- cheap on Flash-Lite's free tier compared to the
    // 15 req/min *request* ceiling this whole pipeline is actually
    // throttled by (see MIN_CALL_INTERVAL_MS below).
    aiSummary: {
      type: Type.OBJECT,
      nullable: true,
      description:
        "A 2-3 sentence summary of the article's actual content -- what's concretely stated (interest, talks, fee, contract length, quotes), not just restating the headline -- written independently in EACH of the 5 languages below, not translated from one draft (so idiom/tone reads naturally in each). Null under the same condition playerName is null (not really a single-player transfer story); when null, leave every language field null too.",
      properties: {
        de: { type: Type.STRING, nullable: true, description: 'German summary.' },
        en: { type: Type.STRING, nullable: true, description: 'English summary.' },
        it: { type: Type.STRING, nullable: true, description: 'Italian summary.' },
        fr: { type: Type.STRING, nullable: true, description: 'French summary.' },
        es: { type: Type.STRING, nullable: true, description: 'Spanish summary.' },
      },
      required: ['de', 'en', 'it', 'fr', 'es'],
    },
  },
  required: ['playerName', 'fromClub', 'toClub', 'isOfficial', 'aiSummary'],
};

const SYSTEM_INSTRUCTION = `You extract structured data from a single football (soccer) transfer-market news headline and summary, written in Italian, German, English, or French. Use player/club names as they commonly appear in football media (don't translate those). If the story isn't really about one specific player's transfer (e.g. it's a roundup of several players, a match report, an interview with no transfer content, or a lineup/team-selection/fitness update about a player's current club) -- set playerName, fromClub, toClub, and aiSummary to null and isOfficial to false, even if the text names other clubs for context (a former club, an upcoming opponent, etc.).

Watch specifically for a player's FORMER club mentioned only as biography ("l'ex Bologna", "ex-Milan", "former Chelsea player", "ehemals bei Bayern", "qui a joué à..."): that is background, not a live transfer. Never turn it into fromClub or toClub unless the text is actually reporting that specific move happening now -- confirmed live: an article entirely about a player possibly starting for his CURRENT club (Juventus) against an upcoming opponent, which only mentioned "l'ex Bologna" in passing to describe his football history, was wrongly extracted as a Juventus -> Bologna transfer.

Be careful with direction: when a headline is about a club selling, being open to selling, or trying to offload a player -- with no specific buying club named -- that club is fromClub, never toClub, even though it's the only club mentioned. toClub is exclusively the destination the player would move to.`;

let client;
function getClient() {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY env var.');
  }
  client = new GoogleGenAI({ apiKey });
  return client;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Moved BACK to gemini-3.5-flash-lite (2026-09-30) -- this file switched to
// gemini-3.6-flash believing it had 1,500 RPD (see this repo's own prior
// comment history), but a live RESOURCE_EXHAUSTED response from THIS exact
// model, TODAY, states plainly: "limit: 20, model: gemini-3.6-flash". That
// 1,500 figure was wrong (or the free tier was cut since) -- 20 RPD is
// nowhere near enough for this pipeline's real volume (hundreds of
// genuinely-new items/day across 6 sources), and gemini_usage's own
// 1,100-1,700 "requests"/day for this model was never real usage: it was
// this file retrying the same guaranteed-429 call for every single new
// item, all day, for nothing (confirmed live, 2026-09-30: the very FIRST
// call of one run already 429'd, and the transfers table shows only ~15%
// of the last 14 days' rows got a real AI summary -- the other ~85% were
// silently running on the regex fallback the whole time). Back on
// gemini-3.5-flash-lite's real 500 RPD -- shared with News's own
// llmSummarizeNews.js, so still not enough for combined demand, but at
// least an actually usable budget instead of a 20-request mirage.
const MIN_CALL_INTERVAL_MS = 6500;
let lastCallAt = 0;

async function throttle() {
  const wait = lastCallAt + MIN_CALL_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

export async function llmExtractTransferInfo(title, summary) {
  const ai = getClient();
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

  await throttle();
  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: `Headline: ${title}\nSummary: ${summary}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });
  } finally {
    // Recorded regardless of outcome -- a rejected/erroring call still
    // counts against Gemini's own RPD, same principle as goalApiClient.js's
    // recordUsage() (see gemini_usage/sql/068's own comment).
    await recordGeminiUsage(model);
  }

  if (!response.text) {
    throw new Error('LLM extraction returned no text');
  }
  return JSON.parse(response.text);
}
