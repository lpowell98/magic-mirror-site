// Cloudflare Turnstile ("are you human" check). Renders into every .ts-box once the site key is
// configured (Cloudflare Pages variable TURNSTILE_SITE_KEY, served by /api/config). Until then it does nothing.
(function () {
  const boxes = new Map();
  const ready = fetch('/api/config').then(r => (r.ok ? r.json() : {})).catch(() => ({})).then(cfg => {
    if (!cfg.turnstileSiteKey) return null;
    return new Promise(resolve => {
      window.mmTsLoaded = () => resolve(cfg.turnstileSiteKey);
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=mmTsLoaded';
      s.async = true; s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
  });
  function render(el) {
    return ready.then(key => {
      if (!key || !el || boxes.has(el)) return;
      boxes.set(el, window.turnstile.render(el, { sitekey: key, appearance: 'interaction-only', size: 'flexible' }));
    });
  }
  // Resolves to the token ('' when Turnstile is not configured). Waits up to 15 s for the check to finish.
  async function token(el) {
    await render(el);
    const id = boxes.get(el); if (id === undefined) return '';
    for (let i = 0; i < 60; i++) {
      const t = window.turnstile.getResponse(id);
      if (t) return t;
      await new Promise(r => setTimeout(r, 250));
    }
    return '';
  }
  function reset(el) { const id = boxes.get(el); if (id !== undefined) window.turnstile.reset(id); }
  window.mmTS = { render, token, reset };
  const start = () => document.querySelectorAll('.ts-box:not([data-ts-lazy])').forEach(render);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
