import Link from "next/link";
import { MessageSquare, Paintbrush, Shield, Ticket, UserRound } from "lucide-react";

const links = [
  { href: "/dashboard", label: "Profile", icon: UserRound },
  { href: "/appeals", label: "Ban appeals", icon: Shield },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/skins", label: "Loadout", icon: Paintbrush }
];

export function AccountNav({ current }: { current: string }) {
  return (
    <nav className="account-nav" aria-label="Account navigation">
      {links.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className={current === href ? "active" : ""}>
          <Icon aria-hidden="true" /> {label}
        </Link>
      ))}
      <span className="account-nav-note"><MessageSquare aria-hidden="true" /> Discord link coming with the bot</span>
    </nav>
  );
}
