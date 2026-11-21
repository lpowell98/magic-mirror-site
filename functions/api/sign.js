// Cloudflare Pages Function: POST /api/sign
// Forwards a contract signature to the booking back end (Google Apps Script) and adds the
// signer's IP address and browser, which Apps Script cannot see on its own. These go into
// the signed PDF's electronic signature record.
// Optional: set BOOKING_API_URL in Cloudflare Pages > Settings > Variables to override the URL.
const DEFAULT_API = 'https://script.google.com/macros/s/AKfycbxhDac5Mxk2Q7a5mGAyA_N_vj-bxNKTG33sIv7THBLbF6DkzW5L6Hf4viE2ZVU8AI0/exec';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Bad request' }, 400); }
  if (body.action !== 'sign') return json({ ok: false, error: 'Unknown action' }, 400);

  body.ip = request.headers.get('CF-Connecting-IP') || '';
  body.ua = (request.headers.get('User-Agent') || '').slice(0, 300);

  const res = await fetch(env.BOOKING_API_URL || DEFAULT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow',
  });
  const text = await res.text();
  try { return json(JSON.parse(text)); } catch { return json({ ok: false, error: 'Booking system error' }, 502); }
}

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
