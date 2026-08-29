import { RouteLoading } from "@/components/ui/route-loading";

export default function Loading() {
  return <RouteLoading eyebrow="Your player profile" title="Player profile" description="Loading your current rank, groups, and combat record." layout="cards" />;
}
