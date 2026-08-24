import { GoogleGenAI, Type } from '@google/genai';

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
      description: "The player's full name this story is centrally about, or null if no single player is clearly identifiable (multi-player roundup, non-transfer story, etc.).",
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
  },
  required: ['playerName', 'fromClub', 'toClub', 'isOfficial'],
};

const SYSTEM_INSTRUCTION = `You extract structured data from a single football (soccer) transfer-market news headline and summary, written in Italian, German, English, or French. Use the names as they commonly appear in football media (don't translate them). If the story isn't really about one specific player's transfer (e.g. it's a roundup of several players, a match report, an interview with no transfer content), set playerName, fromClub, and toClub to null and isOfficial to false.

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

// Confirmed live: the free tier caps gemini-3.5-flash-lite at 15
// requests/minute. RMC Sport alone can have 60+ genuinely-new items on a
// first run (steady-state hourly runs will see far fewer), and firing
// them all back-to-back blew through the limit almost immediately --
// every single call 429'd and silently fell back to the regex heuristic,
// which looked like "the LLM extraction isn't working" but was really
// "we never gave it a chance to run". Spacing calls to stay under the cap
// (4.2s apart, a bit of margin over the exact 4s/request ceiling) fixes
// that; the tradeoff is a big backlog takes minutes to clear -- fine for
// a scheduled background job with a 10-minute job timeout, not fine for
// anything latency-sensitive.
const MIN_CALL_INTERVAL_MS = 4200;
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
  const response = await ai.models.generateContent({
    model,
    contents: `Headline: ${title}\nSummary: ${summary}`,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  if (!response.text) {
    throw new Error('LLM extraction returned no text');
  }
  return JSON.parse(response.text);
}
