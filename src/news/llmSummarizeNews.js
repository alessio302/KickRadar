import { GoogleGenAI, Type } from '@google/genai';

// Same Gemini free-tier approach as llmExtract.js (transfers), but a much
// simpler schema -- News doesn't extract player/club/direction, just a
// short summary in every app language, since the card itself already shows
// the real headline/teaser/source and deep-links to the original article.
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.OBJECT,
      description:
        'A 1-2 sentence summary of the article, capturing its actual content (what happened, who said what, the concrete result/decision) -- not just restating the headline. Written independently in EACH of the 5 languages below, not translated from one draft.',
      properties: {
        de: { type: Type.STRING, description: 'German summary.' },
        en: { type: Type.STRING, description: 'English summary.' },
        it: { type: Type.STRING, description: 'Italian summary.' },
        fr: { type: Type.STRING, description: 'French summary.' },
        es: { type: Type.STRING, description: 'Spanish summary.' },
      },
      required: ['de', 'en', 'it', 'fr', 'es'],
    },
  },
  required: ['summary'],
};

const SYSTEM_INSTRUCTION = `You summarize a single football (soccer) news article, given its headline and a short teaser/snippet, written in Italian, German, English, French, or Spanish. Write a concise, factual summary of what the article actually says -- not a translation or rephrasing of the headline alone. Use player/club names as they commonly appear in football media (don't translate those).`;

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

// Same throttle value/reasoning as llmExtract.js's MIN_CALL_INTERVAL_MS --
// a separate module-level counter (not imported from there) since this
// runs in a different process/scraper (runGeneralNewsScraper.js vs
// runNewsScraper.js), never in the same run, so there's no real benefit to
// sharing the counter, only unwanted coupling between two independent
// pipelines that happen to call the same API.
const MIN_CALL_INTERVAL_MS = 6500;
let lastCallAt = 0;

async function throttle() {
  const wait = lastCallAt + MIN_CALL_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

export async function llmSummarizeNews(title, teaser) {
  const ai = getClient();
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  await throttle();
  const response = await ai.models.generateContent({
    model,
    contents: `Headline: ${title}\nTeaser: ${teaser || title}`,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  if (!response.text) {
    throw new Error('LLM summarization returned no text');
  }
  return JSON.parse(response.text).summary;
}
