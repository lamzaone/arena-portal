export function formatPlaytime(seconds: number) {
  const totalHours = Math.floor(seconds / 3_600);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `${days}d ${hours}h` : `${totalHours}h`;
}

export function formatDate(unixSeconds: number) {
  if (!unixSeconds) return "Permanent";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })
    .format(new Date(unixSeconds * 1_000));
}

export function formatPortalDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })
    .format(new Date(value));
}

export function isActiveSanction(expiresAt: number) {
  return expiresAt === 0 || expiresAt > Math.floor(Date.now() / 1_000);
}
