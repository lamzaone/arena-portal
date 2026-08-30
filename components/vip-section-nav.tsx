import { Crown, Sparkles } from "lucide-react";

import { SectionNav } from "@/components/ui/section-nav";

export function VipSectionNav({ active }: { active: "memberships" | "perks" }) {
  return (
    <SectionNav
      activeKey={active}
      ariaLabel="VIP sections"
      className="vip-section-menu"
      items={[
        { key: "memberships", href: "/vip", label: "Memberships", icon: Crown },
        { key: "perks", href: "/vip/perks", label: "Individual perks", icon: Sparkles },
      ]}
    />
  );
}
