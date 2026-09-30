import { GoogleGenAI, Type } from '@google/genai';
import { recordGeminiUsage } from '../news/geminiUsageTracker.js';

// Same Gemini free-tier approach as news/llmExtract.js (and this project's
// stated "stay free" constraint) -- extracts {homeTeam, awayTeam, providers}
// out of goal.com/it's own Serie A broadcaster-overview article
// (calendario-serie-a-dove-vedere-le-partite-su-sky-dazn), confirmed live
// (diagnoseGoalComBroadcastPages.js) to already contain lines like
// "Napoli-Frosinone sabato 19 settembre ore 20:45 (DAZN e Sky)" for every
// upcoming, broadcaster-announced fixture. Used an LLM instead of a regex
// parser (unlike this project's usual "try regex first" default) because
// the exact punctuation/spacing around the parenthetical provider list is
// inconsistent in the wild ("(DAZN)" vs "(DAZN e Sky)" vs "( DAZN e Sky)"
// vs "(DAZN/Sky/NOW)"), the line also needs to distinguish an
// already-played match (just "TeamA-TeamB 2-1", no broadcaster at all) from
// an unannounced future one (no time/broadcaster yet either) from a real
// upcoming entry -- exactly the kind of judgment call regex handles badly
// and an LLM handles for free at this volume (one call per sync run).
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    fixtures: {
      type: Type.ARRAY,
      description:
        'Every upcoming Serie A fixture in the text that has an explicit broadcaster listed in parentheses after its kickoff time. Skip already-played matches (shown as "TeamA-TeamB score-score" with no time/broadcaster) and skip future matchdays with no broadcaster announced yet (just team names, no time, no parentheses).',
      items: {
        type: Type.OBJECT,
        properties: {
          homeTeam: { type: Type.STRING, description: 'Home team name exactly as written in the text.' },
          awayTeam: { type: Type.STRING, description: 'Away team name exactly as written in the text.' },
          providers: {
            type: Type.ARRAY,
            description: 'Every broadcaster listed for this match, from the parenthetical after the kickoff time.',
            items: { type: Type.STRING, enum: ['DAZN', 'Sky', 'NOW'] },
          },
        },
        required: ['homeTeam', 'awayTeam', 'providers'],
      },
    },
  },
  required: ['fixtures'],
};

const SYSTEM_INSTRUCTION = `You read an Italian-language Serie A broadcaster-schedule article. It lists matchdays with lines like "Napoli-Frosinone sabato 19 settembre ore 20:45 (DAZN e Sky)" (an upcoming match with a real broadcaster) or "Inter-Monza 4-1" (an already-played match, no broadcaster to extract) or a bare "TeamA-TeamB" with no time/parenthetical at all (a future matchday with broadcasters not yet announced). Extract ONLY the first kind.`;

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

export async function llmExtractBroadcasts(pageText) {
  const ai = getClient();
  // Reverted back to gemini-3.5-flash-lite (2026-09-30, same day as the
  // switch to gemini-3.6-flash) -- that switch assumed gemini-3.6-flash had
  // ~1,500 RPD of headroom, based on llmExtract.js's own (apparently wrong,
  // or since-cut) comment. A live RESOURCE_EXHAUSTED response from that
  // exact model, same day, says otherwise: "limit: 20, model:
  // gemini-3.6-flash". 20 RPD is effectively always gone (runNewsScraper.js
  // alone exhausts it within the first call of most runs) -- far worse odds
  // for this single occasional call than gemini-3.5-flash-lite's real
  // 500 RPD, even shared with News's own high volume.
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: pageText,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });
  } finally {
    // Recorded regardless of outcome -- shares this model's account-wide
    // RPD with whichever other pipeline also uses it (see this function's
    // own comment above, and gemini_usage/geminiUsageTracker.js's own).
    await recordGeminiUsage(model);
  }

  if (!response.text) {
    throw new Error('LLM broadcast extraction returned no text');
  }
  return JSON.parse(response.text).fixtures;
}
