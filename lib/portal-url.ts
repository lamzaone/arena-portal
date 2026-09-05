/** Internal navigation must use the public origin, not a proxy's listen address. */
export function portalRedirectUrl(requestUrl: string, destination: URL | string) {
  const target = new URL(destination, requestUrl);
  const publicUrl = new URL(process.env.SITE_URL || requestUrl);
  const url = new URL(publicUrl.origin);
  url.pathname = target.pathname;
  url.search = target.search;
  url.hash = target.hash;
  return url;
}
