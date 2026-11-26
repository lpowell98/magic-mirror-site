/* Print templates page: each design shown on the Magic Mirror, one at a time.
   The plain grid stays in the HTML for search engines and visitors without JavaScript;
   this script builds the mirror from it and the grid is hidden (html.tpl-mirror). */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CAT_NAMES = { wedding: 'Wedding', birthday: 'Birthday', holiday: 'Holiday', graduation: 'Graduation', babyshower: 'Baby shower', corporate: 'Corporate' };
  const items = [...document.querySelectorAll('.template-grid li')].map((li) => {
    const a = li.querySelector('a'), img = li.querySelector('img');
    const full = a.getAttribute('href');
    return {
      cat: li.dataset.cat, name: img.alt.split(', a ')[0], n: +full.match(/-(\d)\.webp$/)[1],
      land: +img.getAttribute('width') > +img.getAttribute('height'), alt: img.alt, full,
      thumb: img.getAttribute('src'), sample: full.replace(/\.webp$/, '-sample.webp?v=ai1'),
    };
  });
  if (!items.length) return;
  // Alternate landscape and portrait so the strip reads as a mix
  const spread = (arr) => arr.map((x, k) => [(k + 0.5) / arr.length, x]);
  const mixed = [...spread(items.filter((x) => x.land)), ...spread(items.filter((x) => !x.land))].sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  const photos = (n) => `${n} photo${n > 1 ? 's' : ''}`;
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };

  const stage = el('<section class="tpl-stage-mirror" aria-label="Print designs"></section>');
  document.querySelector('.grid-sec').before(stage);
  let cat = 'all';
  const visible = () => mixed.filter((x) => cat === 'all' || x.cat === cat);
  const onFilter = [];
  document.querySelectorAll('.tpl-filter .chip').forEach((b) => b.addEventListener('click', () => { cat = b.dataset.cat; onFilter.forEach((f) => f()); }));

  stage.innerHTML = `<div class="mirror-wrap">
    <div class="mirror"><div class="mirror-glass">
      <div class="mirror-screen" aria-live="polite"></div>
      <span class="mirror-sheen" aria-hidden="true"></span>
      <p class="mirror-touch" aria-hidden="true">Touch here to start</p>
    </div></div>
    <button class="mirror-prev" type="button" aria-label="Previous design">‹</button>
    <button class="mirror-next" type="button" aria-label="Next design">›</button>
  </div>
  <div class="mirror-info">
    <p class="mirror-count"></p>
    <h2 class="mirror-name"></h2>
    <p class="mirror-meta"></p>
    <div class="mirror-toggle" role="group" aria-label="Show"><button type="button" data-v="plain" aria-pressed="false">Template</button><button type="button" data-v="sample" aria-pressed="true">With photos</button></div>
    <p class="mirror-note">This is how guests see the design on the mirror before it prints. You choose yours in your booking portal once you book.</p>
  </div>
  <ul class="mirror-strip" aria-label="All designs"></ul>`;
  const screen = stage.querySelector('.mirror-screen');
  const strip = stage.querySelector('.mirror-strip');
  let list = visible(), i = 0, mode = 'sample';
  const draw = (dir = 0) => {
    const x = list[i];
    const img = el(`<img class="${dir ? 'in-' + (dir > 0 ? 'r' : 'l') : ''}${x.land ? ' is-land' : ''}" src="${mode === 'sample' ? x.sample : x.full}" alt="${x.alt}" decoding="async">`);
    // Only one design on the glass: anything already leaving goes now, the current one slides out
    screen.querySelectorAll('img').forEach((old) => {
      if (!reduce && dir && !old.classList.contains('leaving')) { old.classList.add('leaving', 'out-' + (dir > 0 ? 'l' : 'r')); setTimeout(() => old.remove(), 450); } else old.remove();
    });
    screen.append(img);
    stage.querySelector('.mirror-count').textContent = `${i + 1} of ${list.length}`;
    stage.querySelector('.mirror-name').textContent = x.name;
    stage.querySelector('.mirror-meta').textContent = `${CAT_NAMES[x.cat]} · ${photos(x.n)} · ${x.land ? 'landscape' : 'portrait'}`;
    strip.querySelectorAll('button').forEach((b, k) => { b.setAttribute('aria-current', k === i); if (k === i && dir !== null) strip.scrollTo({ left: b.parentNode.offsetLeft - strip.clientWidth / 2 + b.offsetWidth / 2, behavior: reduce ? 'auto' : 'smooth' }); });
    // warm the next one
    const nx = list[(i + 1) % list.length]; new Image().src = mode === 'sample' ? nx.sample : nx.full;
  };
  const go = (d) => { i = (i + d + list.length) % list.length; draw(d); };
  const buildStrip = () => {
    strip.replaceChildren(...list.map((x, k) => {
      const li = el(`<li><button type="button" aria-label="${x.name}"><img src="${x.thumb}" alt="" loading="lazy" decoding="async" class="${x.land ? 'is-land' : ''}"></button></li>`);
      li.querySelector('button').onclick = () => { const d = k > i ? 1 : -1; i = k; draw(d); };
      return li;
    }));
  };
  stage.querySelector('.mirror-prev').onclick = () => go(-1);
  stage.querySelector('.mirror-next').onclick = () => go(1);
  stage.querySelectorAll('.mirror-toggle button').forEach((b) => b.onclick = () => {
    mode = b.dataset.v; stage.querySelectorAll('.mirror-toggle button').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(0);
  });
  document.addEventListener('keydown', (e) => { const r = stage.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); });
  let sx = null;
  const glass = stage.querySelector('.mirror-glass');
  glass.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  glass.addEventListener('touchend', (e) => { if (sx === null) return; const d = e.changedTouches[0].clientX - sx; if (Math.abs(d) > 40) go(d < 0 ? 1 : -1); sx = null; });
  onFilter.push(() => { list = visible(); i = 0; buildStrip(); draw(1); });
  buildStrip(); draw(null);
})();
