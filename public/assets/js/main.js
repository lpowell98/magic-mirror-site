// Mobile menu
const toggle = document.querySelector('.menu-toggle');
const nav = document.getElementById('site-nav');
toggle?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', open);
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
  box.innerHTML = '<button class="lb-close" aria-label="Close">×</button><button class="lb-prev" aria-label="Previous">‹</button><img alt=""><button class="lb-next" aria-label="Next">›</button>';
  document.body.append(box);
  const img = box.querySelector('img');
  const show = (n) => { i = (n + links.length) % links.length; img.src = links[i].href; box.hidden = false; };
  const close = () => { box.hidden = true; img.removeAttribute('src'); };
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
