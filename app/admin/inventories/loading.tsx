import { RouteLoading } from "@/components/ui/route-loading";

export default function Loading() {
  return <RouteLoading eyebrow="Staff panel" title="Player inventories" description="Find a player by display name or SteamID64, then inspect their live wallet, loadout, and paged item inventory without leaving the staff workspace." layout="inventory" staff staffSection="inventories" />;
}
