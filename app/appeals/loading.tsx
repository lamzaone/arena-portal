import { RouteLoading } from "@/components/ui/route-loading";

export default function Loading() {
  return <RouteLoading eyebrow="Moderation review" title="Ban appeals" description="Appeals are unlocked only while a current ban is active." layout="form" />;
}
