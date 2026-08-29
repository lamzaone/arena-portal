import { RouteLoading } from "@/components/ui/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      eyebrow="Account preferences"
      title="Settings & customisation"
      description="Control who can browse your inventory and choose the profile presentation attached to your account."
      layout="settings"
    />
  );
}
