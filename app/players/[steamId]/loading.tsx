import { RouteLoading } from "@/components/ui/route-loading";

export default function Loading() {
  return <RouteLoading eyebrow="Player profile" title="ARENA player" description="Loading this player's public rank, roles, and combat record." layout="cards" />;
}
