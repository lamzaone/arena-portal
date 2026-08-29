import { RouteLoading } from "@/components/ui/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      eyebrow="Player cosmetics"
      title="Loadout"
      description="Checking your account and current cosmetic catalogue."
      layout="inventory"
    />
  );
}
