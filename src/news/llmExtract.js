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
      description: 'The club the player is leaving, or null if not stated/unclear.',
    },
    toClub: {
      type: Type.STRING,
      nullable: true,
      description: 'The club the player is joining, or null if not stated/unclear.',
    },
    isOfficial: {
      type: Type.BOOLEAN,
      description: 'True only if the deal is confirmed/done (e.g. "ufficiale", "offiziell", "confirmed", "signs", "s\'engage", "officiel"). False for rumors, negotiations, links, or interest.',
    },
  },
  required: ['playerName', 'fromClub', 'toClub', 'isOfficial'],
};

const SYSTEM_INSTRUCTION = `You extract structured data from a single football (soccer) transfer-market news headline and summary, written in Italian, German, English, or French. Use the names as they commonly appear in football media (don't translate them). If the story isn't really about one specific player's transfer (e.g. it's a roundup of several players, a match report, an interview with no transfer content), set playerName, fromClub, and toClub to null and isOfficial to false.`;

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

export async function llmExtractTransferInfo(title, summary) {
  const ai = getClient();
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

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
