// GET /api/config: public settings the pages need at run time.
// TURNSTILE_SITE_KEY (Cloudflare Pages variable) is public by design; the matching secret stays server-side.
export const onRequestGet = ({ env }) => new Response(JSON.stringify({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || '' }), {
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
});
