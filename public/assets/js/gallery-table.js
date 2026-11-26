// Event gallery on touch screens: the first tap picks a print up (straight and bigger),
// a second tap on the same print opens the full-size viewer from main.js.
(() => {
  const table = document.querySelector('.print-table');
  if (!table) return;
  const touch = matchMedia('(hover: none)');
  let up = null;
  const drop = () => { if (up) { up.classList.remove('is-up'); up.style.removeProperty('--nx'); up = null; } };
  table.addEventListener('click', (e) => {
    if (!touch.matches) return;
    const li = e.target.closest('.print');
    if (!li) { drop(); return; }
    if (li === up) return; // second tap: let the viewer open
    e.preventDefault();
    e.stopPropagation(); // keep the viewer closed on the first tap
    drop();
    up = li;
    // Keep the enlarged print inside the screen
    const r = li.getBoundingClientRect();
    const s = parseFloat(getComputedStyle(li).getPropertyValue('--up')) || 1.45;
    const half = (r.width * s) / 2, mid = r.left + r.width / 2, pad = 8;
    let nx = 0;
    if (mid - half < pad) nx = pad - (mid - half);
    else if (mid + half > innerWidth - pad) nx = innerWidth - pad - (mid + half);
    li.style.setProperty('--nx', `${Math.round(nx)}px`);
    li.classList.add('is-up');
  }, true);
  document.addEventListener('click', (e) => { if (up && !e.target.closest('.print-table, .lightbox')) drop(); });
})();
