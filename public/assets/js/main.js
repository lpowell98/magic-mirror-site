document.documentElement.classList.replace('no-js', 'js');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Mobile menu
const toggle = document.querySelector('.menu-toggle');
const nav = document.getElementById('site-nav');
toggle?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', open);
  toggle.textContent = open ? 'Close' : 'Menu';
});

// "Our photobooth" submenu (tap to open on touch / mobile)
document.querySelectorAll('.sub-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const li = btn.parentElement;
    const open = li.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
  });
});
document.addEventListener('click', (e) => {
  document.querySelectorAll('.has-sub.open').forEach((li) => {
    if (!li.contains(e.target)) li.classList.remove('open');
  });
});

// Footer year
document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

// Lightbox for gallery pages
const links = [...document.querySelectorAll('a[data-lightbox]')];
if (links.length) {
  let i = 0;
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Photo viewer');
  box.innerHTML = '<button class="lb-close" type="button" aria-label="Close">×</button><button class="lb-prev" type="button" aria-label="Previous photo">‹</button><img alt=""><button class="lb-next" type="button" aria-label="Next photo">›</button>';
  document.body.append(box);
  const img = box.querySelector('img');
  const buttons = [...box.querySelectorAll('button')];
  let opener = null;
  const show = (n) => {
    i = (n + links.length) % links.length;
    img.src = links[i].href;
    img.alt = links[i].querySelector('img')?.alt || '';
    if (box.hidden) { opener = document.activeElement; box.hidden = false; buttons[0].focus(); }
  };
  const close = () => { box.hidden = true; img.removeAttribute('src'); opener?.focus(); };
  links.forEach((a, n) => a.addEventListener('click', (e) => { e.preventDefault(); show(n); }));
  box.querySelector('.lb-close').onclick = close;
  box.querySelector('.lb-prev').onclick = () => show(i - 1);
  box.querySelector('.lb-next').onclick = () => show(i + 1);
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(i - 1);
    if (e.key === 'ArrowRight') show(i + 1);
    if (e.key === 'Tab') { // keep focus inside the viewer
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}

// Contact form: submit to the Pages Function, fall back to email on failure
const form = document.querySelector('.contact-form');
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = form.querySelector('.form-status');
  const button = form.querySelector('button');
  button.disabled = true;
  status.textContent = 'Sending…';
  try {
    const res = await fetch(form.action, { method: 'POST', body: new FormData(form) });
    if (!res.ok) throw new Error();
    form.reset();
    status.textContent = 'Thank you! We will be in touch soon.';
  } catch {
    status.innerHTML = 'Sorry, that did not send. Please email <a href="mailto:inquiries@magicmirrorrentalservices.com">inquiries@magicmirrorrentalservices.com</a>.';
  } finally {
    button.disabled = false;
  }
});

// Sections rise in as they arrive (content stays visible without script)
const reveals = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && !reduceMotion) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -10% 0px' });
  reveals.forEach((el) => io.observe(el));
} else {
  reveals.forEach((el) => el.classList.add('in'));
}

// Hero wall: one print at a time slowly crossfades to another
const wall = document.querySelector('.wall');
if (wall && window.WALL_POOL && !reduceMotion) {
  const tiles = [...wall.querySelectorAll('figure')];
  const pool = [...window.WALL_POOL];
  let timer;
  const swap = () => {
    if (document.hidden || !pool.length) return;
    const fig = tiles[Math.floor(Math.random() * tiles.length)];
    if (fig.classList.contains('busy')) return;
    const cur = fig.querySelector('img.cur');
    const next = document.createElement('img');
    next.className = 'next'; next.alt = ''; next.src = pool.shift();
    next.onload = () => {
      fig.classList.add('busy'); fig.append(next);
      requestAnimationFrame(() => fig.classList.add('swap'));
      setTimeout(() => {
        pool.push(cur.getAttribute('src')); cur.remove();
        next.className = 'cur'; fig.classList.remove('swap', 'busy');
      }, 1700);
    };
  };
  // Visitors can pause the moving wall; it also pauses while hovered
  let paused = false, hover = false;
  const start = () => { clearInterval(timer); timer = setInterval(() => { if (!paused && !hover) swap(); }, 2600); };
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'wall-toggle';
  toggle.setAttribute('aria-pressed', 'false'); toggle.textContent = 'Pause photos';
  toggle.addEventListener('click', () => {
    paused = !paused;
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.textContent = paused ? 'Play photos' : 'Pause photos';
  });
  wall.parentElement.append(toggle);
  wall.parentElement.addEventListener('mouseenter', () => { hover = true; });
  wall.parentElement.addEventListener('mouseleave', () => { hover = false; });
  start();
}

// Event picker: pick an event type, see real prints made for that kind of event
const pickData = document.getElementById('picker-data');
if (pickData) {
  const data = JSON.parse(pickData.textContent);
  const fig = document.querySelector('.picker-print');
  const im = fig.querySelector('img');
  const typeEl = document.querySelector('.picker-type');
  const capEl = document.querySelector('.picker-cap');
  const countEl = document.querySelector('.picker-count');
  const tabs = document.querySelectorAll('.picker-tabs button');
  let type = 'Weddings', i = 0;
  const show = () => {
    const list = data[type];
    i = (i + list.length) % list.length;
    const item = list[i];
    fig.classList.add('fading');
    const pre = new Image();
    pre.onload = pre.onerror = () => {
      im.src = item.src; im.alt = 'Photo booth print from ' + item.cap;
      im.width = pre.naturalWidth || im.width; im.height = pre.naturalHeight || im.height;
      requestAnimationFrame(() => fig.classList.remove('fading'));
    };
    pre.src = item.src;
    typeEl.textContent = type; capEl.textContent = item.cap;
    countEl.textContent = `${i + 1} / ${list.length}`;
    document.querySelector('.pk-prev').hidden = document.querySelector('.pk-next').hidden = list.length < 2;
  };
  tabs.forEach((b) => b.addEventListener('click', () => {
    tabs.forEach((t) => t.setAttribute('aria-pressed', t === b));
    type = b.dataset.type; i = 0; show();
  }));
  document.querySelector('.pk-prev').addEventListener('click', () => { i -= 1; show(); });
  document.querySelector('.pk-next').addEventListener('click', () => { i += 1; show(); });
  let sx = null;
  fig.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  fig.addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 40) { i += dx < 0 ? 1 : -1; show(); }
  });
}

// Row of moments: buttons, drag and a progress bar
const row = document.querySelector('.row');
if (row) {
  const bar = document.querySelector('.row-progress span');
  const update = () => {
    const max = row.scrollWidth - row.clientWidth;
    const seen = row.clientWidth / row.scrollWidth;
    bar.style.width = `${Math.min(100, (seen + (max ? row.scrollLeft / max : 0) * (1 - seen)) * 100)}%`;
  };
  row.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
  const step = () => (row.querySelector('li')?.offsetWidth || 300) + 32;
  document.querySelector('.row-prev')?.addEventListener('click', () => row.scrollBy({ left: -step(), behavior: 'smooth' }));
  document.querySelector('.row-next')?.addEventListener('click', () => row.scrollBy({ left: step(), behavior: 'smooth' }));
  let down = false, startX = 0, startLeft = 0;
  row.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; down = true; startX = e.clientX; startLeft = row.scrollLeft; row.style.scrollSnapType = 'none'; });
  window.addEventListener('pointermove', (e) => { if (down) row.scrollLeft = startLeft - (e.clientX - startX); });
  window.addEventListener('pointerup', () => { if (down) { down = false; row.style.scrollSnapType = ''; } });
}

// Review carousel: one quote at a time, click through
document.querySelectorAll('[data-carousel]').forEach((box) => {
  const slides = [...box.querySelectorAll('.quote-slides > li')];
  const count = box.querySelector('.q-count');
  let i = 0;
  const show = (n) => {
    i = (n + slides.length) % slides.length;
    slides.forEach((s, k) => { s.classList.toggle('on', k === i); s.setAttribute('aria-hidden', String(k !== i)); });
    if (count) count.textContent = `${i + 1} / ${slides.length}`;
  };
  box.querySelector('.q-prev')?.addEventListener('click', () => show(i - 1));
  box.querySelector('.q-next')?.addEventListener('click', () => show(i + 1));
  show(0);
});
