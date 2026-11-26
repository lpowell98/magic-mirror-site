/* Print templates page: alternative layouts, chosen with ?layout=
   table   prints scattered on a dark table
   mirror  one design at a time inside the Magic Mirror
   string  prints clipped to a gold string, one string per occasion
   slider  before/after slider on every print
   With no ?layout the page keeps its plain grid. The switcher bar only shows on preview links. */
(() => {
  const params = new URLSearchParams(location.search);
  const LAYOUTS = { grid: 'Grid (current)', table: 'On the table', mirror: 'In the mirror', string: 'Hanging gallery', slider: 'Before & after' };
  const layout = LAYOUTS[params.get('layout')] ? params.get('layout') : 'grid';
  const isLive = /magicmirrorrentalservices\.com$/.test(location.hostname);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CAT_NAMES = { wedding: 'Wedding', birthday: 'Birthday', holiday: 'Holiday', graduation: 'Graduation', babyshower: 'Baby shower', corporate: 'Corporate' };

  // Preview-only switcher
  if (!isLive) {
    const bar = document.createElement('nav');
    bar.className = 'tpl-switch';
    bar.setAttribute('aria-label', 'Preview layouts');
    bar.innerHTML = '<span>Preview</span>' + Object.entries(LAYOUTS).map(([k, v]) =>
      `<a href="?layout=${k}"${k === layout ? ' aria-current="true"' : ''}>${v}</a>`).join('');
    document.body.append(bar);
    document.body.classList.add('has-tpl-switch');
  }
  if (layout === 'grid') return;

  // Read the designs from the plain grid, which stays in the HTML for search engines and no-JS visitors
  const items = [...document.querySelectorAll('.template-grid li')].map((li) => {
    const a = li.querySelector('a'), img = li.querySelector('img');
    const full = a.getAttribute('href');
    const thumb = img.getAttribute('src');
    const land = +img.getAttribute('width') > +img.getAttribute('height');
    const name = img.alt.split(', a ')[0];
    const n = +full.match(/-(\d)\.webp$/)[1];
    return {
      cat: li.dataset.cat, name, n, land, alt: img.alt, full, thumb,
      sample: full.replace(/\.webp$/, '-sample.webp'),
      sampleThumb: thumb.replace(/-thumb\.webp$/, '-sample-thumb.webp'),
    };
  });
  // Mix landscape and portrait the way they'd land on a table
  const spread = (arr) => arr.map((x, k) => [(k + 0.5) / arr.length, x]);
  const mixed = [...spread(items.filter((x) => x.land)), ...spread(items.filter((x) => !x.land))].sort((a, b) => a[0] - b[0]).map((p) => p[1]);

  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const photos = (n) => `${n} photo${n > 1 ? 's' : ''}`;
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };

  document.body.classList.add('tpl-alt-on', `tpl-${layout}`);
  const main = document.getElementById('main');
  const filterBar = document.querySelector('.tpl-filter');
  const stage = el(`<section class="tpl-stage tpl-stage-${layout}" aria-label="Print designs"></section>`);
  main.append(stage);
  let cat = 'all';
  const visible = () => mixed.filter((x) => cat === 'all' || x.cat === cat);
  const onFilter = [];
  filterBar.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { cat = b.dataset.cat; onFilter.forEach((f) => f()); }));

  /* ---------- Before/after compare (used by the viewer, the mirror and the slider cards) ---------- */
  function compare(x, { big = false } = {}) {
    const node = el(`<div class="cmp${x.land ? ' is-land' : ''}" role="slider" tabindex="0" aria-label="${x.name}: slide to compare the template with a finished print" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" style="--pos:50%">
      <img class="cmp-a" src="${big ? x.full : x.thumb}" alt="${x.alt}" width="${x.land ? 600 : 400}" height="${x.land ? 400 : 600}" ${big ? '' : 'loading="lazy"'} decoding="async">
      <img class="cmp-b" src="${big ? x.sample : x.sampleThumb}" alt="" width="${x.land ? 600 : 400}" height="${x.land ? 400 : 600}" ${big ? '' : 'loading="lazy"'} decoding="async">
      <span class="cmp-tag cmp-tag-a">Template</span><span class="cmp-tag cmp-tag-b">With photos</span>
      <span class="cmp-line" aria-hidden="true"><span class="cmp-knob"></span></span>
    </div>`);
    let drag = false;
    const set = (p) => { p = Math.max(0, Math.min(100, p)); node.style.setProperty('--pos', p + '%'); node.setAttribute('aria-valuenow', Math.round(p)); };
    const fromEvent = (e) => { const r = node.getBoundingClientRect(); set(((e.clientX - r.left) / r.width) * 100); };
    node.addEventListener('pointerdown', (e) => { drag = true; fromEvent(e); });
    node.addEventListener('pointermove', (e) => { if (drag || e.pointerType === 'mouse') fromEvent(e); });
    addEventListener('pointerup', () => { drag = false; });
    node.addEventListener('pointercancel', () => { drag = false; });
    node.addEventListener('keydown', (e) => {
      const now = +node.getAttribute('aria-valuenow');
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); set(now + (e.key === 'ArrowLeft' ? -10 : 10)); }
    });
    node.set = set;
    return node;
  }

  /* ---------- Viewer: big before/after with previous and next ---------- */
  let viewerList = [], vi = 0, opener = null;
  const viewer = el(`<div class="tpl-viewer" role="dialog" aria-modal="true" aria-label="Design viewer" hidden>
    <button class="tv-close" type="button" aria-label="Close">×</button>
    <button class="tv-prev" type="button" aria-label="Previous design">‹</button>
    <figure><div class="tv-cmp"></div><figcaption></figcaption></figure>
    <button class="tv-next" type="button" aria-label="Next design">›</button></div>`);
  document.body.append(viewer);
  const showViewer = (list, i) => {
    viewerList = list; vi = (i + list.length) % list.length;
    const x = list[vi];
    const c = compare(x, { big: true });
    viewer.querySelector('.tv-cmp').replaceChildren(c);
    viewer.querySelector('figcaption').innerHTML = `<strong>${x.name}</strong><span>${CAT_NAMES[x.cat]} · ${photos(x.n)} · ${x.land ? 'landscape' : 'portrait'}</span><em>Drag across the print to see it with photos</em>`;
    if (viewer.hidden) { opener = document.activeElement; viewer.hidden = false; document.documentElement.classList.add('tv-open'); viewer.querySelector('.tv-close').focus(); }
    if (!reduce) { c.set(0); requestAnimationFrame(() => { c.classList.add('cmp-intro'); requestAnimationFrame(() => c.set(50)); setTimeout(() => c.classList.remove('cmp-intro'), 900); }); }
  };
  const closeViewer = () => { viewer.hidden = true; document.documentElement.classList.remove('tv-open'); viewer.querySelector('.tv-cmp').replaceChildren(); opener?.focus(); };
  viewer.querySelector('.tv-close').onclick = closeViewer;
  viewer.querySelector('.tv-prev').onclick = () => showViewer(viewerList, vi - 1);
  viewer.querySelector('.tv-next').onclick = () => showViewer(viewerList, vi + 1);
  viewer.addEventListener('click', (e) => { if (e.target === viewer) closeViewer(); });
  document.addEventListener('keydown', (e) => {
    if (viewer.hidden) return;
    if (e.key === 'Escape') closeViewer();
    if (e.key === 'ArrowLeft') showViewer(viewerList, vi - 1);
    if (e.key === 'ArrowRight') showViewer(viewerList, vi + 1);
  });

  /* ---------- 1. Prints on a table ---------- */
  if (layout === 'table') {
    stage.innerHTML = '<ul class="table-top"></ul><p class="table-hint">Hover to pick one up. Click to see it with photos.</p>';
    const ul = stage.querySelector('ul');
    mixed.forEach((x, i) => {
      const r = (rand() * 16 - 8).toFixed(1), dy = Math.round(rand() * 24 - 12), dx = Math.round(rand() * 16 - 8);
      const li = el(`<li class="print${x.land ? ' is-land' : ''}" data-cat="${x.cat}" style="--r:${r}deg;--dx:${dx}px;--dy:${dy}px;--z:${i % 7}">
        <button type="button" aria-label="${x.alt}. Open"><img src="${x.thumb}" alt="" width="${x.land ? 600 : 600}" height="${x.land ? 400 : 900}" loading="lazy" decoding="async">
        <span class="print-name">${x.name}<small>${CAT_NAMES[x.cat]} · ${photos(x.n)}</small></span></button></li>`);
      li.querySelector('button').onclick = () => { const v = visible(); showViewer(v, v.indexOf(x)); };
      li.item = x;
      ul.append(li);
    });
    onFilter.push(() => {
      const lis = [...ul.children];
      if (reduce) { lis.forEach((li) => { li.hidden = cat !== 'all' && li.item.cat !== cat; }); return; }
      ul.classList.add('shuffling');
      setTimeout(() => { lis.forEach((li) => { li.hidden = cat !== 'all' && li.item.cat !== cat; }); ul.classList.remove('shuffling'); }, 220);
    });
  }

  /* ---------- 2. In the mirror ---------- */
  if (layout === 'mirror') {
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
      <div class="mirror-toggle" role="group" aria-label="Show"><button type="button" data-v="plain" aria-pressed="true">Template</button><button type="button" data-v="sample" aria-pressed="false">With photos</button></div>
      <p class="mirror-note">This is how guests see the design on the mirror before it prints. You choose yours in your booking portal once you book.</p>
    </div>
    <ul class="mirror-strip" aria-label="All designs"></ul>`;
    const screen = stage.querySelector('.mirror-screen');
    const strip = stage.querySelector('.mirror-strip');
    let list = visible(), i = 0, mode = 'plain';
    const draw = (dir = 0) => {
      const x = list[i];
      const img = el(`<img class="${dir ? 'in-' + (dir > 0 ? 'r' : 'l') : ''}${x.land ? ' is-land' : ''}" src="${mode === 'sample' ? x.sample : x.full}" alt="${x.alt}" decoding="async">`);
      const old = screen.querySelector('img');
      if (old && !reduce && dir) { old.classList.add('out-' + (dir > 0 ? 'l' : 'r')); setTimeout(() => old.remove(), 450); } else if (old) old.remove();
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
    document.addEventListener('keydown', (e) => { if (!viewer.hidden || /INPUT|TEXTAREA/.test(e.target.tagName)) return; if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); });
    let sx = null;
    const glass = stage.querySelector('.mirror-glass');
    glass.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    glass.addEventListener('touchend', (e) => { if (sx === null) return; const d = e.changedTouches[0].clientX - sx; if (Math.abs(d) > 40) go(d < 0 ? 1 : -1); sx = null; });
    onFilter.push(() => { list = visible(); i = 0; buildStrip(); draw(1); });
    buildStrip(); draw(null);
  }

  /* ---------- 3. Hanging gallery ---------- */
  if (layout === 'string') {
    const groups = Object.keys(CAT_NAMES);
    groups.forEach((c) => {
      const these = items.filter((x) => x.cat === c);
      const sec = el(`<section class="line" data-cat="${c}"><h2>${CAT_NAMES[c]} <span>${these.length} designs</span></h2>
        <div class="line-scroll" tabindex="0" aria-label="${CAT_NAMES[c]} designs, scroll sideways"><ul class="line-track"></ul></div></section>`);
      const ul = sec.querySelector('ul');
      these.forEach((x, k) => {
        const li = el(`<li class="hang${x.land ? ' is-land' : ''}" style="--d:${(rand() * -6).toFixed(2)}s;--a:${(1 + rand() * 1.4).toFixed(2)}deg;--t:${(k % 2 ? -1 : 1) * (0.6 + rand())}deg">
          <svg class="seg" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path d="M0 6 Q50 30 100 6"/></svg>
          <span class="pin" aria-hidden="true"></span>
          <button type="button" aria-label="${x.alt}. Open"><img src="${x.thumb}" alt="" width="600" height="${x.land ? 400 : 900}" loading="lazy" decoding="async"></button>
          <p>${x.name}<small>${photos(x.n)}</small></p></li>`);
        li.querySelector('button').onclick = () => { const v = items.filter((y) => cat === 'all' || y.cat === cat); showViewer(v, v.indexOf(x)); };
        ul.append(li);
      });
      stage.append(sec);
    });
    // swing a little when the page scrolls, settle when it stops
    if (!reduce) {
      let last = scrollY, t = null;
      addEventListener('scroll', () => {
        const v = Math.max(-1, Math.min(1, (scrollY - last) / 30)); last = scrollY;
        stage.style.setProperty('--kick', (v * 4).toFixed(2) + 'deg');
        stage.classList.add('moving'); clearTimeout(t); t = setTimeout(() => stage.classList.remove('moving'), 160);
      }, { passive: true });
      const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('in-view', e.isIntersecting)), { rootMargin: '100px' });
      stage.querySelectorAll('.line').forEach((s) => io.observe(s));
    }
    onFilter.push(() => stage.querySelectorAll('.line').forEach((s) => { s.hidden = cat !== 'all' && s.dataset.cat !== cat; }));
  }

  /* ---------- 4. Before & after on every print ---------- */
  if (layout === 'slider') {
    stage.innerHTML = '<p class="slider-hint">Drag across any print to see it finished with photos.</p><ul class="cmp-grid cmp-land"></ul><ul class="cmp-grid cmp-port"></ul>';
    items.forEach((x) => {
      const li = el(`<li data-cat="${x.cat}"><button class="cmp-open" type="button" aria-label="Open ${x.name} larger"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button><p class="cmp-name">${x.name}<small>${CAT_NAMES[x.cat]} · ${photos(x.n)}</small></p></li>`);
      const c = compare(x), open = li.querySelector('.cmp-open');
      c.append(open); li.prepend(c);
      open.addEventListener('pointerdown', (e) => e.stopPropagation());
      open.onclick = () => { const v = items.filter((y) => cat === 'all' || y.cat === cat); showViewer(v, v.indexOf(x)); };
      stage.querySelector(x.land ? '.cmp-land' : '.cmp-port').append(li);
    });
    onFilter.push(() => {
      stage.querySelectorAll('.cmp-grid li').forEach((li) => { li.hidden = cat !== 'all' && li.dataset.cat !== cat; });
      stage.querySelectorAll('.cmp-grid').forEach((g) => { g.hidden = !g.querySelector('li:not([hidden])'); });
    });
  }
})();
