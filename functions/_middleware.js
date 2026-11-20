// Send the bare domain to www so search engines see one copy of the site.
// Once booking.magicmirrorrentalservices.com points at this project (after leaving BoothBook),
// serve the booking page from /booking/ on that subdomain.
export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  if (url.hostname === 'magicmirrorrentalservices.com') {
    url.hostname = 'www.magicmirrorrentalservices.com';
    return Response.redirect(url.toString(), 301);
  }
  if (url.hostname === 'booking.magicmirrorrentalservices.com' && !url.pathname.startsWith('/booking/')) {
    return env.ASSETS.fetch(new Request(new URL('/booking/', url), request));
  }
  return next();
}
