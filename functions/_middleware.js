// Send the bare domain to www so search engines see one copy of the site.
// booking.magicmirrorrentalservices.com/ serves the booking page; app.magicmirrorrentalservices.com/
// serves the owner dashboard. Only the root path is swapped, so CSS, images and scripts load normally.
// The booking page and the dashboard also get strict security headers (see PRIVATE_HEADERS).
export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  if (url.hostname === 'magicmirrorrentalservices.com') {
    url.hostname = 'www.magicmirrorrentalservices.com';
    return Response.redirect(url.toString(), 301);
  }
  const root = url.pathname === '/' || url.pathname === '/index.html';
  let res, area = '';
  if (root && url.hostname === 'booking.magicmirrorrentalservices.com') {
    res = await env.ASSETS.fetch(new Request(new URL('/booking/' + url.search, url), request)); area = 'booking';
  } else if (root && url.hostname === 'app.magicmirrorrentalservices.com') {
    res = await env.ASSETS.fetch(new Request(new URL('/app/' + url.search, url), request)); area = 'app';
  } else {
    res = await next();
    if (/^\/booking(\/|$)/.test(url.pathname)) area = 'booking';
    else if (/^\/app(\/|$)/.test(url.pathname)) area = 'app';
  }
  if (!area || !(res.headers.get('Content-Type') || '').includes('text/html')) return res;
  res = new Response(res.body, res);
  for (const [k, v] of Object.entries(PRIVATE_HEADERS)) res.headers.set(k, v);
  if (area === 'app') {
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return res;
}

// Only this site and Cloudflare Turnstile may run code on these pages; nothing may frame them;
// links carrying a private booking key never leak it to other sites.
const PRIVATE_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "connect-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
