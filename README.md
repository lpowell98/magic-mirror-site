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

The Book Now page embeds the existing BoothBook widgets from `booking.magicmirrorrentalservices.com`, so bookings keep flowing to BoothBook unchanged. Keep that subdomain's DNS record pointing at BoothBook when moving DNS to Cloudflare.

### Own booking system (replacing BoothBook)

- `public/booking/` is the booking page, portal and confirmation. It saves to the Google Sheet "MMRS Bookings" through an Apps Script web app.
- `apps-script/Code.gs` is that web app's code (paste into the sheet's Extensions > Apps Script, deploy as a Web app, Execute as Me, access Anyone).
- `API_URL` near the top of the script in `public/booking/index.html` is the deployed web app URL ("Booking v1"). To update the back end, use Deploy > Manage deployments > edit > New version so the URL stays the same.
- When leaving BoothBook, point `booking.magicmirrorrentalservices.com` at this Pages project (Custom domains tab). `functions/_middleware.js` serves `/booking/` on that subdomain.

## Local preview

    cd public && python3 -m http.server 8000
