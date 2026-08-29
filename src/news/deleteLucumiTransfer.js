// One-off: delete the confirmed false-positive Lucumí/Bologna transfer row
// (id confirmed via diagnoseLucumiTransfer.js) -- the source article is a
// Juventus lineup-selection story with no transfer content at all; "Bologna"
// only appears as "l'ex Bologna", the player's former club mentioned as
// background. See llmExtract.js's updated SYSTEM_INSTRUCTION for the prompt
// fix meant to stop this recurring.
import { getSupabaseClient } from '../db/supabaseClient.js';

const ID = 'de072f53-5aeb-40a3-b50e-d37adbafe766';

async function main() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('transfers').delete().eq('id', ID).select();
  if (error) throw error;
  console.log('Deleted:', JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
