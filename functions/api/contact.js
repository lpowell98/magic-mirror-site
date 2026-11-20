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

  const values = {};
  for (const key of Object.keys(FIELDS)) {
    const v = String(data.get(key) || '').trim().slice(0, 5000);
    if (!v) return new Response(`Missing ${FIELDS[key]}`, { status: 400 });
    values[key] = v;
  }
  if (!env.RESEND_API_KEY) return new Response('Email is not configured', { status: 503 });

  const text = Object.entries(FIELDS).map(([k, label]) => `${label}: ${values[k]}`).join('\n');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.CONTACT_FROM || 'Magic Mirror website <website@magicmirrorrentalservices.com>',
      to: [env.CONTACT_TO || 'inquiries@magicmirrorrentalservices.com'],
      reply_to: values.email,
      subject: `Website inquiry: ${values.event_type} on ${values.event_date}`,
      text,
    }),
  });
  if (!res.ok) return new Response('Could not send', { status: 502 });
  return new Response('ok');
}
