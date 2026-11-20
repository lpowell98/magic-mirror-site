/**
 * Magic Mirror Rental Services — booking back end
 * Bound to the "MMRS Bookings" Google Sheet (Extensions > Apps Script).
 * Deploy: Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone.
 */

const CONFIG = {
  OWNER_EMAIL: 'lanspowelljr@gmail.com',      // where new-booking alerts go
  BUSINESS: 'Magic Mirror Rental Services',
  REPLY_TO: 'inquiries@magicmirrorrentalservices.com',
  PORTAL_URL: '',                              // set to your GitHub Pages URL after publishing
  FIRST_ID: 150,                               // new IDs start after this (BoothBook used up to 150)
  DEPOSIT: 250,
  FREE_MILES: 20,
  PER_MILE: 0.85,
  TZ: 'America/New_York',
  PACKAGES: { bronze: ['Bronze Package', 650], silver: ['Silver Package', 850], gold: ['Gold Package', 1100] },
  PRINTS:   { tpl: ['Template Design Print-out', 0], cus: ['Custom Design Print-out', 75] },
  TIMES:    { t30: ['Additional Time (30 minutes)', 75], t60: ['Additional Time (1 hour)', 100], t120: ['Additional Time (2 hour)', 150] }
};

const COL = { ID:1, CREATED:2, STATUS:3, DATE:4, TYPE:5, EVNAME:6, START:7, END:8, ARRIVE:9, DEPART:10,
  VNAME:11, VADDR:12, VZIP:13, MILES:14, FEE:15, FN:16, LN:17, EMAIL:18, PHONE:19, STREET:20, ZIP:21,
  PKG:22, PRINT:23, XTIME:24, COUPON:25, REF:26, PAYOPT:27, TOTAL:28, PAID:29, BALANCE:30, NOTES:31 };

/* ---------------- HTTP ---------------- */

function doGet(e) {
  const p = e.parameter || {};
  try {
    if (p.action === 'dates')  return json({ ok: true, taken: takenDates_() });
    if (p.action === 'lookup') return json(lookup_(p.id, p.ln));
    return json({ ok: true, service: CONFIG.BUSINESS });
  } catch (err) { return json({ ok: false, error: String(err) }); }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const b = JSON.parse(e.postData.contents);
    if (b.action !== 'book') return json({ ok: false, error: 'Unknown action' });
    return json(createBooking_(b));
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------------- Data helpers ---------------- */

function sheet_(name) { return SpreadsheetApp.getActive().getSheetByName(name); }
function fmtDate_(v) { return v instanceof Date ? Utilities.formatDate(v, CONFIG.TZ, 'MM/dd/yyyy') : String(v || '').trim(); }
function rows_() {
  const sh = sheet_('Bookings'); const n = sh.getLastRow();
  return n < 2 ? [] : sh.getRange(2, 1, n - 1, 31).getValues();
}

function takenDates_() {
  const set = {};
  rows_().forEach(r => { if (r[COL.STATUS - 1] !== 'Cancelled') set[fmtDate_(r[COL.DATE - 1])] = true; });
  const bl = sheet_('Blocked Dates'); const n = bl.getLastRow();
  if (n > 1) bl.getRange(2, 1, n - 1, 1).getValues().forEach(r => { if (r[0]) set[fmtDate_(r[0])] = true; });
  return Object.keys(set);
}

function price_(b) {
  const items = [];
  if (b.print && CONFIG.PRINTS[b.print]) items.push(CONFIG.PRINTS[b.print]);
  if (b.pkg && CONFIG.PACKAGES[b.pkg]) items.push(['Mirror Me Booth - ' + CONFIG.PACKAGES[b.pkg][0], CONFIG.PACKAGES[b.pkg][1]]);
  (b.times || []).forEach(t => { if (CONFIG.TIMES[t]) items.push(CONFIG.TIMES[t]); });
  const miles = Math.max(0, parseFloat(b.miles) || 0);
  const fee = Math.round(Math.max(0, miles - CONFIG.FREE_MILES) * CONFIG.PER_MILE * 100) / 100;
  if (fee > 0) items.push(['Travel', fee]);
  const total = items.reduce((s, i) => s + i[1], 0);
  return { items, total, fee, miles };
}

/* ---------------- Create booking ---------------- */

function createBooking_(b) {
  const need = ['date', 'pkg', 'print', 'email', 'phone', 'evName', 'start', 'vName', 'vAddr', 'vZip', 'fn', 'ln'];
  const miss = need.filter(k => !String(b[k] || '').trim());
  if (miss.length) return { ok: false, error: 'Missing: ' + miss.join(', ') };
  if (!b.terms) return { ok: false, error: 'Terms not accepted' };
  if (takenDates_().indexOf(b.date) !== -1) return { ok: false, error: 'DATE_TAKEN' };

  const sh = sheet_('Bookings');
  const ids = rows_().map(r => Number(r[0]) || 0);
  const id = Math.max(CONFIG.FIRST_ID, ...ids) + 1;
  const p = price_(b);
  const row = sh.getLastRow() + 1;

  const values = [
    id, new Date(), 'Unconfirmed', b.date, b.eventType || '', b.evName, b.start, b.end || '', b.arrive || '', b.depart || '',
    b.vName, b.vAddr, b.vZip, p.miles || '', p.fee, b.fn, b.ln, b.email, b.phone, b.street || '', b.zip || '',
    CONFIG.PACKAGES[b.pkg][0], CONFIG.PRINTS[b.print][0],
    (b.times || []).map(t => CONFIG.TIMES[t] && CONFIG.TIMES[t][0]).filter(String).join(', '),
    b.coupon || '', b.ref || '', b.payOpt || 'later', p.total, 0, '=AB' + row + '-AC' + row, ''
  ];
  // Store as plain text so Sheets keeps "02201", "11/27/2026" and "7:00 pm" exactly as typed
  sh.getRange(row, 1, 1, 31).setNumberFormat('@');
  sh.getRange(row, COL.ID).setNumberFormat('0');
  sh.getRange(row, COL.CREATED).setNumberFormat('MM/dd/yyyy h:mm am/pm');
  sh.getRange(row, COL.MILES).setNumberFormat('0.0');
  [COL.FEE, COL.TOTAL, COL.PAID, COL.BALANCE].forEach(c => sh.getRange(row, c).setNumberFormat('$#,##0.00'));
  sh.getRange(row, 1, 1, values.length).setValues([values]);

  notifyOwner_(id, b, p);
  confirmClient_(id, b, p);
  return { ok: true, booking: lookup_(id, b.ln).booking };
}

/* ---------------- Lookup (client portal) ---------------- */

function lookup_(id, ln) {
  const r = rows_().find(x => String(x[0]) === String(id).trim() &&
                             String(x[COL.LN - 1]).toLowerCase() === String(ln || '').trim().toLowerCase());
  if (!r) return { ok: false, error: 'NOT_FOUND' };
  const g = c => r[c - 1];
  const items = [];
  const byName = (tbl, name) => Object.keys(tbl).find(k => tbl[k][0] === name);
  const pk = byName(CONFIG.PACKAGES, g(COL.PKG)); if (pk) items.push(['Mirror Me Booth - ' + CONFIG.PACKAGES[pk][0], CONFIG.PACKAGES[pk][1]]);
  const pr = byName(CONFIG.PRINTS, g(COL.PRINT)); if (pr) items.push(CONFIG.PRINTS[pr]);
  String(g(COL.XTIME) || '').split(', ').filter(String).forEach(n => { const t = byName(CONFIG.TIMES, n); if (t) items.push(CONFIG.TIMES[t]); });
  if (Number(g(COL.FEE)) > 0) items.push(['Travel', Number(g(COL.FEE))]);
  return { ok: true, booking: {
    id: g(COL.ID), date: fmtDate_(g(COL.DATE)), status: g(COL.STATUS), start: g(COL.START), end: g(COL.END),
    arrive: g(COL.ARRIVE), depart: g(COL.DEPART), evName: g(COL.EVNAME), vName: g(COL.VNAME), vAddr: g(COL.VADDR),
    vZip: g(COL.VZIP), fn: g(COL.FN), ln: g(COL.LN), email: g(COL.EMAIL), phone: g(COL.PHONE),
    items, total: Number(g(COL.TOTAL)) || 0, paid: Number(g(COL.PAID)) || 0
  }};
}

/* ---------------- Emails ---------------- */

function itemsTable_(p) {
  return '<table style="border-collapse:collapse;width:100%;font-size:14px">' +
    p.items.map(i => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${i[0]}</td><td style="text-align:right;border-bottom:1px solid #eee">$${i[1].toFixed(2)}</td></tr>`).join('') +
    `<tr><td style="padding:8px 0"><b>Total</b></td><td style="text-align:right"><b>$${p.total.toFixed(2)}</b></td></tr></table>`;
}

function notifyOwner_(id, b, p) {
  const ss = SpreadsheetApp.getActive();
  MailApp.sendEmail({
    to: CONFIG.OWNER_EMAIL,
    subject: `New booking #${id}: ${b.evName} on ${b.date}`,
    htmlBody: `<p><b>New booking #${id}</b> (Unconfirmed)</p>
      <p>${b.fn} ${b.ln} · ${b.email} · ${b.phone}<br>${b.eventType || ''}: ${b.evName}<br>
      ${b.date}, ${b.start}${b.end ? ' – ' + b.end : ''}<br>${b.vName}, ${b.vAddr} ${b.vZip}</p>
      ${itemsTable_(p)}<p>Payment choice: ${b.payOpt || 'later'}</p>
      <p><a href="${ss.getUrl()}">Open MMRS Bookings</a></p>`
  });
}

function confirmClient_(id, b, p) {
  const portal = CONFIG.PORTAL_URL ? `<p>You can view your booking any time at <a href="${CONFIG.PORTAL_URL}">${CONFIG.PORTAL_URL}</a> using Booking ID <b>${id}</b> and your last name.</p>` : '';
  MailApp.sendEmail({
    to: b.email,
    replyTo: CONFIG.REPLY_TO,
    name: CONFIG.BUSINESS,
    subject: `Your booking request #${id} – ${CONFIG.BUSINESS}`,
    htmlBody: `<div style="font-family:Arial,sans-serif;max-width:560px">
      <div style="background:#000;padding:14px;text-align:center;color:#E8B923;font-weight:bold;font-size:18px">${CONFIG.BUSINESS}</div>
      <p>Hi ${b.fn},</p>
      <p>Thank you for booking with us. We've received your request for <b>${b.evName}</b> on <b>${b.date}</b> and will confirm it shortly.</p>
      <p><b>Booking ID:</b> ${id}<br><b>Time:</b> ${b.start}${b.end ? ' – ' + b.end : ''}<br><b>Venue:</b> ${b.vName}, ${b.vAddr} ${b.vZip}</p>
      ${itemsTable_(p)}
      <p>A non-refundable $${CONFIG.DEPOSIT} reservation fee secures your date. The remaining balance is due 14 days before your event.</p>
      ${portal}
      <p>We look forward to celebrating with you!<br>${CONFIG.BUSINESS}</p></div>`
  });
}

/* ---------------- One-time test (run from the editor to grant permissions) ---------------- */

function testSetup() {
  Logger.log('Taken dates: ' + JSON.stringify(takenDates_()));
  MailApp.sendEmail(CONFIG.OWNER_EMAIL, 'MMRS booking system connected', 'Your booking back end can send email.');
}
