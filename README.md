# Magic Mirror Rental Services website

Static copy of www.magicmirrorrentalservices.com (previously on Squarespace), ready for Cloudflare Pages.

## Layout

- `public/` is the site. Each page is `public/<page>/index.html`; shared styles and scripts are in `public/assets/`.
- `public/_redirects` sends the old `/our-photobooth` URL to `/magic-mirror/`.
- `functions/api/contact.js` handles the contact form (Cloudflare Pages Function).
- `src-images/` holds the original full-size photos. They are not deployed.
- `public/images/` holds the web versions (WebP, resized, with small `-thumb` versions for the gallery grids).

## Images

To add or change a photo, put the original in `src-images/<folder>/`, then from the repo root run:

    python3 scripts/optimize-images.py

and point the page at `/images/<folder>/<name>.webp`. The script needs Pillow (`pip install pillow`).

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
- One deployment serves both pages: Web app, Execute as **Me**, access **Anyone**. Its URL is `API_URL` in `public/booking/index.html` and `public/app/index.html`.
- To ship a code change: paste `Code.gs`, save, then Deploy > Manage deployments > edit (pencil) > Version: New version > Deploy. The URL stays the same.
- `CONFIG` at the top of `Code.gs`: `NOTIFY` (who gets new-booking alerts), `ADMINS` (who can sign in to the dashboard), `FROM` / `REPLY_TO` (client emails are sent as inquiries@).

### Dashboard sign-in

- Only emails in `CONFIG.ADMINS` can sign in, with a password or a 6-digit code emailed to them.
- Each person sets their own password from the dashboard's Password button. Passwords are stored salted and hashed in Script Properties, never in this repo.
- Sessions last 30 days. 5 wrong passwords locks sign-in for a while.

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
