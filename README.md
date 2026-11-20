# Magic Mirror Rental Services website

Static copy of www.magicmirrorrentalservices.com (previously on Squarespace), ready for Cloudflare Pages.

## Layout

- `public/` is the site. Each page is `public/<page>/index.html`; shared styles and scripts are in `public/assets/`.
- `public/_redirects` sends the old `/our-photobooth` URL to `/magic-mirror/`.
- `functions/api/contact.js` handles the contact form (Cloudflare Pages Function).
- `scripts/fetch-images.sh` downloads all 148 images from the old Squarespace CDN into `public/images/`.

## Images (do this once)

The images are not in the repo yet. From the repo root on any machine with internet:

    bash scripts/fetch-images.sh
    git add public/images && git commit -m "Add site images" && git push

Do this before cancelling Squarespace, because the CDN copies may disappear afterwards.
The deploy workflow below does this automatically on its first run.

## Deploying

`.github/workflows/deploy.yml` deploys `public/` to the Cloudflare Pages project `magic-mirror-site` on every push to `main`
(and from the Actions tab via "Run workflow"). It needs two repository secrets
(GitHub > Settings > Secrets and variables > Actions):

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token from the "Edit Cloudflare Workers" template
- `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account ID

The first run also downloads the images from the old Squarespace CDN and commits them to the repo.
Custom domains (`www.magicmirrorrentalservices.com`, `magicmirrorrentalservices.com`) are added in the Pages project's Custom domains tab.

## Contact form

The form posts to `/api/contact`, which emails the message through Resend. In Pages > Settings > Variables and secrets add:

- `RESEND_API_KEY` (secret)
- `CONTACT_FROM`, a sender on a domain verified in Resend (default `Website <website@magicmirrorrentalservices.com>`)
- `CONTACT_TO` (optional, default `inquiries@magicmirrorrentalservices.com`)

Without these the form shows visitors the email address instead.

## Booking

The Book Now page embeds the existing BoothBook widgets from `booking.magicmirrorrentalservices.com`, so bookings keep flowing to BoothBook unchanged. Keep that subdomain's DNS record pointing at BoothBook when moving DNS to Cloudflare.

## Local preview

    cd public && python3 -m http.server 8000
