import Anthropic from '@anthropic-ai/sdk';
// Must be zod/v4, not the plain 'zod' entrypoint (classic v3 API) -- the
// SDK's zodOutputFormat() calls zod/v4's internal toJSONSchema() on the
// schema object, which throws on a classic-v3-shaped schema instance
// (confirmed locally: "Cannot read properties of undefined (reading 'def')").
import { z } from 'zod/v4';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

// Regex-based extraction (extract.js) hit a hard ceiling: RMC Sport alone
// needed five rounds of prefix/stopword patches (confirmed live each time)
// and still produced garbage like "MercatoMercato" or "Barça" (a club
// nickname not in our alias list) as a "player name". Free-text NER across
// four languages is exactly the kind of task a small LLM handles far more
// robustly than pattern matching -- this replaces extract.js + classify.js
// as the primary path, with the regex versions kept only as a fallback for
// when the API call itself fails (rate limit, outage, missing key).
const ExtractionSchema = z.object({
  playerName: z.string().nullable().describe("The player's full name this story is centrally about, or null if no single player is clearly identifiable (multi-player roundup, non-transfer story, etc.)."),
  fromClub: z.string().nullable().describe('The club the player is leaving, or null if not stated/unclear.'),
  toClub: z.string().nullable().describe('The club the player is joining, or null if not stated/unclear.'),
  isOfficial: z.boolean().describe('True only if the deal is confirmed/done (e.g. "ufficiale", "offiziell", "confirmed", "signs", "s\'engage", "officiel"). False for rumors, negotiations, links, or interest.'),
});

const SYSTEM_PROMPT = `You extract structured data from a single football (soccer) transfer-market news headline and summary, written in Italian, German, English, or French. Use the names as they commonly appear in football media (don't translate them). If the story isn't really about one specific player's transfer (e.g. it's a roundup of several players, a match report, an interview with no transfer content), set playerName, fromClub, and toClub to null and isOfficial to false.`;

let client;
function getClient() {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY env var.');
  }
  client = new Anthropic({ apiKey });
  return client;
}

export async function llmExtractTransferInfo(title, summary) {
  const anthropic = getClient();
  const response = await anthropic.messages.parse({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Headline: ${title}\nSummary: ${summary}` }],
    output_config: { format: zodOutputFormat(ExtractionSchema) },
  });

  if (!response.parsed_output) {
    throw new Error('LLM extraction returned no parsed output');
  }
  return response.parsed_output;
}
