// Send the bare domain to www so search engines see one copy of the site.
// booking.magicmirrorrentalservices.com/ serves the booking page; app.magicmirrorrentalservices.com/
// serves the owner dashboard. Only the root path is swapped, so CSS, images and scripts load normally.
export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  if (url.hostname === 'magicmirrorrentalservices.com') {
    url.hostname = 'www.magicmirrorrentalservices.com';
    return Response.redirect(url.toString(), 301);
  }
  const root = url.pathname === '/' || url.pathname === '/index.html';
  if (root && url.hostname === 'booking.magicmirrorrentalservices.com') {
    return env.ASSETS.fetch(new Request(new URL('/booking/' + url.search, url), request));
  }
  if (root && url.hostname === 'app.magicmirrorrentalservices.com') {
    return env.ASSETS.fetch(new Request(new URL('/app/' + url.search, url), request));
  }
  return next();
}
