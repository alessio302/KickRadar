import { getSupabaseClient } from '../db/supabaseClient.js';

// Read-only diagnostic for a reported dead article link: tapping
// "Articolo" on the "Broggian, Vicenza -> Como 1907" card opens
// tuttomercatoweb.com but shows "Pagina non trovata" (404). Also: Broggian
// has no first name -- Vicenza plays in Serie B, outside the 5 tracked
// leagues, so neither the player nor the club would be in
// squad_memberships at all (that's a separate, expected data-coverage
// limit, not a bug -- confirming here anyway). The real question is the
// dead link: is the stored source_url malformed on our side, or is this a
// TMW-side link durability/redirect issue we can't fix?
async function run() {
  const supabase = getSupabaseClient();

  const { data: rows, error } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, to_club, source, source_url, summary, is_official, published_at, created_at')
    .ilike('player_name', '%broggian%');
  if (error) throw error;
  console.log(`found ${rows.length} rows`);
  for (const r of rows) console.log(JSON.stringify(r, null, 2));

  if (rows.length > 0) {
    const url = rows[0].source_url;
    console.log('\n--- fetching stored source_url server-side ---');
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      redirect: 'manual',
    });
    console.log('status:', res.status, res.statusText);
    console.log('location header (if redirect):', res.headers.get('location'));

    console.log('\n--- fetching with redirect follow + mobile Safari UA ---');
    const res2 = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      },
    });
    console.log('status:', res2.status, res2.statusText, 'final url:', res2.url);
    const html = await res2.text();
    console.log('html length:', html.length);
    console.log('contains "non trovata"?', html.includes('non trovata'));
    console.log('<title>:', html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]);

    console.log('\n--- trying URL variants ---');
    const variants = [
      url.replace('//?action=read', '/?action=read'), // single slash
      url.replace('www.tuttomercatoweb.com//', 'www.tuttomercatoweb.com/news/'),
    ];
    for (const variant of variants) {
      try {
        const r = await fetch(variant, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
        });
        console.log(`  ${variant} -> ${r.status}`);
      } catch (err) {
        console.log(`  ${variant} -> fetch error: ${err.message}`);
      }
    }
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('diagnostic failed:', err);
    process.exit(1);
  });
