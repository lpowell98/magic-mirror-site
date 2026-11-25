// Cloudflare Pages Function: POST /api/booking
// Every request from the booking page and the owner dashboard comes through here before it reaches
// the Google Apps Script back end. This lets us:
//   - check Cloudflare Turnstile (the "are you human" check) on bookings, portal codes and sign-ins
//   - add the visitor's real IP address and browser, which Apps Script cannot see on its own
//   - add a shared secret, so the back end can refuse anything that didn't come through the site
// Set in Cloudflare Pages > Settings > Variables and secrets (Production):
//   BOOKING_PROXY_SECRET  (secret)  same value as PROXY_SECRET in Apps Script > Script properties
//   TURNSTILE_SECRET      (secret)  from Cloudflare > Turnstile; checks are skipped until it is set
//   BOOKING_API_URL       optional, overrides the Apps Script URL below
const DEFAULT_API = 'https://script.google.com/macros/s/AKfycbxhDac5Mxk2Q7a5mGAyA_N_vj-bxNKTG33sIv7THBLbF6DkzW5L6Hf4viE2ZVU8AI0/exec';
const BOT_CHECKED = new Set(['book', 'portalCode', 'adminCode', 'adminLogin']);
const MAX_BYTES = 700000;   // a drawn signature can be up to ~400 KB

export async function onRequestPost({ request, env }) {
  if (!allowedOrigin(request)) return json({ ok: false, error: 'FORBIDDEN' }, 403);
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return json({ ok: false, error: 'Request too large' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: 'Bad request' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.action !== 'string') return json({ ok: false, error: 'Bad request' }, 400);

  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (BOT_CHECKED.has(body.action) && env.TURNSTILE_SECRET) {
    if (!(await turnstileOk(env.TURNSTILE_SECRET, body.ts, ip))) return json({ ok: false, error: 'BOT_CHECK' });
  }
  delete body.ts;
  body.ip = ip;
  body.ua = (request.headers.get('User-Agent') || '').slice(0, 300);
  body.proxy = env.BOOKING_PROXY_SECRET || '';

  let res;
  try {
    res = await fetch(env.BOOKING_API_URL || DEFAULT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
    });
  } catch { return json({ ok: false, error: 'Booking system unreachable' }, 502); }
  const text = await res.text();
  try { return json(JSON.parse(text)); } catch { return json({ ok: false, error: 'Booking system error' }, 502); }
}

export const onRequest = () => json({ ok: false, error: 'Use POST' }, 405);

// Blocks other websites from using this endpoint from a visitor's browser.
function allowedOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try {
    const h = new URL(origin).hostname;
    return h === 'magicmirrorrentalservices.com' || h.endsWith('.magicmirrorrentalservices.com') ||
      h === 'magic-mirror-site-gna.pages.dev' || h.endsWith('.magic-mirror-site-gna.pages.dev') ||
      h === 'localhost' || h === '127.0.0.1';
  } catch { return false; }
}

async function turnstileOk(secret, token, ip) {
  if (!token || typeof token !== 'string' || token.length > 2048) return false;
  const form = new FormData();
  form.append('secret', secret); form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    return !!(await r.json()).success;
  } catch { return false; }
}

const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
