import { RouteLoading } from "@/components/ui/route-loading";

export default function Loading() {
  return <RouteLoading eyebrow="Staff operations" title="Command centre" description="Moderate the server, manage access, and respond to player cases from one protected control room." layout="table" staff staffSection="bans" />;
}
