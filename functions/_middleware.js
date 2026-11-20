// Send the bare domain to www so search engines see one copy of the site.
export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname === 'magicmirrorrentalservices.com') {
    url.hostname = 'www.magicmirrorrentalservices.com';
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
