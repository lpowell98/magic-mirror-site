// Cloudflare Pages Function: POST /api/contact
// Sends the contact form by email through Resend (https://resend.com).
// Set these in Cloudflare Pages > Settings > Environment variables:
//   RESEND_API_KEY  (secret)  your Resend API key
//   CONTACT_TO      optional, defaults to inquiries@magicmirrorrentalservices.com
//   CONTACT_FROM    optional, a sender on a domain verified in Resend, e.g.
//                   "Website <website@magicmirrorrentalservices.com>". Until the
//                   domain is verified, Resend's test sender is used, which can
//                   only deliver to the email address the Resend account uses.
const FIELDS = {
  first_name: 'First name', last_name: 'Last name', email: 'Email', phone: 'Mobile phone',
  event_date: 'Event date', event_type: 'Event type', message: 'Message',
};

export async function onRequestPost({ request, env }) {
  const data = await request.formData();
  if (data.get('company')) return new Response('ok'); // honeypot: silently drop bots
  if (env.TURNSTILE_SECRET && !(await turnstileOk(env.TURNSTILE_SECRET, data.get('cf-turnstile-response'), request.headers.get('CF-Connecting-IP')))) {
    return new Response('Bot check failed', { status: 403 });
  }

  const values = {};
  for (const key of Object.keys(FIELDS)) {
    const v = String(data.get(key) || '').trim().slice(0, key === 'message' ? 5000 : 200);
    if (!v) return new Response(`Missing ${FIELDS[key]}`, { status: 400 });
    values[key] = v;
  }
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(values.email)) return new Response('Invalid email', { status: 400 });
  if (!env.RESEND_API_KEY) return new Response('Email is not configured', { status: 503 });

  const text = Object.entries(FIELDS).map(([k, label]) => `${label}: ${values[k]}`).join('\n');
  const send = (from) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [env.CONTACT_TO || 'inquiries@magicmirrorrentalservices.com'],
      reply_to: values.email,
      subject: `Website inquiry: ${values.event_type} on ${values.event_date}`.replace(/[\r\n]+/g, ' '),
      text,
      html: inquiryHtml(values),
    }),
  });
  let res = await send(env.CONTACT_FROM || 'Magic Mirror website <website@magicmirrorrentalservices.com>');
  // Until the domain is verified in Resend, fall back to Resend's shared test sender.
  if (res.status === 403) res = await send('Magic Mirror website <onboarding@resend.dev>');
  if (!res.ok) return new Response('Could not send', { status: 502 });
  return new Response('ok');
}

// "2027-05-15" (from the date picker) -> "Saturday, May 15, 2027"; anything else is shown as typed.
function longDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return v;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

// The inquiry as a branded HTML email, matching the booking emails sent by the Apps Script back end.
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function inquiryHtml(v) {
  const F = "font-family:Montserrat,'Helvetica Neue',Helvetica,Arial,sans-serif";
  const site = 'https://www.magicmirrorrentalservices.com/';
  const row = (label, value, i) => `<tr><td valign="top" style="padding:${i ? '10px' : '0'} 16px 0 0;width:84px;font-size:13px;color:#5c5262;white-space:nowrap">${label}</td>` +
    `<td valign="top" style="padding:${i ? '10px' : '0'} 0 0;font-size:15px;font-weight:600;color:#17121b">${value}</td></tr>`;
  const mail = `<a href="mailto:${esc(v.email)}" style="color:#6e266c">${esc(v.email)}</a>`;
  const facts = [['Name', esc(`${v.first_name} ${v.last_name}`)], ['Email', mail], ['Mobile', esc(v.phone)],
    ['Event date', esc(longDate(v.event_date))], ['Event type', esc(v.event_type)]].map((r, i) => row(r[0], r[1], i)).join('');
  const pre = `${v.first_name} ${v.last_name} · ${v.event_type} on ${v.event_date}`;
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(pre)}</div>
<div style="margin:0;padding:24px 6px;background:#eeece9;${F}">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;border-collapse:collapse">
  <tr><td align="center" style="background:#0e0b11;padding:26px 32px 22px;border-bottom:3px solid #fba924">
    <a href="${site}"><img src="${site}images/brand/email-logo.png" width="156" height="96" alt="Magic Mirror Rental Services" style="display:block;border:0;margin:0 auto"></a></td></tr>
  <tr><td style="background:#ffffff;padding:32px 28px 28px;color:#17121b;font-size:16px;line-height:1.6;${F}">
    <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.04em;color:#6e266c">Website inquiry</p>
    <h1 style="margin:0 0 20px;font-size:28px;line-height:1.2;font-weight:800;color:#17121b">New inquiry from ${esc(v.first_name)} ${esc(v.last_name)}</h1>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 24px"><tr>
      <td style="background:#f8f5f9;border-left:4px solid #6e266c;padding:16px 18px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;${F}">${facts}</table></td></tr></table>
    <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:.04em;color:#6e266c">Message</p>
    <div style="margin:0 0 24px;padding:18px 20px;background:#f8f5f9;border-left:4px solid #fba924">${esc(v.message).replace(/\n/g, '<br>')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 12px"><tr><td style="background:#fba924">
      <a href="mailto:${esc(v.email)}" style="display:inline-block;padding:15px 28px;color:#0e0b11;font-weight:800;font-size:16px;text-decoration:none;${F}">Reply to ${esc(v.first_name)}</a></td></tr></table>
    <p style="margin:0;font-size:13px;color:#5c5262">Or just hit reply: it goes straight to ${esc(v.email)}.</p></td></tr>
  <tr><td align="center" style="background:#0e0b11;padding:22px 32px;color:#c4bacb;font-size:13px;line-height:1.7;${F}">
    <div style="color:#fba924;font-weight:800;font-size:14px">Providing the magic for your next event</div>
    Sent from the contact form on <a href="${site}" style="color:#c4bacb">magicmirrorrentalservices.com</a></td></tr>
</table></div>`;
}

async function turnstileOk(secret, token, ip) {
  if (!token || String(token).length > 2048) return false;
  const form = new FormData();
  form.append('secret', secret); form.append('response', String(token));
  if (ip) form.append('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    return !!(await r.json()).success;
  } catch { return false; }
}
