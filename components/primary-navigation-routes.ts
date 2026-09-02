export function isPrimaryNavigationLinkActive(pathname: string | null, href: string) {
  return pathname === href || (href !== "/" && pathname?.startsWith(`${href}/`) === true);
}
