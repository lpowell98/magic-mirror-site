# Magic Mirror Rental Services website

Static copy of www.magicmirrorrentalservices.com (previously on Squarespace), ready for Cloudflare Pages.

## Layout

- `public/` is the site. Each page is `public/<page>/index.html`; shared styles and scripts are in `public/assets/`.
- `public/_redirects` sends the old `/our-photobooth` URL to `/magic-mirror/`.
- `functions/api/contact.js` handles the contact form and `functions/api/booking.js` forwards booking and dashboard requests to Apps Script (Cloudflare Pages Functions).
- `src-images/` holds the original full-size photos. They are not deployed.
- `public/images/` holds the web versions (WebP, resized, with small `-thumb` versions for the gallery grids).

## Images

To add or change a photo, put the original in `src-images/<folder>/`, then from the repo root run:

    python3 scripts/optimize-images.py

and point the page at `/images/<folder>/<name>.webp`. The script needs Pillow (`pip install pillow`).

## Adding a new event to the gallery

1. Put the print's original photo in `src-images/gallery/` (jpg or png).
2. Add one line at the top of `content/events.txt`: `photo file | event name | month and year | event type`.
3. Push (or commit on GitHub). The deploy then rebuilds everything that shows event prints and saves the result to the branch:
   - the event gallery grids (`public/gallery/`)
   - /links "Latest Events" (4 newest)
   - the hosted brochure PDF, page 5 (6 newest), from `brochure/brochure.html`
   - the home page "Your event, on paper" (5 newest prints of each event type)
   - the home page "They print" step and the Magic Mirror page print (newest prints, every event); the review photo stays with its review
   - the "Ready to save your date?" collage, every 5 new events (`--collage` forces it)
   - the link-share images og-gallery, og-image and og-template-gallery, every 3 new events (`--share` forces it)
   - the home page print wall and the /links header wall, once 4 new events have been added since their last refresh (`content/home-last-built.txt`; run `python3 scripts/build-events.py --home` to refresh them sooner)

To run it yourself: `python3 scripts/build-events.py` (needs Pillow; the PDF also needs Node with Playwright).

The Canva brochure (design DAFIasy8epA, page 5 "Prints from the mirror") is synced by a daily Claude scheduled task (7:47 PM Eastern) that copies the prints and captions from `brochure/brochure.html` once the new images are live.

## Deploying

`.github/workflows/deploy.yml` deploys `public/` to the Cloudflare Pages project `magic-mirror-site`.
A push to `main` updates the live site. A push to any other branch makes a preview at
`https://<branch-name>.magic-mirror-site-gna.pages.dev` (slashes become dashes) without touching the live site. It needs two repository secrets
(GitHub > Settings > Secrets and variables > Actions):

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token from the "Edit Cloudflare Workers" template
- `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account ID

Custom domains (`www.magicmirrorrentalservices.com`, `magicmirrorrentalservices.com`) are added in the Pages project's Custom domains tab.

## Contact form

The form posts to `/api/contact`, which emails the message through Resend. In Pages > Settings > Variables and secrets add:

- `RESEND_API_KEY` (secret)
- `CONTACT_FROM`, a sender on a domain verified in Resend (default `Website <website@magicmirrorrentalservices.com>`)
- `CONTACT_TO` (optional, default `inquiries@magicmirrorrentalservices.com`)

Without these the form shows visitors the email address instead.

## Booking

BoothBook is retired. Bookings, payments and the owner dashboard all run on our own system.

| Address | What it is |
|---|---|
| `www.magicmirrorrentalservices.com/booking/` and `booking.magicmirrorrentalservices.com` | Client booking page and portal (`public/booking/`) |
| `app.magicmirrorrentalservices.com` | Owner dashboard (`public/app/`, not indexed) |

`functions/_middleware.js` serves `/booking/` at the root of `booking.*` and `/app/` at the root of `app.*`. `/book-now` redirects to `/booking/`.

### Back end

- Google Sheet "MMRS Bookings" with tabs Bookings, Blocked Dates, Messages, Payments, Automation Log.
- `apps-script/Code.gs` is the sheet's bound Apps Script (Extensions > Apps Script). New booking IDs continue after `CONFIG.FIRST_ID` (150).
- One deployment serves both pages: Web app, Execute as **Me**, access **Anyone**.
- The pages never call Apps Script directly. They post to `/api/booking` (`functions/api/booking.js`), which checks Turnstile, adds the visitor's IP and browser plus a shared secret, and forwards to the Apps Script URL.
- To ship a code change: paste `Code.gs`, save, then Deploy > Manage deployments > edit (pencil) > Version: New version > Deploy. The URL stays the same.
- `CONFIG` at the top of `Code.gs`: `NOTIFY` (who gets new-booking alerts), `ADMINS` (who can sign in to the dashboard), `FROM` / `REPLY_TO` (client emails are sent as inquiries@).

### Security settings

| Where | Name | What it does |
|---|---|---|
| Cloudflare Pages > Settings > Variables and secrets | `BOOKING_PROXY_SECRET` (secret) | Shared secret sent to Apps Script with every request |
| Apps Script > Project Settings > Script properties | `PROXY_SECRET` | Same value. Once set, Apps Script refuses requests that didn't come through the site |
| Cloudflare Pages | `TURNSTILE_SITE_KEY` (plain) and `TURNSTILE_SECRET` (secret) | Turnstile bot check on bookings, booking-code requests, dashboard sign-in and the contact form. Off until both are set |
| Apps Script Script properties | `BASE_ADDRESS` | Travel miles come from Google Maps driving distance from this address, not from what the client typed |

Pages variables take effect on the next deploy. `functions/_middleware.js` adds a strict Content-Security-Policy and no-referrer to `/booking/` and `/app/`; their scripts live in `public/booking/booking.js` and `public/app/app.js` because inline scripts are blocked.

### Client portal

- Each booking has a private key (Bookings column AU, "Portal Key"). Email links carry it: `/booking/?id=151&k=<key>`. The browser remembers keys it has opened.
- Typing Booking ID + last name emails a 6-digit code to the address on the booking; the code opens the portal. Older bookings get a key the first time one is needed.
- Limits per visitor: 5 bookings an hour (30 a day overall), 6 code requests an hour, 20 wrong keys an hour, 10 messages an hour per booking.

### Dashboard sign-in

- Only emails in `CONFIG.ADMINS` can sign in, with a password (10+ characters) or a 6-digit code emailed to them.
- Passwords are stored salted and stretched in Script Properties, never in this repo. Older hashes upgrade at the next sign-in.
- Sessions last 7 days. Every sign-in emails that admin with the IP and browser. "Sign out all" ends every session for that admin.
- 5 wrong passwords for an account, or 15 from one IP, locks password sign-in for 15 minutes.

### Payments (Stripe)

- Clients pay deposits and balances through Stripe Checkout. Script Properties > `STRIPE_SECRET_KEY` holds a **restricted** live key with Checkout Sessions: Write only.
- Payments are recorded in the Payments tab on return and by the daily reconcile.

### Emails and automations

- Emails go out from inquiries@magicmirrorrentalservices.com (Gmail "Send mail as" alias on the owner account), with the logo inline.
- `installAutomations()` sets a daily trigger (~9 AM ET) that reconciles Stripe and sends reminders, logged in the Automation Log tab. `previewAutomations()` shows what would send; `stopAutomations()` removes the trigger.

## Local preview

    cd public && python3 -m http.server 8000

## Speed

- Montserrat is self-hosted in `public/assets/fonts/` (no Google Fonts request) and preloaded on every page.
- Gallery photos have three sizes: `-sm` (480px), `-thumb` (800px) and full. Pages use `srcset` so phones get the small ones.
- After changing `style.css` or `main.js`, bump the `?v=` on their links so browsers fetch the new file.

## Search engines

Every push to `main` pings IndexNow (Bing, Yandex and others) with the URLs in `public/sitemap.xml`.
The key file is `public/c4524209ecb8611b8f0f23fa8546fa1d.txt`; keep it deployed. Add new pages to the sitemap.
