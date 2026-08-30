import { RouteLoading } from "@/components/ui/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      eyebrow="Staff panel"
      title="Group listings"
      description="Loading membership inventory items, publication channels, prices, durations, and individual perk offers."
      layout="form"
      staff
      staffSection="groups"
    />
  );
}
