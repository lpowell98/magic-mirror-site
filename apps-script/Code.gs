/**
 * Magic Mirror Rental Services — booking back end
 * Bound to the "MMRS Bookings" Google Sheet (Extensions > Apps Script).
 * Deploy: Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone.
 *
 * Script properties (Project Settings > Script properties). None of these go in this file or on GitHub.
 *   PROXY_SECRET       a long random phrase, the same as BOOKING_PROXY_SECRET in Cloudflare Pages.
 *                      Once set, the back end only answers requests that came through the website.
 *   BASE_ADDRESS       where travel is measured from (e.g. your home or storage address). When set, the
 *                      travel fee uses Google Maps driving miles instead of the miles the client typed.
 *   STRIPE_SECRET_KEY  see "Stripe payments" below.
 */

const CONFIG = {
  OWNER_EMAIL: 'lanspowelljr@gmail.com',      // where new-booking alerts go
  NOTIFY: 'lanspowelljr@gmail.com, inquiries@magicmirrorrentalservices.com',
  ADMINS: ['lanspowelljr@gmail.com', 'inquiries@magicmirrorrentalservices.com'],  // who can open the owner dashboard
  FROM: 'inquiries@magicmirrorrentalservices.com',   // emails are sent from this address when the sending account can use it  // who gets owner alerts (bookings, contracts, payments, messages, heads-ups)
  BUSINESS: 'Magic Mirror Rental Services',
  REPLY_TO: 'inquiries@magicmirrorrentalservices.com',
  PORTAL_URL: 'https://www.magicmirrorrentalservices.com/booking/',
  FIRST_ID: 150,                               // new IDs start after this (BoothBook used up to 150)
  DEPOSIT: 250,
  FREE_MILES: 20,
  PER_MILE: 0.85,
  TZ: 'America/New_York',
  PACKAGES: { bronze: ['Bronze Package', 650], silver: ['Silver Package', 850], gold: ['Gold Package', 1100] },
  PRINTS:   { tpl: ['Template Design Print-out', 0], cus: ['Custom Design Print-out', 75] },
  STAFF:    [{ name: 'Lans', email: 'lanspowelljr@gmail.com' }, { name: 'Jonah Simon', email: '' }],  // add Jonah's email
  TIMES:    { t30: ['Additional Time (30 minutes)', 75], t60: ['Additional Time (1 hour)', 100], t120: ['Additional Time (2 hour)', 150] }
};

const COL = { ID:1, CREATED:2, STATUS:3, DATE:4, TYPE:5, EVNAME:6, START:7, END:8, ARRIVE:9, DEPART:10,
  VNAME:11, VADDR:12, VZIP:13, MILES:14, FEE:15, FN:16, LN:17, EMAIL:18, PHONE:19, STREET:20, ZIP:21,
  PKG:22, PRINT:23, XTIME:24, COUPON:25, REF:26, PAYOPT:27, TOTAL:28, PAID:29, BALANCE:30, NOTES:31,
  SIGNED_AT:32, SIGNER:33, SIGN_IP:34, CONTRACT_PDF:35, MODEL_RELEASE:36,
  TEMPLATE:37, TEMPLATE_TEXT:38, ONSITE_NAME:39, ONSITE_PHONE:40, GUESTS:41, SETUP_NOTES:42, DETAILS_AT:43,
  STAFF:44, ADMIN_NOTES:45, TEAM_NOTES:46, KEY:47 };
const NCOL = 47;

/* ---------------- HTTP ----------------
   Every request comes through the website's /api/booking (functions/api/booking.js), which checks
   Turnstile and adds the visitor's IP, browser and the shared PROXY_SECRET. */

const REQ = { ip: '', ua: '', verified: false };   // who is calling, filled in per request

function doGet(e) {
  const p = e.parameter || {};
  if (p.admin !== undefined) return adminPage_();
  try {
    if (p.action === 'dates') return json({ ok: true, taken: takenDates_() });
    return json({ ok: true, service: CONFIG.BUSINESS });
  } catch (err) { Logger.log(err); return json({ ok: false, error: 'Something went wrong' }); }
}

// Client-portal actions: each needs the booking ID plus its private key (from the email link or an emailed code).
const PORTAL_READS = {
  lookup: (b, f) => ({ ok: true, booking: bookingView_(f.r) }),
  contract: (b, f) => getContract_(f),
  messages: (b, f) => getMessages_(f)
};
const PORTAL_WRITES = {
  sign: signContract_, template: saveTemplate_, details: saveDetails_, message: addMessage_,
  pay: startPayment_, confirmPay: confirmPayment_
};

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: 'Bad request' }); }
  if (!b || typeof b !== 'object') return json({ ok: false, error: 'Bad request' });
  const secret = PropertiesService.getScriptProperties().getProperty('PROXY_SECRET');
  REQ.verified = !!secret && String(b.proxy || '') === secret;
  if (secret && !REQ.verified) return json({ ok: false, error: 'FORBIDDEN' });
  REQ.ip = clip_(b.ip, 64) || 'unknown'; REQ.ua = clip_(b.ua, 300);
  const action = String(b.action || '');

  // Owner dashboard on app.magicmirrorrentalservices.com (handles its own locking)
  if (action.indexOf('admin') === 0) {
    try { return json(adminApi_(b)); } catch (err) { return json({ ok: false, error: String(err.message || err) }); }
  }
  try {
    if (action === 'dates') return json({ ok: true, taken: takenDates_() });
    if (action === 'portalCode') return json(portalCode_(b));
    if (action === 'checkPromo') return json(checkPromo_(b));
    if (action === 'portalVerify') return json(portalVerify_(b));
    if (PORTAL_READS[action]) {
      const f = authRow_(b); if (!f) return json(authError_());
      return json(PORTAL_READS[action](b, f));
    }
    if (action !== 'book' && !PORTAL_WRITES[action]) return json({ ok: false, error: 'Unknown action' });
  } catch (err) { Logger.log(err); return json({ ok: false, error: 'Something went wrong. Please try again.' }); }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    if (action === 'book') return json(createBooking_(b));
    const f = authRow_(b); if (!f) return json(authError_());
    return json(PORTAL_WRITES[action](b, f));
  } catch (err) {
    Logger.log(err);
    return json({ ok: false, error: 'Something went wrong. Please try again.' });
  } finally {
    lock.releaseLock();
  }
}

function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------------- Data helpers ---------------- */

function sheet_(name) { return SpreadsheetApp.getActive().getSheetByName(name); }
function fmtDate_(v) { return v instanceof Date ? Utilities.formatDate(v, CONFIG.TZ, 'MM/dd/yyyy') : String(v || '').trim(); }
function rows_() {
  ensureCols_();
  const sh = sheet_('Bookings'); const n = sh.getLastRow();
  return n < 2 ? [] : sh.getRange(2, 1, n - 1, NCOL).getValues();
}

// Adds the dashboard columns (Staff, Admin Notes, Team Notes, Portal Key) if the sheet doesn't have them yet.
let colsChecked_ = false;
function ensureCols_() {
  if (colsChecked_) return; colsChecked_ = true;
  const sh = sheet_('Bookings');
  if (sh.getMaxColumns() < NCOL) sh.insertColumnsAfter(sh.getMaxColumns(), NCOL - sh.getMaxColumns());
  const head = sh.getRange(1, COL.STAFF, 1, 4), h = head.getValues()[0];
  if (!h[0] || !h[3]) head.setValues([['Staff', 'Admin Notes', 'Team Notes', 'Portal Key']]).setFontWeight('bold');
}

/* ---------------- Safety helpers ---------------- */

const has_ = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// Text typed by a visitor, made safe to store: a leading = + - @ would make Sheets treat it as a formula.
const txt_ = v => { const t = String(v == null ? '' : v); return /^[=+\-@]/.test(t) ? "'" + t : t; };

// Counts requests in fixed time windows. Returns true (and counts nothing) once max is reached.
function limited_(key, max, secs) {
  const c = CacheService.getScriptCache(), k = 'rl:' + key + ':' + Math.floor(Date.now() / 1000 / secs);
  const n = Number(c.get(k) || 0);
  if (n >= max) return true;
  c.put(k, String(n + 1), Math.min(21600, secs + 60));
  return false;
}
function tooMany_() { return { ok: false, error: 'TOO_MANY' }; }

// A random value from Google's UUID generator (cryptographically random).
function newKey_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 40); }
function code6_() { const h = Utilities.getUuid().replace(/-/g, ''); return String(100000 + parseInt(h.slice(0, 12), 16) % 900000); }

// The booking's private key, created the first time it is needed (older bookings don't have one yet).
function keyOf_(r) {
  if (r[COL.KEY - 1]) return String(r[COL.KEY - 1]);
  const k = newKey_();
  sheet_('Bookings').getRange(rowById_(r[0]), COL.KEY).setNumberFormat('@').setValue(k);
  r[COL.KEY - 1] = k;
  return k;
}

// Finds the booking for a portal request by ID + private key. Wrong keys are counted per visitor.
function authRow_(b) {
  if (limited_('badauth-check:' + REQ.ip, 300, 3600)) return null;
  if (Number(CacheService.getScriptCache().get('badauth:' + REQ.ip) || 0) >= 20) return null;
  const id = String(b.id || '').trim(), key = String(b.key || '').trim();
  if (/^\d{1,7}$/.test(id) && key.length >= 30) {
    const rows = rows_(), i = rows.findIndex(x => String(x[0]) === id);
    if (i !== -1 && rows[i][COL.KEY - 1] && String(rows[i][COL.KEY - 1]) === key) return { index: i + 2, r: rows[i] };
  }
  const c = CacheService.getScriptCache(), n = Number(c.get('badauth:' + REQ.ip) || 0);
  c.put('badauth:' + REQ.ip, String(n + 1), 3600);
  return null;
}
function authError_() {
  return Number(CacheService.getScriptCache().get('badauth:' + REQ.ip) || 0) >= 20 ? tooMany_() : { ok: false, error: 'NOT_FOUND' };
}

/* ---------------- Portal sign-in by emailed code ----------------
   For clients who look up their booking with Booking ID + last name instead of the email link. */

function portalCode_(b) {
  const done = { ok: true };   // same answer whether or not the booking exists
  if (limited_('pcode-ip:' + REQ.ip, 6, 3600)) return tooMany_();
  const f = findRow_(b.id, b.ln); if (!f) return done;
  const id = String(f.r[0]), cache = CacheService.getScriptCache();
  if (cache.get('pcodeSent:' + id) || limited_('pcode-id:' + id, 4, 3600)) return done;
  const code = code6_();
  cache.put('pcode:' + id, JSON.stringify({ h: sha_(code), tries: 0 }), 600);
  cache.put('pcodeSent:' + id, '1', 60);
  sendMail_({ to: f.r[COL.EMAIL - 1], replyTo: CONFIG.REPLY_TO, subject: `Your booking code: ${code}`, preheader: 'It expires in 10 minutes.',
    htmlBody: eHead_(`Booking #${esc_(id)}`, `Hi ${esc_(f.r[COL.FN - 1])}, here's your code.`, 'Enter it on our website to open your booking.') +
      eCode_(code) + eSmall_("It expires in 10 minutes. If you didn't ask for it, you can ignore this email.") +
      eSmall_('Or skip the code and use this button:') + portalLink_(f.r, 'Open your booking') });
  return done;
}

function portalVerify_(b) {
  const id = String(b.id || '').trim(), cache = CacheService.getScriptCache(), k = 'pcode:' + id;
  if (limited_('pverify-ip:' + REQ.ip, 30, 3600)) return tooMany_();
  const raw = /^\d{1,7}$/.test(id) && cache.get(k);
  if (!raw) return { ok: false, error: 'CODE_EXPIRED' };
  const c = JSON.parse(raw);
  if (c.tries >= 5) { cache.remove(k); return { ok: false, error: 'CODE_EXPIRED' }; }
  if (sha_(String(b.code || '').trim()) !== c.h) { c.tries++; cache.put(k, JSON.stringify(c), 600); return { ok: false, error: 'CODE_WRONG' }; }
  cache.remove(k);
  const r = sheet_('Bookings').getRange(rowById_(id), 1, 1, NCOL).getValues()[0];
  keyOf_(r);
  return { ok: true, booking: bookingView_(r) };
}

function takenDates_() {
  const set = {};
  rows_().forEach(r => { if (r[COL.STATUS - 1] !== 'Cancelled') set[fmtDate_(r[COL.DATE - 1])] = true; });
  const bl = sheet_('Blocked Dates'); const n = bl.getLastRow();
  if (n > 1) bl.getRange(2, 1, n - 1, 1).getValues().forEach(r => { if (r[0]) set[fmtDate_(r[0])] = true; });
  return Object.keys(set);
}

function price_(b, promo) {
  const items = [];
  if (has_(CONFIG.PRINTS, b.print)) items.push(CONFIG.PRINTS[b.print]);
  if (has_(CONFIG.PACKAGES, b.pkg)) items.push(['Mirror Me Booth - ' + CONFIG.PACKAGES[b.pkg][0], CONFIG.PACKAGES[b.pkg][1]]);
  (b.times || []).forEach(t => { if (has_(CONFIG.TIMES, t)) items.push(CONFIG.TIMES[t]); });
  const miles = Math.max(0, parseFloat(b.miles) || 0);
  const fee = Math.round(Math.max(0, miles - CONFIG.FREE_MILES) * CONFIG.PER_MILE * 100) / 100;
  const off = promoOff_(promo, items.reduce((s, i) => s + i[1], 0));
  if (off > 0) items.push([promoLabel_(promo), -off]);
  if (fee > 0) items.push(['Travel', fee]);
  const total = Math.round(items.reduce((s, i) => s + i[1], 0) * 100) / 100;
  return { items, total, fee, miles };
}

/* ---------------- Promo codes ----------------
   Made in the dashboard (Money tab) and kept on the "Promo Codes" tab of the sheet.
   A code takes a percent or a dollar amount off the package, prints and extra time. Travel is never discounted.
   A code is counted as used when a booking is made with it. */
const PROMO_HEAD = ['Code', 'Type', 'Amount', 'Expires', 'Max uses', 'Uses', 'Active', 'Note', 'Created'];
function promoSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('Promo Codes');
  if (!sh) {
    sh = ss.insertSheet('Promo Codes'); sh.appendRow(PROMO_HEAD); sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, PROMO_HEAD.length).setFontWeight('bold'); sh.getRange('A:A').setNumberFormat('@');
  }
  return sh;
}
function normCode_(v) { return String(v || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 30); }
function promos_() {
  const sh = promoSheet_(), n = sh.getLastRow();
  return n < 2 ? [] : sh.getRange(2, 1, n - 1, PROMO_HEAD.length).getValues().map((r, i) => ({
    row: i + 2, code: normCode_(r[0]), type: r[1] === 'amount' ? 'amount' : 'percent', amount: num_(r[2]),
    expires: fmtDate_(r[3]), maxUses: num_(r[4]), uses: num_(r[5]), active: r[6] === true || String(r[6]).toUpperCase() === 'TRUE',
    note: String(r[7] || ''), created: fmtDate_(r[8]) })).filter(p => p.code);
}
const findPromo_ = code => { code = normCode_(code); return code ? promos_().find(p => p.code === code) || null : null; };
// Why a code can't be used today, or '' when it can.
function promoProblem_(p) {
  if (!p) return "That promo code isn't valid.";
  if (!p.active) return 'That promo code is no longer active.';
  if (p.expires && dayNum_(p.expires) < dayNum_(new Date())) return 'That promo code has expired.';
  if (p.maxUses > 0 && p.uses >= p.maxUses) return 'That promo code has been fully used.';
  return '';
}
function promoLabel_(p) { return `Promo code ${p.code} (${p.type === 'percent' ? p.amount + '% off' : money_(p.amount) + ' off'})`; }
// Dollars off a subtotal (package, prints and extra time).
function promoOff_(p, sub) {
  if (!p || !(sub > 0)) return 0;
  const off = p.type === 'percent' ? sub * Math.min(100, p.amount) / 100 : p.amount;
  return Math.round(Math.min(sub, Math.max(0, off)) * 100) / 100;
}
// Public: the booking page's "Apply" button. Rate limited so codes can't be guessed.
function checkPromo_(b) {
  if (limited_('promo-ip:' + REQ.ip, 20, 3600)) return tooMany_();
  if (!normCode_(b.code)) return { ok: false, error: 'Enter a promo code.' };
  const p = findPromo_(b.code), why = promoProblem_(p);
  if (why) return { ok: false, error: why };
  return { ok: true, promo: { code: p.code, type: p.type, amount: p.amount, label: promoLabel_(p) } };
}

/* ---------------- Create booking ---------------- */

// A real MM/DD/YYYY date from today up to four years ahead, or ''.
function cleanDate_(v) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v || '').trim()); if (!m) return '';
  const d = new Date(+m[3], +m[1] - 1, +m[2]);
  if (d.getFullYear() !== +m[3] || d.getMonth() !== +m[1] - 1 || d.getDate() !== +m[2]) return '';
  const day = dayNum_(m[0]), today = dayNum_(new Date());
  return day >= today && day <= today + 4 * 366 ? m[0] : '';
}

// Driving miles from BASE_ADDRESS (Script properties) to the venue, or null if not set up or not found.
function routeMiles_(dest) {
  const base = PropertiesService.getScriptProperties().getProperty('BASE_ADDRESS');
  if (!base) return null;
  try {
    const d = Maps.newDirectionFinder().setOrigin(base).setDestination(dest).setMode(Maps.DirectionFinder.Mode.DRIVING).getDirections();
    const leg = d && d.routes && d.routes[0] && d.routes[0].legs && d.routes[0].legs[0];
    return leg && leg.distance ? Math.round(leg.distance.value / 1609.344 * 10) / 10 : null;
  } catch (e) { Logger.log('Maps: ' + e); return null; }
}

function createBooking_(b) {
  const today = Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyyMMdd');
  if (limited_('book-ip:' + REQ.ip, 5, 3600) || limited_('book-day:' + today, 30, 86400)) return tooMany_();

  // Only known fields, trimmed and size-limited. Prices always come from CONFIG, never from the browser.
  const LEN = { eventType: 80, evName: 150, start: 20, end: 20, arrive: 20, depart: 20, vName: 150, vAddr: 300, vZip: 20,
    fn: 80, ln: 80, email: 200, phone: 40, street: 200, zip: 20, coupon: 60, ref: 150 };
  const c = {};
  Object.keys(LEN).forEach(k => c[k] = clip_(b[k], LEN[k]));
  c.pkg = String(b.pkg || ''); c.print = String(b.print || '');
  c.times = Array.isArray(b.times) ? b.times.map(String).filter((t, i, a) => has_(CONFIG.TIMES, t) && a.indexOf(t) === i) : [];
  c.payOpt = ['later', 'deposit', 'full'].indexOf(b.payOpt) !== -1 ? b.payOpt : 'later';
  c.date = cleanDate_(b.date);

  const need = ['pkg', 'print', 'email', 'phone', 'evName', 'start', 'vName', 'vAddr', 'vZip', 'fn', 'ln'];
  const miss = need.filter(k => !c[k]);
  if (miss.length) return { ok: false, error: 'Missing: ' + miss.join(', ') };
  if (!c.date) return { ok: false, error: 'Please choose a valid event date.' };
  if (!has_(CONFIG.PACKAGES, c.pkg) || !has_(CONFIG.PRINTS, c.print)) return { ok: false, error: 'Please choose a package and a print option.' };
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(c.email)) return { ok: false, error: 'Please enter a valid email address.' };
  if (!b.terms) return { ok: false, error: 'Terms not accepted' };
  if (takenDates_().indexOf(c.date) !== -1) return { ok: false, error: 'DATE_TAKEN' };
  let promo = null;
  if (normCode_(c.coupon)) {
    promo = findPromo_(c.coupon); const why = promoProblem_(promo);
    if (why) return { ok: false, error: 'PROMO', message: why };
    c.coupon = promo.code;
  }

  // Travel: Google Maps driving miles when BASE_ADDRESS is set; otherwise the miles the client typed.
  const typed = Math.min(500, Math.max(0, parseFloat(b.miles) || 0));
  const mapped = routeMiles_(c.vAddr + ', ' + c.vZip);
  c.miles = mapped === null ? typed : mapped;
  const milesNote = mapped === null ? (PropertiesService.getScriptProperties().getProperty('BASE_ADDRESS') ? 'Miles typed by client (Google Maps could not find the venue)' : '')
    : (Math.abs(mapped - typed) > 2 ? `Miles from Google Maps: ${mapped} (client typed ${typed})` : '');

  const sh = sheet_('Bookings');
  const ids = rows_().map(r => Number(r[0]) || 0);
  const id = Math.max(CONFIG.FIRST_ID, ...ids) + 1;
  const p = price_(c, promo);
  const row = sh.getLastRow() + 1;
  const key = newKey_();

  const values = [
    id, new Date(), 'Unconfirmed', c.date, txt_(c.eventType), txt_(c.evName), txt_(c.start), txt_(c.end), txt_(c.arrive), txt_(c.depart),
    txt_(c.vName), txt_(c.vAddr), txt_(c.vZip), p.miles || '', p.fee, txt_(c.fn), txt_(c.ln), txt_(c.email), txt_(c.phone), txt_(c.street), txt_(c.zip),
    CONFIG.PACKAGES[c.pkg][0], CONFIG.PRINTS[c.print][0],
    c.times.map(t => CONFIG.TIMES[t][0]).join(', '),
    txt_(c.coupon), txt_(c.ref), c.payOpt, p.total, 0, '=AB' + row + '-AC' + row, milesNote
  ];
  // Store as plain text so Sheets keeps "02201", "11/27/2026" and "7:00 pm" exactly as typed
  sh.getRange(row, 1, 1, 31).setNumberFormat('@');
  sh.getRange(row, COL.ID).setNumberFormat('0');
  sh.getRange(row, COL.CREATED).setNumberFormat('MM/dd/yyyy h:mm am/pm');
  sh.getRange(row, COL.MILES).setNumberFormat('0.0');
  [COL.FEE, COL.TOTAL, COL.PAID, COL.BALANCE].forEach(col => sh.getRange(row, col).setNumberFormat('$#,##0.00'));
  sh.getRange(row, 1, 1, values.length).setValues([values]);
  sh.getRange(row, COL.KEY).setNumberFormat('@').setValue(key);
  if (promo) promoSheet_().getRange(promo.row, 6).setValue(promo.uses + 1);

  const r = sh.getRange(row, 1, 1, NCOL).getValues()[0];
  notifyOwner_(id, c, p, milesNote, mapped !== null);
  confirmClient_(id, c, p, r);
  return { ok: true, booking: bookingView_(r) };
}

/* ---------------- Branding (emails + contract PDF) ---------------- */

const BRAND = { gold: '#fba924', purple: '#6e266c', purpleDeep: '#4f1a4d', ink: '#17121b', muted: '#4a4150', paper: '#eeece9', black: '#000000',
  site: 'https://www.magicmirrorrentalservices.com/', instagram: 'https://www.instagram.com/magicmirrorrentalservices/',
  dashboard: 'https://www.magicmirrorrentalservices.com/app/' };
// Magic Mirror logo, 400×246 PNG, embedded so emails and PDFs never depend on a hosted image.
const LOGO_PNG_B64 = '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';
function logoBlob_() { return Utilities.newBlob(Utilities.base64Decode(LOGO_PNG_B64), 'image/png', 'magic-mirror-logo.png'); }

/* ---------------- Email design ----------------
   Every email is built from the small pieces below, so they all share one look:
   black letterhead with a gold rule, a white card, and a black footer with the tagline.
   Styles are inline because most mail apps (Gmail, Outlook) ignore <style> blocks. */
const EF = "font-family:Montserrat,'Helvetica Neue',Helvetica,Arial,sans-serif";
const EM = { ink: '#17121b', muted: '#5c5262', line: '#e7e1ea', tint: '#f8f5f9', night: '#0e0b11', lilac: '#c4bacb' };

// Wraps an email body in the letterhead. pre is the one-line preview inboxes show next to the subject.
function emailHtml_(inner, pre) {
  const hidden = pre ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${esc_(pre)}${'&#8199;&#65279;&#847; '.repeat(40)}</div>` : '';
  return `${hidden}<div style="margin:0;padding:24px 6px;background:${BRAND.paper};${EF}">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;border-collapse:collapse">
    <tr><td align="center" style="background:${EM.night};padding:26px 32px 22px;border-bottom:3px solid ${BRAND.gold}">
      <a href="${BRAND.site}"><img src="cid:mmrslogo" width="156" height="96" alt="Magic Mirror Rental Services" style="display:block;border:0;margin:0 auto"></a></td></tr>
    <tr><td style="background:#ffffff;padding:32px 28px 28px;color:${EM.ink};font-size:16px;line-height:1.6;${EF}">${inner}</td></tr>
    <tr><td align="center" style="background:${EM.night};padding:26px 32px;color:${EM.lilac};font-size:13px;line-height:1.7;${EF}">
      <div style="color:${BRAND.gold};font-weight:800;font-size:14px;margin-bottom:6px">Providing the magic for your next event</div>
      <a href="mailto:${CONFIG.REPLY_TO}" style="color:#ffffff;text-decoration:none">${CONFIG.REPLY_TO}</a><br>
      <a href="${BRAND.site}" style="color:${EM.lilac};text-decoration:underline">Website</a> &nbsp;·&nbsp;
      <a href="${BRAND.instagram}" style="color:${EM.lilac};text-decoration:underline">Instagram</a> &nbsp;·&nbsp;
      <span>Serving Greater Boston since 2019</span></td></tr>
  </table></div>`;
}

// Small purple label, big headline, and an optional lead paragraph.
function eHead_(label, title, lead) {
  return (label ? `<p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.04em;color:${BRAND.purple}">${label}</p>` : '') +
    `<h1 style="margin:0 0 14px;font-size:28px;line-height:1.2;font-weight:800;color:${EM.ink};${EF}">${title}</h1>` +
    (lead ? `<p style="margin:0 0 24px;color:${EM.muted}">${lead}</p>` : '');
}
const eP_ = html => `<p style="margin:0 0 16px">${html}</p>`;
const eSmall_ = html => `<p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${EM.muted}">${html}</p>`;
const eSub_ = t => `<p style="margin:28px 0 10px;font-size:13px;font-weight:700;letter-spacing:.04em;color:${BRAND.purple}">${t}</p>`;
const eSign_ = () => `<p style="margin:28px 0 0">See you soon,<br><b>The Magic Mirror team</b></p>`;

// A tinted panel of label/value rows. rows: [[label, valueHtml], ...]; empty values are skipped.
function eFacts_(rows) {
  const tr = rows.filter(x => x && x[1] !== '' && x[1] != null).map((x, i) =>
    `<tr><td valign="top" style="padding:${i ? '10px' : '0'} 16px 0 0;width:84px;font-size:13px;color:${EM.muted};white-space:nowrap">${x[0]}</td>` +
    `<td valign="top" style="padding:${i ? '10px' : '0'} 0 0;font-size:15px;font-weight:600;color:${EM.ink}">${x[1]}</td></tr>`).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 24px">
    <tr><td style="background:${EM.tint};border-left:4px solid ${BRAND.purple};padding:16px 18px">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;${EF}">${tr}</table></td></tr></table>`;
}

// The usual facts for a booking row.
function eEventFacts_(r, extra) {
  const t = [fmtTime_(r[COL.START - 1]), fmtTime_(r[COL.END - 1])].filter(String).join(' – ');
  return eFacts_([['Event', esc_(r[COL.EVNAME - 1])], ['Date', esc_(longDate_(r[COL.DATE - 1]))], ['Time', esc_(t)],
    ['Venue', esc_([r[COL.VNAME - 1], r[COL.VADDR - 1]].filter(String).join(', '))], ['Booking', '#' + esc_(r[0])]].concat(extra || []));
}

// A big amount on a black panel, e.g. a balance due.
function eAmount_(label, n, note) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 24px">
    <tr><td align="center" style="background:${EM.night};padding:24px 20px;${EF}">
      <div style="font-size:13px;font-weight:700;letter-spacing:.04em;color:${EM.lilac}">${label}</div>
      <div style="font-size:40px;line-height:1.15;font-weight:800;color:${BRAND.gold};margin:6px 0 2px">${money_(n)}</div>
      ${note ? `<div style="font-size:14px;color:#ffffff">${note}</div>` : ''}</td></tr></table>`;
}

// A one-time code, spaced out and easy to read.
function eCode_(code) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 24px">
    <tr><td style="border:2px solid ${BRAND.gold};background:#fffaf0;padding:14px 26px;font-size:36px;font-weight:800;letter-spacing:10px;color:${EM.ink};${EF}">${esc_(code)}</td></tr></table>`;
}

// Short coloured tag, e.g. "Unconfirmed".
function eTag_(text, bad) {
  return `<span style="display:inline-block;padding:3px 10px;font-size:12px;font-weight:700;background:${bad ? '#fbe9e7' : '#e8f5ec'};color:${bad ? '#a1281b' : '#1d6b3a'}">${text}</span>`;
}

// Line items with a total.
function itemsTable_(p) {
  const td = 'padding:10px 0;border-bottom:1px solid ' + EM.line;
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 24px;font-size:15px;${EF}">` +
    p.items.map(i => `<tr><td style="${td}">${esc_(i[0])}</td><td align="right" style="${td};white-space:nowrap">${money_(i[1])}</td></tr>`).join('') +
    `<tr><td style="padding:12px 0 0;font-weight:800">Total</td><td align="right" style="padding:12px 0 0;font-weight:800;font-size:18px">${money_(p.total)}</td></tr></table>`;
}

// Where the client is in the booking process, as a checklist. Shows what is done and what comes next.
function eSteps_(r) {
  const paid = num_(r[COL.PAID - 1]), owed = num_(r[COL.TOTAL - 1]) - paid;
  // [done?, label when done, label while still to do]
  const steps = [[true, 'Booking request sent'], [paid >= CONFIG.DEPOSIT - 0.005 || owed <= 0.005, 'Reservation fee paid', 'Pay the reservation fee'],
    [!!r[COL.SIGNED_AT - 1], 'Contract signed', 'Sign your contract'], [!!r[COL.TEMPLATE - 1], 'Print design chosen', 'Choose your print design'],
    [!!r[COL.DETAILS_AT - 1], 'Event details confirmed', 'Confirm your event details'], [owed <= 0.005, 'Balance paid', 'Pay the balance (due 14 days before)']];
  let next = false;
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 8px;${EF}">` +
    steps.map((s, i) => {
      const isNext = !s[0] && !next; if (isNext) next = true;
      const dot = s[0] ? `<td width="24" height="24" align="center" style="background:${BRAND.gold};color:${EM.night};font-size:13px;font-weight:800;border-radius:12px">&#10003;</td>`
        : `<td width="20" height="20" align="center" style="border:2px solid ${isNext ? BRAND.purple : EM.line};color:${isNext ? BRAND.purple : '#a59cab'};font-size:12px;font-weight:700;border-radius:12px">${i + 1}</td>`;
      return `<tr><td width="36" style="padding:6px 0"><table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr>${dot}</tr></table></td>
        <td style="padding:6px 0;font-size:15px;color:${s[0] ? EM.muted : EM.ink};font-weight:${isNext ? 700 : 500}">${s[0] ? s[1] : s[2]}${isNext ? ` <span style="color:${BRAND.purple};font-size:13px">&nbsp;Next step</span>` : ''}</td></tr>`;
    }).join('') + '</table>';
}

// "Saturday, January 24, 2027" from a Date or an MM/dd/yyyy string.
function longDate_(v) {
  let d = v;
  if (!(v instanceof Date)) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(v || '').trim());
    if (!m) return String(v || '');
    d = new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], 17));   // midday in Boston, so the day never shifts
  }
  return Utilities.formatDate(d, CONFIG.TZ, 'EEEE, MMMM d, yyyy');
}
// "$1,250.00"
function money_(n) {
  const s = Math.abs(Number(n) || 0).toFixed(2).split('.');
  return (Number(n) < 0 ? '-$' : '$') + s[0].replace(/\B(?=(\d{3})+$)/g, ',') + '.' + s[1];
}

// A gold, square-cornered button, matching the site's buttons.
function emailButton_(url, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 24px"><tr>
    <td style="background:${BRAND.gold}"><a href="${url}" style="display:inline-block;padding:15px 28px;color:${EM.night};font-weight:800;font-size:16px;text-decoration:none;${EF}">${label}</a></td></tr></table>`;
}

// Every email goes through here so they all carry the brand.
// Sends from CONFIG.FROM when the account running the script is that address or has it as a Gmail
// "Send mail as" alias; otherwise sends from the running account with replies going to CONFIG.FROM.
function sendMail_(o) {
  const html = emailHtml_(o.htmlBody || '', o.preheader), images = Object.assign({ mmrslogo: logoBlob_() }, o.inlineImages || {});
  const opts = { htmlBody: html, name: o.name || CONFIG.BUSINESS, replyTo: o.replyTo || CONFIG.FROM, inlineImages: images };
  if (o.attachments) opts.attachments = o.attachments;
  try {
    if (canSendAs_()) opts.from = CONFIG.FROM;
    GmailApp.sendEmail(o.to, o.subject, 'Please view this email in an HTML-capable mail app.', opts);
  } catch (e) {
    Logger.log('GmailApp failed, using MailApp: ' + e);
    MailApp.sendEmail(Object.assign({}, o, { htmlBody: html, name: opts.name, replyTo: opts.replyTo, inlineImages: images }));
  }
}

let canSendAs__;
function canSendAs_() {
  if (canSendAs__ !== undefined) return canSendAs__;
  const cache = CacheService.getScriptCache(), hit = cache.get('canSendAs');
  if (hit) return (canSendAs__ = hit === '1');
  const me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase(), from = CONFIG.FROM.toLowerCase();
  try { canSendAs__ = me === from || GmailApp.getAliases().some(a => a.toLowerCase() === from); }
  catch (e) { canSendAs__ = false; }
  cache.put('canSendAs', canSendAs__ ? '1' : '0', 6 * 3600);
  return canSendAs__;
}

/* ---------------- Lookup (client portal) ---------------- */

// What the client portal sees for one booking row (includes its private key).
function bookingView_(r) {
  const g = c => r[c - 1];
  const items = [];
  const byName = (tbl, name) => Object.keys(tbl).find(k => tbl[k][0] === name);
  const pk = byName(CONFIG.PACKAGES, g(COL.PKG)); if (pk) items.push(['Mirror Me Booth - ' + CONFIG.PACKAGES[pk][0], CONFIG.PACKAGES[pk][1]]);
  const pr = byName(CONFIG.PRINTS, g(COL.PRINT)); if (pr) items.push(CONFIG.PRINTS[pr]);
  String(g(COL.XTIME) || '').split(', ').filter(String).forEach(n => { const t = byName(CONFIG.TIMES, n); if (t) items.push(CONFIG.TIMES[t]); });
  if (Number(g(COL.FEE)) > 0) items.push(['Travel', Number(g(COL.FEE))]);
  // A promo discount is whatever the stored total is below the listed prices.
  const coupon = String(g(COL.COUPON) || ''), gap = Math.round((items.reduce((s, i) => s + i[1], 0) - (Number(g(COL.TOTAL)) || 0)) * 100) / 100;
  if (coupon && gap > 0) items.splice(items.length - (Number(g(COL.FEE)) > 0 ? 1 : 0), 0, ['Promo code ' + coupon, -gap]);
  return {
    id: g(COL.ID), key: keyOf_(r), date: fmtDate_(g(COL.DATE)), status: g(COL.STATUS), start: g(COL.START), end: g(COL.END),
    arrive: g(COL.ARRIVE), depart: g(COL.DEPART), evName: g(COL.EVNAME), vName: g(COL.VNAME), vAddr: g(COL.VADDR),
    vZip: g(COL.VZIP), fn: g(COL.FN), ln: g(COL.LN), email: g(COL.EMAIL), phone: g(COL.PHONE),
    items, total: Number(g(COL.TOTAL)) || 0, paid: Number(g(COL.PAID)) || 0,
    signedAt: g(COL.SIGNED_AT) ? fmtStamp_(g(COL.SIGNED_AT)) : '',
    created: g(COL.CREATED) ? fmtStamp_(g(COL.CREATED)) : '', street: g(COL.STREET), zip: g(COL.ZIP),
    template: g(COL.TEMPLATE) || '', templateText: g(COL.TEMPLATE_TEXT) || '', customPrint: g(COL.PRINT) === CONFIG.PRINTS.cus[0],
    onsiteName: g(COL.ONSITE_NAME) || '', onsitePhone: g(COL.ONSITE_PHONE) || '', guests: g(COL.GUESTS) || '',
    setupNotes: g(COL.SETUP_NOTES) || '', detailsAt: g(COL.DETAILS_AT) ? fmtStamp_(g(COL.DETAILS_AT)) : ''
  };
}

/* ---------------- Emails ---------------- */

function notifyOwner_(id, b, p, milesNote, milesChecked) {
  const ss = SpreadsheetApp.getActive(), e = esc_;
  sendMail_({
    to: CONFIG.NOTIFY,
    subject: `New booking #${id}: ${b.evName} on ${b.date}`,
    preheader: `${b.fn} ${b.ln} · ${longDate_(b.date)} · ${money_(p.total)}`,
    htmlBody: eHead_(`New booking #${id} &nbsp;${eTag_('Unconfirmed', true)}`, e(b.evName)) +
      eFacts_([['Date', e(longDate_(b.date))], ['Time', e(b.start) + (b.end ? ' – ' + e(b.end) : '')],
        ['Venue', `${e(b.vName)}, ${e(b.vAddr)} ${e(b.vZip)}`], ['Type', e(b.eventType)],
        ['Client', `${e(b.fn)} ${e(b.ln)}<br><a href="mailto:${e(b.email)}" style="color:${BRAND.purple}">${e(b.email)}</a><br>${e(b.phone)}`]]) +
      itemsTable_(p) +
      eSmall_(`Payment choice: ${e(b.payOpt)}<br>Travel: ${p.miles} miles ${milesChecked ? '(Google Maps)' : '(typed by the client, not checked)'}${milesNote ? '<br>' + e(milesNote) : ''}`) +
      emailButton_(BRAND.dashboard, 'Open the dashboard') +
      eSmall_(`Or <a href="${ss.getUrl()}" style="color:${BRAND.purple}">open the MMRS Bookings sheet</a>.`)
  });
}

function confirmClient_(id, b, p, r) {
  sendMail_({
    to: b.email,
    replyTo: CONFIG.REPLY_TO,
    subject: `Your booking request #${id} – ${CONFIG.BUSINESS}`,
    preheader: `We've received your request for ${longDate_(b.date)}. Here's what happens next.`,
    htmlBody: eHead_('Booking request received', `Thank you, ${esc_(b.fn)}.`,
        `We've received your request for <b style="color:${EM.ink}">${esc_(b.evName)}</b> and will confirm it shortly.`) +
      eEventFacts_(r) +
      itemsTable_(p) +
      eP_(`A non-refundable ${money_(CONFIG.DEPOSIT)} reservation fee secures your date. The remaining balance is due 14 days before your event.`) +
      portalLink_(r, 'View your booking') +
      eSub_('What happens next') + eSteps_(r) +
      eSmall_(`Keep this email: the button above opens your booking any time. You can also look it up on our website with booking ID <b>${id}</b> and your last name.`) +
      eSign_()
  });
}

function fmtStamp_(v) { return v instanceof Date ? Utilities.formatDate(v, CONFIG.TZ, 'MM/dd/yyyy h:mm a z') : String(v); }
function esc_(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

function findRow_(id, ln) {
  const rows = rows_();
  const i = rows.findIndex(x => String(x[0]) === String(id).trim() &&
                                String(x[COL.LN - 1]).toLowerCase() === String(ln || '').trim().toLowerCase());
  return i === -1 ? null : { index: i + 2, r: rows[i] };
}

// The contract wording is Magic Mirror Rental Services' existing BoothBook contract.
function contractHtml_(r, signedOn) {
  const g = c => esc_(r[c - 1]);
  const B = CONFIG.BUSINESS, client = g(COL.FN) + ' ' + g(COL.LN);
  const date = esc_(fmtDate_(r[COL.DATE - 1]));
  return `
<h1>${B} Contract</h1>
<p>The following Contract and its terms will set forth an agreement between <b><i>${B}</i></b> (Provider) and <b><i>${client}</i></b> (Client) on <b><i>${esc_(signedOn)}</i></b>, for photo booth services for <b><i>${g(COL.EVNAME)}</i></b> taking place at <b><i>${g(COL.VADDR)}</i></b>. This written Contract sets forth the full, written intention of both parties and supersedes all other written and/or oral agreements between the parties.</p>
<h2>1. Service Period</h2>
<p>The service period will be <b><i>from ${g(COL.START)} to ${g(COL.END) || 'the agreed end time'}</i></b> on <b><i>${date}</i></b>. Provider agrees to have <b><i>Mirror Me Booth</i></b> operational for a minimum of 80% during this period; occasionally, operations may need to be interrupted for maintenance of the Photo Booth. Provider will arrive at a minimum of 60 minutes before the event start time to setup and 30 minutes after the event end time to properly pack up.</p>
<p>Use of Service will commence at the agreed time and finish at the agreed time unless due to technical difficulties on our behalf during the service period. If your event simply starts late or runs late, our Term of Service will still be from the agreed times unless we agree to provide additional hours as per our additions.</p>
<h2>2. Payment</h2>
<p>A non-refundable reservation fee in the amount of <b>$${CONFIG.DEPOSIT}</b> is due upon signing of this Contract. The remaining amount is <b>due 14 days in advance</b> of the Client's Event. If there is 14 days or less before the Event, payment in full will be required at booking. If the operator uses the equipment for a time period in excess of the Service period agreed to in the invoice, the overage in rental time will be billed to the operator at the rates listed on our online booking system. Payment for any overage in time must be paid before additional hours are provided. Client agrees that in addition to any and all other legal rights and remedies <b><i>${B}</i></b> may have, <b><i>${client}</i></b> will pay a $50.00 fee for any and all returned checks which Client may write to Provider as payment for any Service provided.</p>
<h2>3. Venue, Location, Access</h2>
<p>It is Client's responsibility to ensure they have provided the venues contact information, address, name, and postal code for Provider's attendants to find the Client. Provider also require that the venue allows reasonable access for loading, and suitable parking once the booth and equipment has been unloaded. If parking for loading is restricted Client will be liable for any fines that occur as a result and or time used seeking a suitable location. Provider cannot be held responsible for any errors or delays resulting from incorrect or missing address details.</p>
<p>It is Client's responsibility to ensure that the venue has agreed for Provider to be in attendance at their venue and at the agreed time. This also includes ensuring that there is access to enter the venue and sufficient space to properly setup Provider's equipment.</p>
<p>It is Client's responsibility to inform the Provider of any circumstances that may make setting up take longer, these may include but are not exhaustive to; going upstairs, a long distance from unloading area to set-up area, restricted access. If the Provider is not aware of these and the set-up takes longer than normal the Service period may be affected.</p>
<h2>4. Tables, Space &amp; Power for Photo Booth</h2>
<p>Our Magic Mirror Photo booth requires 12' x 12' operational space. If the booth is placed outdoors, Client shall provide an overhead shelter for the photo booth and sufficient protection from the elements. Client is responsible for providing power for the photo booth (120 Volt, 3 prong standard power outlet), Wi-Fi Network Connection, a table with two chairs, and approximately 10 feet of space in front of the booth. <b><i>${B}</i></b> reserves the right, in good faith, to cease the operation should the weather pose a potential danger to our personnel, the equipment, or guests. Since safety is paramount in all decisions, Provider's compensation will not be affected if the operation is ended.</p>
<h2>5. Date Changes &amp; Cancellations</h2>
<p>Any request for a date change must be made in writing at least thirty days in advance of the original event date. Change is subject to photo booth availability and receipt of a new Service Contract. If there is no availability for the alternate date, the non-refundable reservation fee shall be forfeited and the event cancelled. If the event is cancelled for any reason, the non-refundable reservation fee is forfeited.</p>
<h2>6. Force Majeure Event</h2>
<p><b>${B}</b> cannot be held responsible for any circumstances that may prevent Providers from attending the Event; these may include but are not limited to, severe weather conditions, traffic delays, breakdown of our vehicles, sickness, pandemics, lockdowns or equipment failure. In the case that Provider cannot attend or fulfill Client's your hire due to events beyond Provider's control Provider will contact the Client or the venue as soon as possible. In these instances, Provider's liability will be limited to the refunding of all payments received from the Client.</p>
<h2>7. Damage to Provider's Equipment</h2>
<p>Client acknowledges that it shall be responsible for any damage or loss to the Provider's Equipment caused by a) Any misuse of the Provider's Equipment by Client or its guests, or b) Any theft or disaster (including but not limited to fire, flood or earthquake).</p>
<h2>8. Indemnification</h2>
<p>Client agrees to, and understands the following: a) Client will indemnify the provider against any and all liability related to Client's Event; during or after Client's event. Client will indemnify Provider from the time of Service and on into the future, against any liability associated with Client. b) Client will indemnify Provider against any and all liability associated with the use of pictures taken with <b><i>${B}</i></b> its representatives, employees or affiliates at Client's event.</p>
<h2>9. Model Release Option</h2>
<p>Client agrees to, and understands the following: All guests using the photo booth hereby given <b><i>${B}</i></b> the right and permission to copyright and use, photographic portraits or pictures of any photo booth user who may be included intact or in part, made through any and all media now or hereafter known for illustration, art, promotion, advertising, trade, or any other purpose. In addition, Client, hereby release, discharge and agree to save <b><i>${B}</i></b>, from any liability, that may occur or be produced in the taking of said picture or in any subsequent processing thereof, as well as any publication thereof, including without limitation any claims for libel or invasion of privacy.</p>
<h2>10. Miscellaneous Terms</h2>
<p>If any provision of these terms shall be unlawful, void, or for any reason unenforceable under Contract Law, then that provision, or portion thereof, shall be deemed separate from the rest of this Contract and shall not affect the validity and enforceability of any remaining provisions, or portions thereof. This is the entire Contract between Provider and Client relating to the subject matter herein and shall not be modified except in writing, signed by both parties. In the event of a conflict between Parties, Client agrees to solve any arguments by way of arbitration. In the event Provider is unable to supply a working photo booth for at least 80% of the Service Period, Client shall be refunded a prorated amount based on the amount of Service received. If no Service is received, Provider's maximum liability will be the return of all payments received from Client. Provider is not responsible for any consequential damages or lost opportunities upon breach of this Contract.</p>`;
}

function contractHash_(html) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, html, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function getContract_(f) {
  const signedAt = f.r[COL.SIGNED_AT - 1];
  const on = signedAt ? fmtStamp_(signedAt) : Utilities.formatDate(new Date(), CONFIG.TZ, 'MM/dd/yyyy');
  const html = contractHtml_(f.r, on);
  return { ok: true, html, hash: contractHash_(html), signedAt: signedAt ? fmtStamp_(signedAt) : '',
           signer: f.r[COL.SIGNER - 1] || '', consent: CONSENT_TEXT };
}

const CONSENT_TEXT = 'By signing, you agree to use an electronic signature and to receive this contract electronically. Your electronic signature is legally binding, and your name, IP address, date and time are recorded as proof of your intent to sign (US ESIGN Act and UETA).';

function signContract_(b, f) {
  if (f.r[COL.SIGNED_AT - 1]) return { ok: false, error: 'ALREADY_SIGNED' };
  if (String(f.r[COL.STATUS - 1]) === 'Cancelled') return { ok: false, error: 'CANCELLED' };
  const name = clip_(b.signerName, 120), title = clip_(b.signerTitle, 120);
  if (!name || !title) return { ok: false, error: 'Missing signer name or title' };
  if (!b.consent) return { ok: false, error: 'Consent to sign electronically is required' };
  const m = /^data:image\/png;base64,([A-Za-z0-9+\/=]+)$/.exec(String(b.signature || ''));
  if (!m || m[1].length < 200 || m[1].length > 400000) return { ok: false, error: 'Signature missing' };

  const now = new Date(), stamp = fmtStamp_(now);
  const body = contractHtml_(f.r, stamp);
  const hash = contractHash_(body);
  const ip = REQ.ip && REQ.ip !== 'unknown' ? REQ.ip + (REQ.verified ? '' : ' (not verified)') : 'not captured', ua = REQ.ua;
  const id = f.r[0];

  const doc = `<html><head><meta charset="utf-8"><style>
    body{font-family:Montserrat,'Helvetica Neue',Arial,sans-serif;font-size:10.5pt;line-height:1.5;color:${BRAND.ink};margin:0}
    .head{background:#000;padding:18px 36px} .head td{color:#ffffff;font-size:9.5pt;vertical-align:middle}
    .head a{color:${BRAND.gold};text-decoration:none}
    .bar{background:${BRAND.purple};height:6px}
    .page{margin:28px 36px}
    h1{font-size:19pt;margin:0 0 12px;color:${BRAND.purple}} h2{font-size:12pt;margin:18px 0 6px;color:${BRAND.purple}}
    .sig{margin-top:28px;background:${BRAND.paper};padding:16px 18px} .sig img{height:90px;background:#ffffff}
    .audit{margin-top:20px;font-size:8.5pt;color:${BRAND.muted};background:#f6f4f2;padding:12px 14px}
    .foot{margin-top:24px;font-size:8.5pt;color:${BRAND.muted}}
  </style></head><body>
  <div class="head"><table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td><img src="data:image/png;base64,${LOGO_PNG_B64}" width="150" height="92" alt="Magic Mirror Rental Services"></td>
    <td style="text-align:right"><b style="color:${BRAND.gold}">Photo booth services contract</b><br>Booking #${esc_(id)}<br>
      <a href="mailto:${CONFIG.REPLY_TO}">${CONFIG.REPLY_TO}</a><br>magicmirrorrentalservices.com</td></tr></table></div>
  <div class="bar"></div>
  <div class="page">${body}
  <p><b>Model release:</b> ${b.modelRelease ? 'Client confirmed' : 'Client did not confirm'}</p>
  <div class="sig"><p><b>Client signature</b></p><img src="data:image/png;base64,${m[1]}"><p>${esc_(name)}, ${esc_(title)}<br>Signed ${esc_(stamp)}</p></div>
  <div class="audit"><b>Electronic signature record</b><br>Booking ID: ${esc_(id)}<br>Signer: ${esc_(name)} (${esc_(title)})<br>
  Signed: ${esc_(stamp)}<br>IP address: ${esc_(ip)}<br>Browser: ${esc_(ua)}<br>Contract SHA-256: ${hash}<br>Consent: ${esc_(CONSENT_TEXT)}</div>
  <p class="foot">${CONFIG.BUSINESS} · Serving Greater Boston since 2019 · Providing the magic for your next event.</p>
  </div></body></html>`;
  const pdf = Utilities.newBlob(doc, 'text/html', 'contract.html').getAs('application/pdf')
    .setName(`Contract #${id} - ${f.r[COL.FN - 1]} ${f.r[COL.LN - 1]} - ${fmtDate_(f.r[COL.DATE - 1]).replace(/\//g, '-')}.pdf`);
  const file = contractsFolder_().createFile(pdf);

  const sh = sheet_('Bookings');
  sh.getRange(f.index, COL.SIGNED_AT).setNumberFormat('MM/dd/yyyy h:mm am/pm');
  sh.getRange(f.index, COL.SIGNER, 1, 2).setNumberFormat('@');
  sh.getRange(f.index, COL.SIGNED_AT, 1, 5).setValues([[now, txt_(name + ' (' + title + ')'), txt_(ip), file.getUrl(), b.modelRelease ? 'Yes' : 'No']]);

  const subj = `Signed contract #${id} – ${CONFIG.BUSINESS}`;
  sendMail_({ to: f.r[COL.EMAIL - 1], replyTo: CONFIG.REPLY_TO, name: CONFIG.BUSINESS, subject: subj,
    preheader: 'Your signed copy is attached for your records.',
    htmlBody: eHead_('Contract signed', `Thank you, ${esc_(f.r[COL.FN - 1])}.`, 'Your contract is signed and a copy is attached to this email for your records.') +
      eEventFacts_(f.r, [['Signed', esc_(stamp) + ' by ' + esc_(name)]]) +
      portalLink_(f.r, 'View your booking') + eSub_('Your progress') + eSteps_(Object.assign(f.r.slice(), { [COL.SIGNED_AT - 1]: now })) + eSign_(),
    attachments: [pdf] });
  sendMail_({ to: CONFIG.NOTIFY, subject: `Contract signed: #${id} ${f.r[COL.EVNAME - 1]}`,
    preheader: `${name} signed at ${stamp}`,
    htmlBody: eHead_(`Contract signed &nbsp;${eTag_('Signed')}`, esc_(f.r[COL.EVNAME - 1])) +
      eEventFacts_(f.r, [['Signed by', esc_(name)], ['When', esc_(stamp)]]) +
      emailButton_(file.getUrl(), 'Open signed PDF in Drive') + eSmall_('The PDF is also attached.'),
    attachments: [pdf] });
  return { ok: true, signedAt: stamp };
}

function contractsFolder_() {
  const name = 'MMRS Signed Contracts';
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

/* ---------------- Template, details, messages ---------------- */

const clip_ = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

function saveTemplate_(b, f) {
  if (limited_('tpl:' + f.r[0], 10, 3600)) return tooMany_();
  const t = clip_(b.template, 120); if (!t) return { ok: false, error: 'Choose a template' };
  const text = clip_(b.templateText, 300);
  const sh = sheet_('Bookings');
  sh.getRange(f.index, COL.TEMPLATE, 1, 2).setNumberFormat('@').setValues([[txt_(t), txt_(text)]]);
  sendMail_({ to: CONFIG.NOTIFY, replyTo: f.r[COL.EMAIL - 1],
    subject: `Template chosen: #${f.r[0]} ${f.r[COL.EVNAME - 1]}`,
    preheader: `${f.r[COL.FN - 1]} ${f.r[COL.LN - 1]} chose ${t}`,
    htmlBody: eHead_('Print template chosen', esc_(f.r[COL.EVNAME - 1])) +
      eEventFacts_(f.r, [['Client', esc_(f.r[COL.FN - 1] + ' ' + f.r[COL.LN - 1])], ['Template', esc_(t)], ['Print text', esc_(text) || '(none)']]) +
      emailButton_(BRAND.dashboard, 'Open the dashboard') });
  return { ok: true };
}

function saveDetails_(b, f) {
  if (limited_('details:' + f.r[0], 10, 3600)) return tooMany_();
  const name = clip_(b.onsiteName, 120), phone = clip_(b.onsitePhone, 40);
  if (!name || !phone) return { ok: false, error: 'On-site contact name and phone are required' };
  if (!b.confirm) return { ok: false, error: 'Please confirm the details' };
  const now = new Date(), sh = sheet_('Bookings');
  sh.getRange(f.index, COL.ONSITE_NAME, 1, 4).setNumberFormat('@').setValues([[txt_(name), txt_(phone), txt_(clip_(b.guests, 20)), txt_(clip_(b.setupNotes, 2000))]]);
  sh.getRange(f.index, COL.DETAILS_AT).setNumberFormat('MM/dd/yyyy h:mm am/pm').setValue(now);
  sendMail_({ to: CONFIG.NOTIFY, replyTo: f.r[COL.EMAIL - 1],
    subject: `Details confirmed: #${f.r[0]} ${f.r[COL.EVNAME - 1]}`,
    preheader: `On-site contact: ${name}`,
    htmlBody: eHead_('Event details confirmed', esc_(f.r[COL.EVNAME - 1])) +
      eEventFacts_(f.r, [['On-site', esc_(name) + '<br>' + esc_(phone)], ['Guests', esc_(clip_(b.guests, 20)) || 'Not given'],
        ['Setup notes', esc_(clip_(b.setupNotes, 2000)).replace(/\n/g, '<br>') || 'None']]) +
      emailButton_(BRAND.dashboard, 'Open the dashboard') });
  return { ok: true, detailsAt: fmtStamp_(now) };
}

// Messages tab: Booking ID | Sent | From | Message. To reply to a client, either reply to the
// alert email (it goes straight to them) or add a row here with From = "Magic Mirror".
function messagesSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('Messages');
  if (!sh) { sh = ss.insertSheet('Messages'); sh.appendRow(['Booking ID', 'Sent', 'From', 'Message']); sh.setFrozenRows(1); }
  return sh;
}

function getMessages_(f) {
  const sh = messagesSheet_(), n = sh.getLastRow();
  const list = n < 2 ? [] : sh.getRange(2, 1, n - 1, 4).getValues()
    .filter(r => String(r[0]) === String(f.r[0]))
    .map(r => ({ at: fmtStamp_(r[1]), from: String(r[2]) === 'Client' ? 'You' : (r[2] || CONFIG.BUSINESS), text: String(r[3]) }));
  return { ok: true, messages: list };
}

function addMessage_(b, f) {
  const text = clip_(b.text, 2000); if (!text) return { ok: false, error: 'Message is empty' };
  if (limited_('msg:' + f.r[0], 10, 3600) || limited_('msg-ip:' + REQ.ip, 30, 3600)) return tooMany_();
  const sh = messagesSheet_(), row = sh.getLastRow() + 1;
  sh.getRange(row, 4).setNumberFormat('@');
  sh.getRange(row, 1, 1, 4).setValues([[f.r[0], new Date(), 'Client', txt_(text)]]);
  sendMail_({ to: CONFIG.NOTIFY, replyTo: f.r[COL.EMAIL - 1],
    subject: `Message from ${f.r[COL.FN - 1]} ${f.r[COL.LN - 1]} (booking #${f.r[0]})`,
    preheader: text.slice(0, 90),
    htmlBody: eHead_(`Message · booking #${f.r[0]}`, `${esc_(f.r[COL.FN - 1] + ' ' + f.r[COL.LN - 1])} wrote:`) +
      `<div style="margin:0 0 24px;padding:18px 20px;background:${EM.tint};border-left:4px solid ${BRAND.gold};font-size:16px">${esc_(text).replace(/\n/g, '<br>')}</div>` +
      eSmall_(`${esc_(f.r[COL.EVNAME - 1])} · ${esc_(longDate_(f.r[COL.DATE - 1]))}`) +
      eSmall_(`Reply to this email to answer ${esc_(f.r[COL.FN - 1])} directly, or reply from the dashboard so it shows in their booking.`) +
      emailButton_(BRAND.dashboard, 'Reply in the dashboard') });
  return getMessages_(f);
}

/* ---------------- Owner dashboard ----------------
   Open it at the "Owner dashboard" deployment URL (access: Only myself) with ?admin on the end.
   Every function below checks that the signed-in Google user is OWNER_EMAIL, so the public
   deployment can never use them. */

function isOwner_() {
  const me = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  return !!me && CONFIG.ADMINS.some(a => a.toLowerCase() === me);
}
let apiAdmin_ = '';   // set when a request comes from the app.* dashboard with a valid session
function guard_() { if (!apiAdmin_ && !isOwner_()) throw new Error('Not authorised'); }

function adminPage_() {
  if (!isOwner_()) return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">Not authorised.</p>');
  return HtmlService.createHtmlOutputFromFile('Admin').setTitle('Magic Mirror · Dashboard')
    .setFaviconUrl('https://www.magicmirrorrentalservices.com/images/brand/apple-touch-icon.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function paymentsSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('Payments');
  if (!sh) { sh = ss.insertSheet('Payments'); sh.appendRow(['Booking ID', 'Date', 'Amount', 'Method', 'Note', 'Recorded']); sh.setFrozenRows(1); }
  return sh;
}

function ensureAdminCols_() { ensureCols_(); }

function num_(v) { const n = Number(v); return isFinite(n) ? n : 0; }

function adminData() {
  guard_(); ensureAdminCols_();
  const bookings = rows_().filter(r => r[0] !== '').map(r => ({
    id: Number(r[0]), created: fmtDate_(r[1]), status: String(r[COL.STATUS - 1]), date: fmtDate_(r[COL.DATE - 1]),
    type: String(r[COL.TYPE - 1]), evName: String(r[COL.EVNAME - 1]), start: fmtTime_(r[COL.START - 1]), end: fmtTime_(r[COL.END - 1]),
    arrive: fmtTime_(r[COL.ARRIVE - 1]), depart: fmtTime_(r[COL.DEPART - 1]),
    vName: String(r[COL.VNAME - 1]), vAddr: String(r[COL.VADDR - 1]), vZip: String(r[COL.VZIP - 1]), miles: r[COL.MILES - 1],
    fn: String(r[COL.FN - 1]), ln: String(r[COL.LN - 1]), email: String(r[COL.EMAIL - 1]), phone: String(r[COL.PHONE - 1]),
    pkg: String(r[COL.PKG - 1]), print: String(r[COL.PRINT - 1]), xtime: String(r[COL.XTIME - 1]),
    total: num_(r[COL.TOTAL - 1]), paid: num_(r[COL.PAID - 1]), notes: String(r[COL.NOTES - 1]),
    signedAt: r[COL.SIGNED_AT - 1] ? fmtStamp_(r[COL.SIGNED_AT - 1]) : '', signer: String(r[COL.SIGNER - 1]),
    pdf: String(r[COL.CONTRACT_PDF - 1]), template: String(r[COL.TEMPLATE - 1]), templateText: String(r[COL.TEMPLATE_TEXT - 1]),
    onsiteName: String(r[COL.ONSITE_NAME - 1]), onsitePhone: String(r[COL.ONSITE_PHONE - 1]), guests: String(r[COL.GUESTS - 1]),
    setupNotes: String(r[COL.SETUP_NOTES - 1]), detailsAt: r[COL.DETAILS_AT - 1] ? fmtStamp_(r[COL.DETAILS_AT - 1]) : '',
    coupon: String(r[COL.COUPON - 1] || ''),
    staff: String(r[COL.STAFF - 1] || ''), adminNotes: String(r[COL.ADMIN_NOTES - 1] || ''), teamNotes: String(r[COL.TEAM_NOTES - 1] || '')
  }));
  const ms = messagesSheet_(), mn = ms.getLastRow();
  const messages = mn < 2 ? [] : ms.getRange(2, 1, mn - 1, 4).getValues().filter(r => r[0] !== '')
    .map(r => ({ id: Number(r[0]), at: fmtStamp_(r[1]), ts: r[1] instanceof Date ? r[1].getTime() : 0, from: String(r[2]), text: String(r[3]) }));
  const ps = paymentsSheet_(), pn = ps.getLastRow();
  const payments = pn < 2 ? [] : ps.getRange(2, 1, pn - 1, 5).getValues().filter(r => r[0] !== '')
    .map(r => ({ id: Number(r[0]), date: fmtDate_(r[1]), amount: num_(r[2]), method: String(r[3]), note: String(r[4]) }));
  const bl = sheet_('Blocked Dates'), bn = bl.getLastRow();
  const blocked = bn < 2 ? [] : bl.getRange(2, 1, bn - 1, 2).getValues().filter(r => r[0])
    .map(r => ({ date: fmtDate_(r[0]), reason: String(r[1] || '') }));
  const promos = promos_().map(p => { const o = Object.assign({}, p); delete o.row; o.problem = promoProblem_(p); return o; });
  return { bookings, messages, payments, blocked, promos, staff: CONFIG.STAFF.map(s => s.name),
    statuses: ['Unconfirmed', 'Confirmed', 'Completed', 'Cancelled'], today: Utilities.formatDate(new Date(), CONFIG.TZ, 'MM/dd/yyyy') };
}

function fmtTime_(v) { return v instanceof Date ? Utilities.formatDate(v, CONFIG.TZ, 'h:mm a').toLowerCase() : String(v || '').trim(); }

function rowById_(id) {
  const i = rows_().findIndex(x => String(x[0]) === String(id));
  if (i === -1) throw new Error('Booking #' + id + ' not found');
  return i + 2;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// f: { status, staff, adminNotes, teamNotes }
function adminUpdate(id, f) {
  guard_();
  return withLock_(() => {
    const sh = sheet_('Bookings'), row = rowById_(id), r = sh.getRange(row, 1, 1, NCOL).getValues()[0];
    if (f.status !== undefined) {
      if (['Unconfirmed', 'Confirmed', 'Completed', 'Cancelled'].indexOf(f.status) === -1) throw new Error('Bad status');
      sh.getRange(row, COL.STATUS).setValue(f.status);
    }
    if (f.staff !== undefined && f.staff !== String(r[COL.STAFF - 1] || '')) {
      sh.getRange(row, COL.STAFF).setValue(clip_(f.staff, 100));
      notifyStaff_(r, f.staff);
    }
    if (f.adminNotes !== undefined) sh.getRange(row, COL.ADMIN_NOTES).setNumberFormat('@').setValue(clip_(f.adminNotes, 5000));
    if (f.teamNotes !== undefined) sh.getRange(row, COL.TEAM_NOTES).setNumberFormat('@').setValue(clip_(f.teamNotes, 5000));
    return adminData();
  });
}

// Tells each newly assigned staff member (who has an email in CONFIG.STAFF) about the event.
function notifyStaff_(r, staffList) {
  const before = String(r[COL.STAFF - 1] || '').split(',').map(s => s.trim());
  String(staffList || '').split(',').map(s => s.trim()).filter(n => n && before.indexOf(n) === -1).forEach(n => {
    const s = CONFIG.STAFF.find(x => x.name === n);
    if (!s || !s.email || s.email.toLowerCase() === CONFIG.OWNER_EMAIL.toLowerCase()) return;   // no email to yourself
    sendMail_({ to: s.email, subject: `You're assigned: ${r[COL.EVNAME - 1]} on ${fmtDate_(r[COL.DATE - 1])} (#${r[0]})`,
      preheader: `${longDate_(r[COL.DATE - 1])} at ${r[COL.VNAME - 1]}`,
      htmlBody: eHead_("You're on the team", `Hi ${esc_(n.split(' ')[0])}, you're working ${esc_(r[COL.EVNAME - 1])}.`) +
        eFacts_([['Date', esc_(longDate_(r[COL.DATE - 1]))], ['Event', `${esc_(fmtTime_(r[COL.START - 1]))} – ${esc_(fmtTime_(r[COL.END - 1]))}`],
          ['Arrive', esc_(fmtTime_(r[COL.ARRIVE - 1]))], ['Venue', esc_([r[COL.VNAME - 1], r[COL.VADDR - 1]].filter(String).join(', '))],
          ['Package', esc_(r[COL.PKG - 1])], ['Booking', '#' + esc_(r[0])], ['Team notes', esc_(r[COL.TEAM_NOTES - 1] || '—')]]) +
        eSmall_('Questions? Reply to this email.') });
  });
}

// New promo code. p: { code, type: 'percent'|'amount', amount, expires (MM/dd/yyyy or ''), maxUses (0 = no limit), note }
function adminPromoSave(p) {
  guard_(); p = p || {};
  const code = normCode_(p.code);
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new Error('Use 3 to 30 letters or numbers for the code');
  const type = p.type === 'amount' ? 'amount' : 'percent', amount = Math.round(Number(p.amount) * 100) / 100;
  if (!(amount > 0)) throw new Error('Enter an amount above 0');
  if (type === 'percent' && amount > 100) throw new Error('A percent can be at most 100');
  const expires = String(p.expires || '');
  if (expires && !/^\d{2}\/\d{2}\/\d{4}$/.test(expires)) throw new Error('Choose a valid expiry date');
  const maxUses = Math.max(0, Math.floor(Number(p.maxUses) || 0));
  return withLock_(() => {
    if (findPromo_(code)) throw new Error('There is already a code named ' + code);
    const sh = promoSheet_(), row = sh.getLastRow() + 1;
    sh.getRange(row, 1).setNumberFormat('@');
    sh.getRange(row, 1, 1, PROMO_HEAD.length).setValues([[code, type, amount, expires, maxUses || '', 0, true, clip_(p.note, 200), new Date()]]);
    return adminData();
  });
}

// Pause (false) or turn back on (true) a promo code.
function adminPromoActive(code, on) {
  guard_();
  return withLock_(() => {
    const p = findPromo_(code); if (!p) throw new Error('Promo code not found');
    promoSheet_().getRange(p.row, 7).setValue(!!on);
    return adminData();
  });
}

/* ---------------- Operational budget ----------------
   Saved from the Dashboard (Money > Operational Budget) to the "Budget" tab, one row per line item.
   Each save replaces the whole tab. Billed is Monthly, Quarterly or Yearly. Suggested cut is "off", a new amount, or blank. */
const BUDGET_HEAD = ['Category', 'Line item', 'Amount', 'Billed', 'Included', 'Note', 'Check', 'Suggested cut', 'Saved'];
const BUDGET_FREQ = { m: 'Monthly', q: 'Quarterly', y: 'Yearly' };
function budgetSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('Budget');
  if (!sh) {
    sh = ss.insertSheet('Budget'); sh.appendRow(BUDGET_HEAD); sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, BUDGET_HEAD.length).setFontWeight('bold');
  }
  return sh;
}
// Returns { items: [...], savedAt } or { items: null } when nothing has been saved yet.
function adminBudgetGet() {
  guard_();
  const sh = budgetSheet_(), n = sh.getLastRow();
  if (n < 2) return { items: null, savedAt: '' };
  const rows = sh.getRange(2, 1, n - 1, BUDGET_HEAD.length).getValues().filter(r => String(r[1]).trim() !== '');
  const f = Object.keys(BUDGET_FREQ).reduce((o, k) => (o[BUDGET_FREQ[k]] = k, o), {});
  return {
    items: rows.map(r => ({ cat: String(r[0]), n: String(r[1]), a: num_(r[2]), f: f[String(r[3])] || 'm',
      on: r[4] === true || String(r[4]).toUpperCase() === 'TRUE' ? 1 : 0, h: String(r[5] || ''),
      flag: r[6] === true || String(r[6]).toUpperCase() === 'TRUE' ? 1 : 0, cut: String(r[7] === '' ? '' : r[7]) })),
    savedAt: rows.length && rows[0][8] instanceof Date ? fmtStamp_(rows[0][8]) : ''
  };
}
// items: [{ cat, n, a, f, on, h, flag, cut }]
function adminBudgetSave(items) {
  guard_();
  if (!Array.isArray(items) || items.length > 300) throw new Error('Budget is too long to save');
  const now = new Date();
  const rows = items.filter(i => i && String(i.n || '').trim()).map(i => {
    const a = Math.round(Math.max(0, Number(i.a) || 0) * 100) / 100;
    const cut = i.cut === 'off' ? 'off' : (i.cut === '' || i.cut == null || !isFinite(Number(i.cut)) ? '' : Math.max(0, Number(i.cut)));
    return [clip_(i.cat, 60), clip_(String(i.n).trim(), 80), a, BUDGET_FREQ[i.f] || 'Monthly', !!i.on, clip_(i.h, 200), !!i.flag, cut, now];
  });
  return withLock_(() => {
    const sh = budgetSheet_(), n = sh.getLastRow();
    if (n > 1) sh.getRange(2, 1, n - 1, BUDGET_HEAD.length).clearContent();
    if (rows.length) {
      sh.getRange(2, 1, rows.length, 2).setNumberFormat('@');
      sh.getRange(2, 1, rows.length, BUDGET_HEAD.length).setValues(rows);
      sh.getRange(2, 3, rows.length, 1).setNumberFormat('$#,##0.00');
    }
    return adminBudgetGet();
  });
}

// p: { amount, method, date (MM/dd/yyyy), note }
function adminAddPayment(id, p) {
  guard_();
  const amt = Math.round(Number(p.amount) * 100) / 100;
  if (!(amt > 0)) throw new Error('Enter an amount above $0');
  return withLock_(() => {
    recordPayment_(id, amt, clip_(p.method, 40) || 'Other', clip_(p.date, 10), clip_(p.note, 300), '');
    return adminData();
  });
}

// Adds a row to the Payments tab and raises Paid on the booking. Callers hold the script lock.
// ref (e.g. a Stripe Checkout session id) makes it idempotent: the same ref is never recorded twice.
function recordPayment_(id, amt, method, date, note, ref) {
  const ps = paymentsSheet_();
  if (ps.getMaxColumns() < 7) ps.insertColumnsAfter(ps.getMaxColumns(), 7 - ps.getMaxColumns());
  if (!ps.getRange(1, 7).getValue()) ps.getRange(1, 7).setValue('Reference');
  if (ref) {
    const n = ps.getLastRow();
    if (n > 1 && ps.getRange(2, 7, n - 1, 1).getValues().some(r => String(r[0]) === String(ref))) return false;
  }
  const sh = sheet_('Bookings'), row = rowById_(id), cell = sh.getRange(row, COL.PAID);
  cell.setValue(Math.round((num_(cell.getValue()) + amt) * 100) / 100);
  const pr = ps.getLastRow() + 1;
  ps.getRange(pr, 2).setNumberFormat('@'); ps.getRange(pr, 3).setNumberFormat('$#,##0.00'); ps.getRange(pr, 7).setNumberFormat('@');
  ps.getRange(pr, 1, 1, 7).setValues([[Number(id), date || Utilities.formatDate(new Date(), CONFIG.TZ, 'MM/dd/yyyy'),
    amt, method, note || '', new Date(), ref || '']]);
  return true;
}

function adminReply(id, text) {
  guard_();
  text = clip_(text, 2000); if (!text) throw new Error('Message is empty');
  return withLock_(() => {
    const r = sheet_('Bookings').getRange(rowById_(id), 1, 1, NCOL).getValues()[0];
    const sh = messagesSheet_(), row = sh.getLastRow() + 1;
    sh.getRange(row, 4).setNumberFormat('@');
    sh.getRange(row, 1, 1, 4).setValues([[Number(id), new Date(), CONFIG.BUSINESS, text]]);
    sendMail_({ to: r[COL.EMAIL - 1], replyTo: CONFIG.REPLY_TO, name: CONFIG.BUSINESS,
      subject: `New message about your booking #${id}`,
      preheader: text.slice(0, 90),
      htmlBody: eHead_(`Booking #${esc_(id)}`, `Hi ${esc_(r[COL.FN - 1])},`) + eP_(esc_(text).replace(/\n/g, '<br>')) +
        eSign_().replace('See you soon', 'Thanks') + `<div style="height:24px"></div>` +
        eSmall_('You can reply to this email, or send a message from your booking.') + portalLink_(r, 'Open your booking') });
    return adminData();
  });
}

// The private "open your booking" button for emails. The key in the link is what lets the client in.
function portalLink_(r, label) {
  if (!CONFIG.PORTAL_URL) return '';
  return emailButton_(esc_(portalUrl_(r[0], keyOf_(r))), label || 'Open your booking');
}

// kind: 'portal' | 'contract' | 'template' | 'details' | 'payment'
function adminResend(id, kind) {
  guard_();
  const r = sheet_('Bookings').getRange(rowById_(id), 1, 1, NCOL).getValues()[0];
  const bal = num_(r[COL.TOTAL - 1]) - num_(r[COL.PAID - 1]);
  const fn = esc_(r[COL.FN - 1]);
  // [subject, label, headline, body, button]
  const ask = {
    portal:   ['Your booking with ' + CONFIG.BUSINESS, 'Your booking', `Hi ${fn}, here's your booking.`, 'Use the button below to see your booking, invoice and next steps any time.', 'Open your booking'],
    contract: ['Please sign your contract', 'Action needed', `${fn}, your contract is ready.`, 'Open your booking and go to the Contract tab to read and sign it. It only takes a minute.', 'Sign your contract'],
    template: ['Choose your print template', 'Action needed', `${fn}, choose your print design.`, 'Pick the design for your photo print-outs and add the names or date you want on them. Open your booking and go to the Choose Template tab.', 'Choose your design'],
    details:  ['Please confirm your event details', 'Action needed', `${fn}, please confirm your event details.`, "Tell us your on-site contact, guest count and any setup notes so we arrive ready. Open your booking and go to the Confirm Details tab.", 'Confirm details'],
    payment:  ['Payment reminder', 'Payment reminder', `Hi ${fn}, a quick reminder.`, eAmount_('Remaining balance', bal, 'Due 14 days before your event'), 'Pay your balance']
  }[kind];
  if (!ask) throw new Error('Unknown email type');
  sendMail_({ to: r[COL.EMAIL - 1], replyTo: CONFIG.REPLY_TO, name: CONFIG.BUSINESS,
    subject: `${ask[0]} (booking #${r[0]})`, preheader: `${r[COL.EVNAME - 1]} · ${longDate_(r[COL.DATE - 1])}`,
    htmlBody: eHead_(ask[1], ask[2]) + (kind === 'payment' ? ask[3] : eP_(ask[3])) + portalLink_(r, ask[4]) + eEventFacts_(r) +
      (kind === 'payment' ? eSmall_('Questions about your balance? Just reply to this email.') : eSub_('Your progress') + eSteps_(r)) + eSign_() });
  return { ok: true, sentTo: r[COL.EMAIL - 1] };
}

function adminBlock(date, reason) {
  guard_();
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(date))) throw new Error('Use MM/DD/YYYY');
  return withLock_(() => {
    const bl = sheet_('Blocked Dates'), row = bl.getLastRow() + 1;
    bl.getRange(row, 1).setNumberFormat('@');
    bl.getRange(row, 1, 1, 2).setValues([[date, clip_(reason, 200)]]);
    return adminData();
  });
}

function adminUnblock(date) {
  guard_();
  return withLock_(() => {
    const bl = sheet_('Blocked Dates'), n = bl.getLastRow();
    if (n > 1) {
      const vals = bl.getRange(2, 1, n - 1, 1).getValues();
      for (let i = vals.length - 1; i >= 0; i--) if (fmtDate_(vals[i][0]) === date) bl.deleteRow(i + 2);
    }
    return adminData();
  });
}

/* ---------------- Dashboard API (app.magicmirrorrentalservices.com) ----------------
   Sign-in: the admin enters a password, or their email and a 6-digit code sent to it, and receives a
   session token valid for 7 days. Tokens are stored hashed in Script Properties. Every new sign-in
   is emailed to that admin, and "Sign out all" ends all of their sessions. */

const ADMIN_FNS = { adminData, adminUpdate, adminAddPayment, adminReply, adminResend, adminBlock, adminUnblock, adminPromoSave, adminPromoActive, adminBudgetGet, adminBudgetSave };
const SESSION_DAYS = 7;

function sha_(t) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(t), Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
function isAdminEmail_(e) { e = String(e || '').trim().toLowerCase(); return CONFIG.ADMINS.some(a => a.toLowerCase() === e) ? e : ''; }

function sessionEmail_(token) {
  if (!token || String(token).length < 30) return '';
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('sess:' + sha_(token)); if (!raw) return '';
  const s = JSON.parse(raw);
  if (Date.now() > s.exp) { props.deleteProperty('sess:' + sha_(token)); return ''; }
  return isAdminEmail_(s.email);
}

function adminApi_(a) {
  const cache = CacheService.getScriptCache();
  if (a.action === 'adminCode') {
    const email = isAdminEmail_(a.email);
    if (limited_('acode-ip:' + REQ.ip, 6, 900)) return tooMany_();
    if (email && !cache.get('codeSent:' + email)) {
      const code = code6_();
      cache.put('code:' + email, JSON.stringify({ h: sha_(code), tries: 0 }), 600);
      cache.put('codeSent:' + email, '1', 45);
      sendMail_({ to: email, subject: `Your dashboard sign-in code: ${code}`, preheader: 'It expires in 10 minutes.',
        htmlBody: eHead_('Dashboard', 'Your sign-in code') + eCode_(code) +
          eSmall_("It expires in 10 minutes. If you didn't try to sign in, you can ignore this email.") });
    }
    return { ok: true };   // same answer either way, so the form can't be used to test addresses
  }
  if (a.action === 'adminVerify') {
    const email = isAdminEmail_(a.email), key = 'code:' + email, raw = email && cache.get(key);
    if (!raw) return { ok: false, error: 'That code has expired. Request a new one.' };
    const c = JSON.parse(raw);
    if (c.tries >= 5) { cache.remove(key); return { ok: false, error: 'Too many tries. Request a new code.' }; }
    if (sha_(String(a.code || '').trim()) !== c.h) {
      c.tries++; cache.put(key, JSON.stringify(c), 600);
      return { ok: false, error: 'That code is not right. Check the email and try again.' };
    }
    cache.remove(key);
    return withData_(newSession_(email));
  }
  if (a.action === 'adminLogin') {
    const email = isAdminEmail_(a.email), lockKey = 'pwfail:' + String(a.email || '').toLowerCase().slice(0, 200);
    const ipKey = 'pwfail-ip:' + REQ.ip;
    const fails = Number(cache.get(lockKey) || 0), ipFails = Number(cache.get(ipKey) || 0);
    if (fails >= 5 || ipFails >= 15) return { ok: false, error: 'Too many tries. Wait 15 minutes, or sign in with an emailed code.' };
    const props = PropertiesService.getScriptProperties();
    const stored = email && props.getProperty('pw:' + email), pw = String(a.password || '').slice(0, 200);
    if (!stored || !checkPassword_(pw, stored)) {
      cache.put(lockKey, String(fails + 1), 900); cache.put(ipKey, String(ipFails + 1), 900);
      return { ok: false, error: stored || !email ? 'Email or password is not right.' : 'No password set for this account yet. Use an emailed code, then set one.' };
    }
    cache.remove(lockKey);
    if (String(stored).indexOf('v3$') !== 0) props.setProperty('pw:' + email, hashPassword_(pw));   // upgrade older hashes
    return withData_(newSession_(email));
  }
  if (a.action === 'adminSetPassword') {
    const email = sessionEmail_(a.token);
    if (!email) return { ok: false, error: 'SIGNED_OUT' };
    const pw = String(a.password || '');
    if (pw.length < 10) return { ok: false, error: 'Use at least 10 characters.' };
    if (pw.length > 200) return { ok: false, error: 'Use 200 characters or fewer.' };
    PropertiesService.getScriptProperties().setProperty('pw:' + email, hashPassword_(pw));
    return { ok: true };
  }
  if (a.action === 'adminSignOutAll') {
    const email = sessionEmail_(a.token);
    if (!email) return { ok: false, error: 'SIGNED_OUT' };
    const props = PropertiesService.getScriptProperties(), all = props.getProperties();
    Object.keys(all).filter(k => k.indexOf('sess:') === 0).forEach(k => {
      try { if (JSON.parse(all[k]).email === email) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
    });
    return { ok: true };
  }
  if (a.action === 'adminLogout') {
    if (a.token) PropertiesService.getScriptProperties().deleteProperty('sess:' + sha_(a.token));
    return { ok: true };
  }
  if (a.action === 'adminCall') {
    const email = sessionEmail_(a.token);
    if (!email) return { ok: false, error: 'SIGNED_OUT' };
    const fn = ADMIN_FNS[a.fn]; if (!fn) return { ok: false, error: 'Unknown action' };
    apiAdmin_ = email;
    try { return { ok: true, value: fn.apply(null, Array.isArray(a.args) ? a.args : []), email }; }
    catch (err) { return { ok: false, error: String(err.message || err) }; }
    finally { apiAdmin_ = ''; }
  }
  return { ok: false, error: 'Unknown action' };
}

function newSession_(email) {
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('sess:' + sha_(token), JSON.stringify({ email, exp: Date.now() + SESSION_DAYS * 864e5, ip: REQ.ip, at: Date.now() }));
  pruneSessions_(props);
  queueSignInAlert_({ email, when: fmtStamp_(new Date()), ip: REQ.ip, ua: REQ.ua || 'unknown' });
  return { ok: true, token, email };
}

// Adds the dashboard data to a sign-in answer, so the dashboard opens without a second trip.
function withData_(res) {
  if (!res || !res.ok) return res;
  const t = Date.now();
  apiAdmin_ = res.email;
  try { res.data = adminData(); } catch (e) { Logger.log('Sign-in data: ' + e); }   // the page loads it itself if this fails
  finally { apiAdmin_ = ''; }
  console.log('Sign-in: dashboard data took ' + (Date.now() - t) + ' ms');
  return res;
}

/* Sign-in alerts. Sending an email takes a few seconds, so instead of making the person signing in
   wait for it, each alert is saved in Script Properties and a one-off trigger sends it about a
   minute later. If the trigger can't be created, the alert is sent straight away as before.
   runAutomations() also sends any alert still waiting, as a safety net. */
function queueSignInAlert_(a) {
  const props = PropertiesService.getScriptProperties(), cache = CacheService.getScriptCache();
  props.setProperty('alert:' + Date.now() + ':' + newKey_().slice(0, 8), JSON.stringify(a));
  if (cache.get('alertTrigger')) return;   // a send is already scheduled and will pick this one up
  try {
    ScriptApp.newTrigger('sendSignInAlerts').timeBased().after(30 * 1000).create();
    cache.put('alertTrigger', '1', 600);
  } catch (e) { Logger.log('Alert trigger: ' + e); sendSignInAlerts(); }
}
function sendSignInAlerts() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sendSignInAlerts').forEach(t => {
    try { ScriptApp.deleteTrigger(t); } catch (e) {}
  });
  CacheService.getScriptCache().remove('alertTrigger');   // removed before reading, so a sign-in right now schedules a new send
  const props = PropertiesService.getScriptProperties(), all = props.getProperties();
  Object.keys(all).filter(k => k.indexOf('alert:') === 0).sort().forEach(k => {
    props.deleteProperty(k);
    let a; try { a = JSON.parse(all[k]); } catch (e) { return; }
    try {
      sendMail_({ to: a.email, subject: 'New sign-in to your Magic Mirror dashboard',
        preheader: "If this was you, there's nothing to do.",
        htmlBody: eHead_('Security alert', 'New sign-in to your dashboard') +
          eFacts_([['Account', esc_(a.email)], ['When', esc_(a.when)], ['IP address', esc_(a.ip)], ['Browser', esc_(a.ua)]]) +
          eP_("If this was you, there's nothing to do. If it wasn't, open the dashboard, click <b>Sign out all</b>, then set a new password.") +
          emailButton_(BRAND.dashboard, 'Open the dashboard') });
    } catch (e) { Logger.log('Sign-in alert: ' + e); }
  });
}

/* Salted, stretched password hash: "v3$salt$hash". The plain password is never stored.
   Same idea as OpenPGP's iterated-and-salted S2K (RFC 4880 3.7.1.3): salt+password is repeated to
   2 MB and hashed with SHA-256 in one call. That is about 32,000 SHA-256 blocks per guess, more
   work for anyone guessing than the old v2 hash (about 10,000), but it takes Apps Script one call
   instead of 5,000, so signing in no longer waits on it. */
const PW_BYTES = 2 * 1024 * 1024;
function hashPassword_(pw, salt) {
  salt = salt || newKey_();
  const unit = salt + pw, stream = unit.repeat(Math.ceil(PW_BYTES / unit.length)).slice(0, PW_BYTES);
  return 'v3$' + salt + '$' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, stream, Utilities.Charset.UTF_8));
}
// Older formats, kept so existing passwords still work; they are upgraded at the next sign-in.
const PW_ROUNDS = 5000;
function hashPasswordV2_(pw, salt) {
  const A = Utilities.DigestAlgorithm.SHA_256, s = Utilities.newBlob(salt).getBytes();
  let h = Utilities.computeDigest(A, salt + pw, Utilities.Charset.UTF_8);
  for (let i = 0; i < PW_ROUNDS; i++) h = Utilities.computeDigest(A, h.concat(s));
  return 'v2$' + salt + '$' + Utilities.base64Encode(h);
}
function hashPasswordV1_(pw, salt) {
  let h = salt + pw;
  for (let i = 0; i < 1000; i++) h = sha_(h + salt);
  return salt + '$' + h;
}
function checkPassword_(pw, stored) {
  const parts = String(stored).split('$');
  const t = Date.now();
  const ok = parts[0] === 'v3' ? hashPassword_(pw, parts[1]) === stored
    : parts[0] === 'v2' ? hashPasswordV2_(pw, parts[1]) === stored : hashPasswordV1_(pw, parts[0]) === stored;
  console.log('Sign-in: password check (' + (parts[0] === 'v3' || parts[0] === 'v2' ? parts[0] : 'v1') + ') took ' + (Date.now() - t) + ' ms');
  return ok;
}

function pruneSessions_(props) {
  const all = props.getProperties(), now = Date.now();
  Object.keys(all).filter(k => k.indexOf('sess:') === 0).forEach(k => {
    try { if (JSON.parse(all[k]).exp < now) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

/* ---------------- Stripe payments ----------------
   Setup (one time): Apps Script → Project Settings → Script properties → add
     STRIPE_SECRET_KEY = sk_test_… (test) or sk_live_… (live)
   The key never goes in this file or on GitHub. Clients pay on Stripe Checkout; on return the
   portal calls confirmPay, which re-checks the session with Stripe before recording anything.
   runAutomations() also reconciles the last 3 days of completed sessions, in case a client
   closed the tab before returning. */

function stripeKey_() {
  const k = PropertiesService.getScriptProperties().getProperty('STRIPE_SECRET_KEY');
  if (!k) throw new Error('Online payments are not set up yet');
  return k;
}

function stripe_(method, path, payload) {
  const res = UrlFetchApp.fetch('https://api.stripe.com/v1/' + path, {
    method, payload, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + stripeKey_() } });
  const body = JSON.parse(res.getContentText());
  if (res.getResponseCode() >= 300) throw new Error((body.error && body.error.message) || 'Stripe error');
  return body;
}

function portalUrl_(id, key) {
  return CONFIG.PORTAL_URL + '?id=' + encodeURIComponent(id) + '&k=' + encodeURIComponent(key);
}

// b: { id, ln, amount } → { ok, url } of a Stripe Checkout page for that amount.
function startPayment_(b, f) {
  if (limited_('pay:' + f.r[0], 20, 3600)) return tooMany_();
  const r = f.r, bal = Math.round((num_(r[COL.TOTAL - 1]) - num_(r[COL.PAID - 1])) * 100) / 100;
  const amt = Math.round(Number(b.amount) * 100) / 100;
  if (!(bal > 0)) return { ok: false, error: 'Your booking is already paid in full.' };
  if (!(amt >= 1) || amt > bal + 0.001) return { ok: false, error: `Enter an amount between $1.00 and $${bal.toFixed(2)}.` };
  const id = String(r[0]), back = portalUrl_(id, keyOf_(r));
  const s = stripe_('post', 'checkout/sessions', {
    mode: 'payment',
    success_url: back + '&paid={CHECKOUT_SESSION_ID}',
    cancel_url: back + '&paycancel=1',
    customer_email: String(r[COL.EMAIL - 1]),
    client_reference_id: id,
    'metadata[booking_id]': id,
    'payment_intent_data[metadata][booking_id]': id,
    'payment_intent_data[description]': `Booking #${id} – ${r[COL.EVNAME - 1]} on ${fmtDate_(r[COL.DATE - 1])}`,
    'line_items[0][quantity]': '1',            // strings: Apps Script would send numbers as "1.0"
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(Math.round(amt * 100)),
    'line_items[0][price_data][product_data][name]': `${CONFIG.BUSINESS} – booking #${id}`,
    'line_items[0][price_data][product_data][description]': `${r[COL.EVNAME - 1]}, ${fmtDate_(r[COL.DATE - 1])}`
  });
  return { ok: true, url: s.url };
}

// Records a completed Checkout session once. Returns true if it was new.
function applySession_(s) {
  const id = s.metadata && s.metadata.booking_id;
  if (!id || s.payment_status !== 'paid') return false;
  const amt = Math.round(s.amount_total) / 100;
  const note = 'Stripe' + (s.livemode ? '' : ' (TEST MODE)') + (s.payment_intent ? ' ' + s.payment_intent : '');
  if (!recordPayment_(id, amt, s.livemode ? 'Stripe' : 'Stripe (test)', '', note, s.id)) return false;
  const r = sheet_('Bookings').getRange(rowById_(id), 1, 1, NCOL).getValues()[0];
  const bal = num_(r[COL.TOTAL - 1]) - num_(r[COL.PAID - 1]);
  const full = bal <= 0.005;
  sendMail_({ to: r[COL.EMAIL - 1], replyTo: CONFIG.REPLY_TO, subject: `Payment received – booking #${id}`,
    preheader: `${money_(amt)} received. ` + (full ? 'Your booking is paid in full.' : `Remaining balance: ${money_(bal)}.`),
    htmlBody: eHead_('Payment received', `Thank you, ${esc_(r[COL.FN - 1])}.`, `We've received your payment for <b style="color:${EM.ink}">${esc_(r[COL.EVNAME - 1])}</b>.`) +
      eAmount_('Amount paid', amt, full ? 'Your booking is paid in full' : `Remaining balance ${money_(bal)}, due 14 days before your event`) +
      eEventFacts_(r) + portalLink_(r, 'View your booking') + eSign_() });
  sendMail_({ to: CONFIG.NOTIFY, subject: `Stripe payment $${amt.toFixed(2)} – #${id} ${r[COL.EVNAME - 1]}${s.livemode ? '' : ' (TEST)'}`,
    preheader: `${r[COL.FN - 1]} ${r[COL.LN - 1]} paid ${money_(amt)} online`,
    htmlBody: eHead_(`Payment received${s.livemode ? '' : ' &nbsp;' + eTag_('Test mode', true)}`, `${esc_(r[COL.FN - 1] + ' ' + r[COL.LN - 1])} paid ${money_(amt)}`) +
      eEventFacts_(r, [['Status', esc_(String(r[COL.STATUS - 1]))], ['Paid so far', money_(num_(r[COL.PAID - 1]))], ['Balance', full ? 'Paid in full' : money_(bal)]]) +
      emailButton_(BRAND.dashboard, 'Open the dashboard') });
  return true;
}

// b: { id, ln, session } — called by the portal when Stripe sends the client back.
function confirmPayment_(b, f) {
  if (limited_('confirm:' + f.r[0], 20, 3600)) return tooMany_();
  const s = stripe_('get', 'checkout/sessions/' + encodeURIComponent(String(b.session || '').slice(0, 200)));
  if (!s.metadata || String(s.metadata.booking_id) !== String(f.r[0])) return { ok: false, error: 'This payment is for a different booking.' };
  if (s.payment_status !== 'paid') return { ok: false, error: 'Payment not completed.' };
  const isNew = applySession_(s);
  const r = sheet_('Bookings').getRange(f.index, 1, 1, NCOL).getValues()[0];
  return { ok: true, recorded: isNew, amount: s.amount_total / 100, booking: bookingView_(r) };
}

// Catches payments whose clients never came back to the portal.
function reconcileStripe_() {
  if (!PropertiesService.getScriptProperties().getProperty('STRIPE_SECRET_KEY')) return 0;
  const since = Math.floor(Date.now() / 1000) - 3 * 86400;
  const list = stripe_('get', `checkout/sessions?status=complete&limit=100&created[gte]=${since}`);
  let n = 0; (list.data || []).forEach(s => { if (applySession_(s)) n++; });
  return n;
}

/* ---------------- Automations (daily) ----------------
   Run installAutomations() once from the editor to start the daily 9 AM run.
   Run previewAutomations() any time to see what would be sent today without sending anything.
   Every email is logged in the "Automation Log" tab, so nothing is sent twice. */

const AUTOMATIONS = {
  contractReminder: true,   // client: 3+ days after booking, contract still unsigned
  payment14: true,          // client: balance owed, 14 days before the event
  payment7: true,           // client: balance owed, 7 days before
  paymentOverdue: true,     // client: balance still owed 5 days after the event
  ownerHeadsUp: true        // you: event reminders 8 and 2 days before
};

function autoLog_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('Automation Log');
  if (!sh) { sh = ss.insertSheet('Automation Log'); sh.appendRow(['Booking ID', 'Reminder', 'Sent', 'To']); sh.setFrozenRows(1); }
  return sh;
}

function dayNum_(v) {   // whole days since epoch in the business time zone
  const s = v instanceof Date ? Utilities.formatDate(v, CONFIG.TZ, 'MM/dd/yyyy') : String(v || '').trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s); if (!m) return null;
  return Math.round(Date.UTC(+m[3], +m[1] - 1, +m[2]) / 864e5);
}

// Works out which reminders are due today. Returns [{ id, kind, to, subject, html }].
function dueReminders_() {
  const today = dayNum_(new Date());
  const logSh = autoLog_(), ln = logSh.getLastRow();
  const sent = {};
  if (ln > 1) logSh.getRange(2, 1, ln - 1, 2).getValues().forEach(r => sent[r[0] + '|' + r[1]] = true);
  const out = [];
  const add = (r, kind, to, subject, body) => {
    if (sent[r[0] + '|' + kind] || !to) return;
    out.push({ id: r[0], kind, to, subject: `${subject} (booking #${r[0]})`, html: body,
      pre: `${r[COL.EVNAME - 1]} · ${longDate_(r[COL.DATE - 1])}` });
  };
  rows_().forEach(r => {
    const id = r[0], status = String(r[COL.STATUS - 1]);
    if (!id || status === 'Cancelled') return;
    const ev = dayNum_(r[COL.DATE - 1]); if (ev === null) return;
    const until = ev - today, bal = num_(r[COL.TOTAL - 1]) - num_(r[COL.PAID - 1]);
    const imported = /imported from boothbook/i.test(String(r[COL.NOTES - 1]));
    const client = String(r[COL.EMAIL - 1]), fn = esc_(r[COL.FN - 1]);
    const tail = (btn, steps) => portalLink_(r, btn) + eEventFacts_(r) + (steps ? eSub_('Your progress') + eSteps_(r) : '') + eSign_();
    const when = until === 0 ? 'today' : until === 1 ? 'tomorrow' : 'in ' + until + ' days';

    if (AUTOMATIONS.contractReminder && !imported && until > 0 && !r[COL.SIGNED_AT - 1]) {
      const made = dayNum_(r[COL.CREATED - 1]);
      if (made !== null && today - made >= 3)
        add(r, 'contract', client, 'Reminder: please sign your contract',
          eHead_('Friendly reminder', `${fn}, your contract is waiting.`,
            'Your contract is still waiting for your signature. Open your booking and go to the Contract tab to sign it. It only takes a minute.') +
          tail('Sign your contract', true));
    }
    if (bal > 0.005 && status !== 'Completed') {
      if (AUTOMATIONS.payment14 && until <= 14 && until > 7)
        add(r, 'pay14', client, 'Your balance is due',
          eHead_('Balance due', `${fn}, your event is almost here.`, `Your remaining balance is due now, 14 days before your event. Reply to this email with any questions.`) +
          eAmount_('Remaining balance', bal, 'Due now') + tail('Pay your balance'));
      if (AUTOMATIONS.payment7 && until <= 7 && until >= 0)
        add(r, 'pay7', client, 'Payment reminder',
          eHead_('Payment reminder', `${fn}, your event is ${when}.`, 'Please pay your remaining balance as soon as you can so everything is set for the big day.') +
          eAmount_('Remaining balance', bal, 'Please pay before your event') + tail('Pay your balance'));
    }
    if (AUTOMATIONS.paymentOverdue && bal > 0.005 && until <= -5 && until >= -30 && !imported)
      add(r, 'overdue', client, 'Your balance is overdue',
        eHead_('Balance overdue', `Thank you for having us, ${fn}.`, 'Our records show a remaining balance from your event. Please pay it at your earliest convenience, or reply if you think this is a mistake.') +
        eAmount_('Balance overdue', bal) + tail('Pay your balance'));
    if (AUTOMATIONS.ownerHeadsUp && status !== 'Completed' && (until === 8 || until === 2)) {
      const flags = [status === 'Unconfirmed' ? 'Not confirmed' : '', !r[COL.SIGNED_AT - 1] && !imported ? 'Contract unsigned' : '',
        bal > 0.005 ? `${money_(bal)} owed` : '', !r[COL.STAFF - 1] ? 'No staff assigned' : '', !r[COL.DETAILS_AT - 1] && !imported ? 'Details not confirmed' : ''].filter(String);
      add(r, 'owner' + until, CONFIG.NOTIFY, `In ${until} days: ${r[COL.EVNAME - 1]}`,
        eHead_(`Coming up in ${until} days`, esc_(r[COL.EVNAME - 1])) +
        `<p style="margin:0 0 20px;line-height:2">${flags.length ? flags.map(f => eTag_(esc_(f), true)).join(' ') : eTag_('Everything is in order')}</p>` +
        eEventFacts_(r, [['Arrive', esc_(fmtTime_(r[COL.ARRIVE - 1]))], ['Package', esc_(r[COL.PKG - 1])], ['Staff', esc_(r[COL.STAFF - 1] || 'None')],
          ['Client', esc_(r[COL.FN - 1] + ' ' + r[COL.LN - 1]) + '<br>' + esc_(r[COL.PHONE - 1])],
          ['On-site', r[COL.ONSITE_NAME - 1] ? esc_(r[COL.ONSITE_NAME - 1]) + '<br>' + esc_(r[COL.ONSITE_PHONE - 1]) : '']]) +
        emailButton_(BRAND.dashboard, 'Open the dashboard'));
    }
  });
  return out;
}

function runAutomations() {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    try { reconcileStripe_(); } catch (e) { Logger.log('Stripe reconcile: ' + e); }
    try { sendSignInAlerts(); } catch (e) { Logger.log('Sign-in alerts: ' + e); }
    const log = autoLog_();
    dueReminders_().forEach(m => {
      const isOwner = m.to === CONFIG.NOTIFY;
      sendMail_(Object.assign({ to: m.to, subject: m.subject, htmlBody: m.html, preheader: m.pre, name: CONFIG.BUSINESS },
        isOwner ? {} : { replyTo: CONFIG.REPLY_TO }));
      log.appendRow([m.id, m.kind, new Date(), m.to]);
    });
  } finally { lock.releaseLock(); }
}

function previewAutomations() {
  const due = dueReminders_();
  Logger.log(due.length ? due.map(m => `#${m.id} ${m.kind} → ${m.to}: ${m.subject}`).join('\n') : 'Nothing due today.');
  return due.map(m => ({ id: m.id, kind: m.kind, to: m.to, subject: m.subject }));
}

function installAutomations() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'runAutomations').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('runAutomations').timeBased().everyDays(1).atHour(9).inTimezone(CONFIG.TZ).create();
  Logger.log('Daily automations scheduled for about 9 AM ' + CONFIG.TZ);
}

function stopAutomations() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'runAutomations').forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('Automations stopped.');
}

// Run once from the editor: lets every admin open the signed-contract PDFs.
function shareWithAdmins() {
  const f = contractsFolder_();
  CONFIG.ADMINS.filter(a => a.toLowerCase() !== CONFIG.OWNER_EMAIL.toLowerCase()).forEach(a => f.addViewer(a));
  Logger.log('Contracts folder shared with: ' + CONFIG.ADMINS.join(', '));
}

/* ---------------- One-time test (run from the editor to grant permissions) ---------------- */

function testSetup() {
  Logger.log('Taken dates: ' + JSON.stringify(takenDates_()));
  Logger.log('Contracts folder: ' + contractsFolder_().getUrl());   // asks for Drive access the first time
  MailApp.sendEmail(CONFIG.OWNER_EMAIL, 'MMRS booking system connected', 'Your booking back end can send email.');
}
