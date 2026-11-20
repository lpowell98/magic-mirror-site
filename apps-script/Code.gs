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
  PKG:22, PRINT:23, XTIME:24, COUPON:25, REF:26, PAYOPT:27, TOTAL:28, PAID:29, BALANCE:30, NOTES:31,
  SIGNED_AT:32, SIGNER:33, SIGN_IP:34, CONTRACT_PDF:35, MODEL_RELEASE:36,
  TEMPLATE:37, TEMPLATE_TEXT:38, ONSITE_NAME:39, ONSITE_PHONE:40, GUESTS:41, SETUP_NOTES:42, DETAILS_AT:43 };
const NCOL = 43;

/* ---------------- HTTP ---------------- */

function doGet(e) {
  const p = e.parameter || {};
  try {
    if (p.action === 'dates')  return json({ ok: true, taken: takenDates_() });
    if (p.action === 'lookup') return json(lookup_(p.id, p.ln));
    if (p.action === 'contract') return json(getContract_(p.id, p.ln));
    if (p.action === 'messages') return json(getMessages_(p.id, p.ln));
    return json({ ok: true, service: CONFIG.BUSINESS });
  } catch (err) { return json({ ok: false, error: String(err) }); }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const b = JSON.parse(e.postData.contents);
    if (b.action === 'book') return json(createBooking_(b));
    if (b.action === 'sign') return json(signContract_(b));
    if (b.action === 'template') return json(saveTemplate_(b));
    if (b.action === 'details') return json(saveDetails_(b));
    if (b.action === 'message') return json(addMessage_(b));
    return json({ ok: false, error: 'Unknown action' });
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
  return n < 2 ? [] : sh.getRange(2, 1, n - 1, NCOL).getValues();
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
    items, total: Number(g(COL.TOTAL)) || 0, paid: Number(g(COL.PAID)) || 0,
    signedAt: g(COL.SIGNED_AT) ? fmtStamp_(g(COL.SIGNED_AT)) : '',
    created: g(COL.CREATED) ? fmtStamp_(g(COL.CREATED)) : '', street: g(COL.STREET), zip: g(COL.ZIP),
    template: g(COL.TEMPLATE) || '', templateText: g(COL.TEMPLATE_TEXT) || '', customPrint: g(COL.PRINT) === CONFIG.PRINTS.cus[0],
    onsiteName: g(COL.ONSITE_NAME) || '', onsitePhone: g(COL.ONSITE_PHONE) || '', guests: g(COL.GUESTS) || '',
    setupNotes: g(COL.SETUP_NOTES) || '', detailsAt: g(COL.DETAILS_AT) ? fmtStamp_(g(COL.DETAILS_AT)) : ''
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

/* ---------------- Contract ---------------- */

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

function getContract_(id, ln) {
  const f = findRow_(id, ln);
  if (!f) return { ok: false, error: 'NOT_FOUND' };
  const signedAt = f.r[COL.SIGNED_AT - 1];
  const on = signedAt ? fmtStamp_(signedAt) : Utilities.formatDate(new Date(), CONFIG.TZ, 'MM/dd/yyyy');
  const html = contractHtml_(f.r, on);
  return { ok: true, html, hash: contractHash_(html), signedAt: signedAt ? fmtStamp_(signedAt) : '',
           signer: f.r[COL.SIGNER - 1] || '', consent: CONSENT_TEXT };
}

const CONSENT_TEXT = 'By signing, you agree to use an electronic signature and to receive this contract electronically. Your electronic signature is legally binding, and your name, IP address, date and time are recorded as proof of your intent to sign (US ESIGN Act and UETA).';

function signContract_(b) {
  const f = findRow_(b.id, b.ln);
  if (!f) return { ok: false, error: 'NOT_FOUND' };
  if (f.r[COL.SIGNED_AT - 1]) return { ok: false, error: 'ALREADY_SIGNED' };
  if (String(f.r[COL.STATUS - 1]) === 'Cancelled') return { ok: false, error: 'CANCELLED' };
  const name = String(b.signerName || '').trim(), title = String(b.signerTitle || '').trim();
  if (!name || !title) return { ok: false, error: 'Missing signer name or title' };
  if (!b.consent) return { ok: false, error: 'Consent to sign electronically is required' };
  const m = /^data:image\/png;base64,([A-Za-z0-9+\/=]+)$/.exec(String(b.signature || ''));
  if (!m || m[1].length < 200 || m[1].length > 400000) return { ok: false, error: 'Signature missing' };

  const now = new Date(), stamp = fmtStamp_(now);
  const body = contractHtml_(f.r, stamp);
  const hash = contractHash_(body);
  const ip = String(b.ip || 'not captured'), ua = String(b.ua || '').slice(0, 300);
  const id = f.r[0];

  const doc = `<html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.45;color:#111;margin:36px}
    h1{font-size:18pt;margin:0 0 12px} h2{font-size:12pt;margin:18px 0 6px;text-transform:uppercase}
    .sig{margin-top:28px;border-top:1px solid #999;padding-top:14px} .sig img{height:90px}
    .audit{margin-top:24px;font-size:8.5pt;color:#444;border:1px solid #ccc;padding:10px}
  </style></head><body>${body}
  <p><b>Model release:</b> ${b.modelRelease ? 'Client confirmed' : 'Client did not confirm'}</p>
  <div class="sig"><p><b>Client signature</b></p><img src="data:image/png;base64,${m[1]}"><p>${esc_(name)}, ${esc_(title)}<br>Signed ${esc_(stamp)}</p></div>
  <div class="audit"><b>Electronic signature record</b><br>Booking ID: ${esc_(id)}<br>Signer: ${esc_(name)} (${esc_(title)})<br>
  Signed: ${esc_(stamp)}<br>IP address: ${esc_(ip)}<br>Browser: ${esc_(ua)}<br>Contract SHA-256: ${hash}<br>Consent: ${esc_(CONSENT_TEXT)}</div>
  </body></html>`;
  const pdf = Utilities.newBlob(doc, 'text/html', 'contract.html').getAs('application/pdf')
    .setName(`Contract #${id} - ${f.r[COL.FN - 1]} ${f.r[COL.LN - 1]} - ${fmtDate_(f.r[COL.DATE - 1]).replace(/\//g, '-')}.pdf`);
  const file = contractsFolder_().createFile(pdf);

  const sh = sheet_('Bookings');
  sh.getRange(f.index, COL.SIGNED_AT).setNumberFormat('MM/dd/yyyy h:mm am/pm');
  sh.getRange(f.index, COL.SIGNED_AT, 1, 5).setValues([[now, name + ' (' + title + ')', ip, file.getUrl(), b.modelRelease ? 'Yes' : 'No']]);

  const subj = `Signed contract #${id} – ${CONFIG.BUSINESS}`;
  MailApp.sendEmail({ to: f.r[COL.EMAIL - 1], replyTo: CONFIG.REPLY_TO, name: CONFIG.BUSINESS, subject: subj,
    htmlBody: `<p>Hi ${esc_(f.r[COL.FN - 1])},</p><p>Thank you for signing your contract for <b>${esc_(f.r[COL.EVNAME - 1])}</b> on <b>${esc_(fmtDate_(f.r[COL.DATE - 1]))}</b>. A copy is attached for your records.</p><p>${CONFIG.BUSINESS}</p>`,
    attachments: [pdf] });
  MailApp.sendEmail({ to: CONFIG.OWNER_EMAIL, subject: `Contract signed: #${id} ${f.r[COL.EVNAME - 1]}`,
    htmlBody: `<p>${esc_(name)} signed the contract for booking #${id} at ${esc_(stamp)}.</p><p><a href="${file.getUrl()}">Open signed PDF in Drive</a></p>`,
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

function saveTemplate_(b) {
  const f = findRow_(b.id, b.ln); if (!f) return { ok: false, error: 'NOT_FOUND' };
  const t = clip_(b.template, 120); if (!t) return { ok: false, error: 'Choose a template' };
  const text = clip_(b.templateText, 300);
  const sh = sheet_('Bookings');
  sh.getRange(f.index, COL.TEMPLATE, 1, 2).setNumberFormat('@').setValues([[t, text]]);
  MailApp.sendEmail({ to: CONFIG.OWNER_EMAIL, replyTo: f.r[COL.EMAIL - 1],
    subject: `Template chosen: #${f.r[0]} ${f.r[COL.EVNAME - 1]}`,
    htmlBody: `<p>Booking #${f.r[0]} (${esc_(f.r[COL.FN - 1])} ${esc_(f.r[COL.LN - 1])}) chose <b>${esc_(t)}</b>.</p><p>Text on the print: ${esc_(text) || '(none)'}</p>` });
  return { ok: true };
}

function saveDetails_(b) {
  const f = findRow_(b.id, b.ln); if (!f) return { ok: false, error: 'NOT_FOUND' };
  const name = clip_(b.onsiteName, 120), phone = clip_(b.onsitePhone, 40);
  if (!name || !phone) return { ok: false, error: 'On-site contact name and phone are required' };
  if (!b.confirm) return { ok: false, error: 'Please confirm the details' };
  const now = new Date(), sh = sheet_('Bookings');
  sh.getRange(f.index, COL.ONSITE_NAME, 1, 4).setNumberFormat('@').setValues([[name, phone, clip_(b.guests, 20), clip_(b.setupNotes, 2000)]]);
  sh.getRange(f.index, COL.DETAILS_AT).setNumberFormat('MM/dd/yyyy h:mm am/pm').setValue(now);
  MailApp.sendEmail({ to: CONFIG.OWNER_EMAIL, replyTo: f.r[COL.EMAIL - 1],
    subject: `Details confirmed: #${f.r[0]} ${f.r[COL.EVNAME - 1]}`,
    htmlBody: `<p>Booking #${f.r[0]} confirmed their event details.</p><p>On-site contact: ${esc_(name)}, ${esc_(phone)}<br>Guests: ${esc_(clip_(b.guests, 20)) || 'not given'}<br>Setup notes: ${esc_(clip_(b.setupNotes, 2000)) || 'none'}</p>` });
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

function getMessages_(id, ln) {
  const f = findRow_(id, ln); if (!f) return { ok: false, error: 'NOT_FOUND' };
  const sh = messagesSheet_(), n = sh.getLastRow();
  const list = n < 2 ? [] : sh.getRange(2, 1, n - 1, 4).getValues()
    .filter(r => String(r[0]) === String(f.r[0]))
    .map(r => ({ at: fmtStamp_(r[1]), from: String(r[2]) === 'Client' ? 'You' : (r[2] || CONFIG.BUSINESS), text: String(r[3]) }));
  return { ok: true, messages: list };
}

function addMessage_(b) {
  const f = findRow_(b.id, b.ln); if (!f) return { ok: false, error: 'NOT_FOUND' };
  const text = clip_(b.text, 2000); if (!text) return { ok: false, error: 'Message is empty' };
  const sh = messagesSheet_(), row = sh.getLastRow() + 1;
  sh.getRange(row, 4).setNumberFormat('@');
  sh.getRange(row, 1, 1, 4).setValues([[f.r[0], new Date(), 'Client', text]]);
  MailApp.sendEmail({ to: CONFIG.OWNER_EMAIL, replyTo: f.r[COL.EMAIL - 1],
    subject: `Message from ${f.r[COL.FN - 1]} ${f.r[COL.LN - 1]} (booking #${f.r[0]})`,
    htmlBody: `<p>${esc_(text).replace(/\n/g, '<br>')}</p><hr><p style="color:#666">Reply to this email to answer ${esc_(f.r[COL.FN - 1])} directly, or add a row to the Messages tab with From = Magic Mirror to show your reply in their portal.</p>` });
  return getMessages_(b.id, b.ln);
}

/* ---------------- One-time test (run from the editor to grant permissions) ---------------- */

function testSetup() {
  Logger.log('Taken dates: ' + JSON.stringify(takenDates_()));
  Logger.log('Contracts folder: ' + contractsFolder_().getUrl());   // asks for Drive access the first time
  MailApp.sendEmail(CONFIG.OWNER_EMAIL, 'MMRS booking system connected', 'Your booking back end can send email.');
}
