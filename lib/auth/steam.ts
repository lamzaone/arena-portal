import "server-only";

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_IDENTIFIER = "http://specs.openid.net/auth/2.0/identifier_select";

function getPortalOrigin(requestUrl: URL) {
  const configured = process.env.SITE_URL;
  if (configured) {
    const url = new URL(configured);
    if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
      throw new Error("SITE_URL must use HTTPS in production.");
    }
    return url.origin;
  }

  return requestUrl.origin;
}

export function createSteamLoginUrl(requestUrl: URL) {
  const origin = getPortalOrigin(requestUrl);
  const callbackUrl = new URL("/api/auth/steam/callback", origin).toString();
  const parameters = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": callbackUrl,
    "openid.realm": origin,
    "openid.identity": STEAM_IDENTIFIER,
    "openid.claimed_id": STEAM_IDENTIFIER
  });

  return `${STEAM_OPENID_ENDPOINT}?${parameters.toString()}`;
}

export async function verifySteamLogin(requestUrl: URL) {
  const parameters = requestUrl.searchParams;
  const claimedId = parameters.get("openid.claimed_id");
  const returnTo = parameters.get("openid.return_to");

  if (!claimedId || !returnTo) return null;
  if (new URL(returnTo).origin !== getPortalOrigin(requestUrl)) return null;

  const validationParameters = new URLSearchParams();
  for (const [key, value] of parameters.entries()) {
    if (key.startsWith("openid.")) validationParameters.set(key, value);
  }
  validationParameters.set("openid.mode", "check_authentication");

  const response = await fetch(STEAM_OPENID_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: validationParameters.toString(),
    cache: "no-store"
  });
  const validation = await response.text();
  if (!response.ok || !/^is_valid:true$/m.test(validation)) return null;

  const match = claimedId.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/);
  return match?.[1] ?? null;
}
