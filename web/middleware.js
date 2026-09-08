// Site-wide access gate -- per explicit request, the app is public via its
// Vercel link with no Impressum/Datenschutzerklärung content filled in yet
// (still placeholders, see public/impressum.html + datenschutz.html).
// Vercel's own Deployment Protection (Vercel Authentication / Password
// Protection) both refused to apply to the production domain on this
// team's Hobby plan ("not available on your plan" / "Advanced Deployment
// Protection is not enabled"), so this rolls a minimal equivalent
// ourselves: Edge Middleware runs in front of every request (HTML, JS,
// the service worker, everything) before Vercel's CDN serves anything, so
// an unauthenticated visitor never receives real app content -- not just
// a client-side-hidden page they could still view-source their way past.
//
// SITE_PASSWORD/COOKIE_SECRET are hardcoded here rather than pulled from a
// Vercel env var -- this project has no tool wired up to set those
// remotely, and this repo's own established pattern for this kind of
// shared, non-per-user secret is to hardcode it directly in the source
// that owns it (see supabase/functions/goal-api-webhook's WEBHOOK_TOKEN/
// SIGNING_SECRET). Change both here to rotate.
const SITE_PASSWORD = 'kickradar-preview-2026';
const COOKIE_SECRET = 'f3a7c1e9b6d24f0a8c5e7b1d9a3f6c02';
const COOKIE_NAME = 'kr_gate';
const LOGIN_PATH = '/login';

async function signature() {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(COOKIE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('kickradar-gate-ok'));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function isAuthed(req, expected) {
  const cookie = req.headers.get('cookie') || '';
  return cookie.split(';').some((c) => c.trim() === `${COOKIE_NAME}=${expected}`);
}

function loginPage(showError) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>KickRadar – Zugang</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #150F0C; color: #F2F3F5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  form { background: #1F1613; padding: 32px 28px; border-radius: 16px; width: 100%; max-width: 320px;
    box-sizing: border-box; border: 1px solid #3D2A22; }
  h1 { font-size: 17px; margin: 0 0 4px; text-align: center; }
  p.sub { font-size: 13px; color: #8A909B; text-align: center; margin: 0 0 20px; }
  input { width: 100%; box-sizing: border-box; padding: 11px 14px; border-radius: 10px; border: 1px solid #3D2A22;
    background: #150F0C; color: #F2F3F5; font-size: 15px; margin-bottom: 14px; }
  button { width: 100%; padding: 11px; border-radius: 10px; border: none; background: #E2896B; color: #3A140A;
    font-weight: 700; font-size: 15px; cursor: pointer; }
  p.error { color: #EF4444; font-size: 13px; text-align: center; margin: -6px 0 14px; }
</style>
</head>
<body>
  <form method="POST" action="${LOGIN_PATH}">
    <h1>KickRadar</h1>
    <p class="sub">Privater Test-Build</p>
    ${showError ? '<p class="error">Falsches Passwort.</p>' : ''}
    <input type="password" name="password" placeholder="Passwort" autofocus required />
    <button type="submit">Öffnen</button>
  </form>
</body>
</html>`;
}

// Requests the installed PWA's own machinery makes on its own, with no
// user around to type a password: the service worker's background
// update check (a plain fetch of its own script -- browsers treat a
// redirected response to that fetch as an update failure and silently
// stop checking forever) and the static/precached JS/CSS/icons/manifest
// it and the app shell reference. These carry no page content of their
// own to protect -- gating them only breaks updates for people who
// already got in once. Actual navigations (`/`, deep links, etc.) still
// hit the branches below and stay gated.
const BYPASS_EXACT = new Set(['/sw.js', '/registerSW.js', '/manifest.webmanifest']);
const BYPASS_EXT = /\.(js|mjs|css|json|webmanifest|png|jpg|jpeg|svg|gif|ico|woff2?|ttf)$/i;

function isBypassed(pathname) {
  return BYPASS_EXACT.has(pathname) || BYPASS_EXT.test(pathname);
}

export default async function middleware(req) {
  const url = new URL(req.url);

  if (isBypassed(url.pathname)) {
    return undefined;
  }

  const expected = await signature();
  const authed = isAuthed(req, expected);

  if (url.pathname === LOGIN_PATH) {
    if (req.method === 'POST') {
      const form = await req.formData();
      if (form.get('password') === SITE_PASSWORD) {
        const res = new Response(null, { status: 303, headers: { Location: '/' } });
        res.headers.append('Set-Cookie', `${COOKIE_NAME}=${expected}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
        return res;
      }
      return new Response(loginPage(true), { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    if (authed) {
      return Response.redirect(new URL('/', req.url), 302);
    }
    return new Response(loginPage(false), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  if (!authed) {
    return Response.redirect(new URL(LOGIN_PATH, req.url), 302);
  }

  return undefined;
}
