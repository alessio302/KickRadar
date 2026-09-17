// One-off: the broadcaster pill (web/src/lib/broadcasters.js) originally
// hotlinked goal.com's own logo images directly. Confirmed live/user-
// reported: unreliable in practice -- Sky's logo failed to load entirely in
// the browser (likely goal.com's CDN enforcing referrer-based hotlink
// protection, blocking a cross-origin <img> request from our own domain
// even though a plain server-side fetch with no browser Referer succeeds,
// which is exactly why this script's own reachability checks never caught
// it), and the others behaved inconsistently with what their source page's
// own <img> width/height attributes implied.
//
// Fix: download each logo ONCE here (server-side, no referrer issue) and
// upload it into our own Supabase Storage bucket, so the app forever after
// serves it from our own permanent URL instead of depending on goal.com's
// CDN/hotlink policy at all. Run via workflow_dispatch only -- this never
// needs to run again unless a provider's logo asset changes.
import { getSupabaseClient } from '../db/supabaseClient.js';

const BUCKET = 'broadcaster-logos';

const LOGOS = [
  { key: 'dazn', url: 'https://eu-images.contentstack.com/v3/assets/bltcc7a7ffd2fbf71f5/blt2a657c326f3152f3/65709dfdfcc91a04075bd960/DAZN.png', ext: 'png' },
  { key: 'sky', url: 'https://eu-images.contentstack.com/v3/assets/bltcc7a7ffd2fbf71f5/blt1f8bf17a441e7087/64e5d5325e6a952679d12bfe/Sky_Sport_logo.png', ext: 'png' },
  { key: 'now', url: 'https://eu-images.contentstack.com/v3/assets/bltcc7a7ffd2fbf71f5/blt7b99fc273b8208cf/65a7e8a05ee0e2040acb0676/NOW_logo.png', ext: 'png' },
  { key: 'rtlplus', url: 'https://assets.goal.com/images/v3/bltc875439427475ef4/RTL+%20Logo.jpg', ext: 'jpg' },
];

async function ensureBucket(supabase) {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (buckets.some((b) => b.name === BUCKET)) return;
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: '1MB' });
  if (createErr) throw createErr;
  console.log(`Created bucket "${BUCKET}"`);
}

async function main() {
  const supabase = getSupabaseClient();
  await ensureBucket(supabase);

  for (const logo of LOGOS) {
    const res = await fetch(logo.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KickRadarBot/1.0)' } });
    if (!res.ok) throw new Error(`Download failed for ${logo.key}: ${res.status} ${res.statusText}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || (logo.ext === 'png' ? 'image/png' : 'image/jpeg');
    const path = `${logo.key}.${logo.ext}`;

    const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: true });
    if (uploadErr) throw uploadErr;

    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    console.log(`${logo.key}: ${buffer.length} bytes, ${contentType} -> ${publicUrlData.publicUrl}`);
  }
}

main()
  .catch((err) => {
    console.error('Upload failed:', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
