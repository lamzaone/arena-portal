import { RouteLoading } from "@/components/ui/route-loading";

export default function Loading() {
  return <RouteLoading eyebrow="Staff panel" title="Staff management" description="Moderate the server, manage staff and VIP access, and respond to player cases." layout="table" staff staffSection="bans" />;
}
