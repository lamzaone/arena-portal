import { RouteLoading } from "@/components/ui/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      eyebrow="Storefront control"
      title="Group & perk listings"
      description="Loading membership inventory items, publication channels, prices, durations, and individual perk offers."
      layout="form"
      staff
      staffSection="groups"
    />
  );
}
