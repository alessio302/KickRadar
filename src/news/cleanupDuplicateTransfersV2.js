import { getSupabaseClient } from '../db/supabaseClient.js';

// One-off cleanup for the exact duplicate groups confirmed live via
// findDupesV2.js (run 2026-08-26). All predate the isNameVariant() fix in
// runNewsScraper.js -- that fix stops new ones, this cleans up the 8
// existing groups it can't retroactively touch. For each group: keep the
// row with the fuller player_name (better for display), merge in
// is_official = OR of all rows, the latest published_at, and the most
// informative summary/source_url, then delete the other row(s).
const GROUPS = [
  {
    keepId: '1be2563c-89f1-46d0-a1a3-43fc23c2f25d', // "Kamil Grabara"
    deleteIds: ['88024ac8-eaed-408f-81cc-7c340976dd06'],
    update: {
      published_at: '2026-08-26T08:00:00+00:00',
      source_url: 'https://www.tuttomercatoweb.com/fantacalcio/?action=read&idnet=dHV0dG9mYW50YWNhbGNpby5pdC0zNDQ4MA',
      summary: 'Grabara, Juventus FC',
    },
  },
  {
    keepId: 'ea9fbabd-9d12-48de-ad7b-6779743d6c3a', // "Ayyoub Bouaddi" (Lille OSC -> Man City)
    deleteIds: ['97c97754-9a3e-4940-b60e-d8c7c17a533f', 'e8684368-d4c0-4a00-89f9-87ccc016df5a'],
    update: null,
  },
  {
    keepId: '2dc58e9d-1e47-47aa-b9c8-b4c87d988b3c', // "Federico Zanchetta" -- already fullest/newest/official
    deleteIds: ['507d8e69-53d7-4fe6-b4b9-232d650a42a0'],
    update: null,
  },
  {
    keepId: '3b9eb474-b270-4ce8-a094-9455645c8039', // "Mihajlo Ilić"
    deleteIds: ['7e06a7c6-f6ca-4701-959f-9fba40de39b4'],
    update: {
      is_official: true,
      published_at: '2026-08-25T08:58:57+00:00',
      source_url: 'https://www.tuttomercatoweb.com/torino/?action=read&idnet=dG9yaW5vZ3JhbmF0YS5pdC0xODc5MTg',
      summary: 'Ilic, US Lecce',
    },
  },
  {
    keepId: '17bf2f43-8728-4eed-b7b0-b7f9becd6e2b', // "Sebastiano Esposito" -- already fullest/newest
    deleteIds: ['add1c8ae-4c67-464b-a3c8-e2dfd9a75d5d'],
    update: null,
  },
  {
    keepId: '041e663a-ff43-4c6d-9725-0c6c34400884', // "Yvan Maye" -- already fullest/newest/official
    deleteIds: ['506268ec-d00f-43dc-83d5-2b40717f64af'],
    update: null,
  },
  {
    keepId: 'cbda5d08-5380-4591-8426-f88c680d83c7', // "Couhaib Driouech" (fuller name), merge in the official confirmation article
    deleteIds: ['f0558d92-f8dc-4c14-abfd-cce1285ce881'],
    update: {
      is_official: true,
      published_at: '2026-08-25T20:34:20.91+00:00',
      source_url: 'https://www.marca.com/futbol/celta/2026/08/25/driouech-firma-celta-2030.html',
      summary: 'Driouech firma con el Celta hasta 2030',
    },
  },
  {
    keepId: '2ad48bf0-04fa-42e8-9307-8d04e2f30caf', // "Kristjan Asllani" -- already fullest/newest/official, the reported bug
    deleteIds: ['6aaca258-c034-47d9-8cfa-507dd20d9d09'],
    update: null,
  },
];

async function main() {
  const supabase = getSupabaseClient();
  let updated = 0;
  let deleted = 0;

  for (const group of GROUPS) {
    if (group.update) {
      const { error: updateErr } = await supabase.from('transfers').update(group.update).eq('id', group.keepId);
      if (updateErr) {
        console.error(`Failed to update ${group.keepId}:`, updateErr.message);
        continue;
      }
      updated += 1;
    }
    const { error: deleteErr, count } = await supabase
      .from('transfers')
      .delete({ count: 'exact' })
      .in('id', group.deleteIds);
    if (deleteErr) {
      console.error(`Failed to delete ${group.deleteIds.join(', ')}:`, deleteErr.message);
      continue;
    }
    deleted += count ?? group.deleteIds.length;
  }

  console.log(`Updated ${updated} kept row(s), deleted ${deleted} duplicate row(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
