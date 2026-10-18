export const primaryLinks: readonly { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/vip", label: "VIP" },
  { href: "/ranking", label: "Ranking" },
  { href: "/staff", label: "Staff" },
  { href: "/bans", label: "Bans" },
];

export function isPrimaryNavigationLinkActive(pathname: string | null, href: string) {
  return pathname === href || (href !== "/" && pathname?.startsWith(`${href}/`) === true);
}
