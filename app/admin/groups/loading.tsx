import { RouteLoading } from "@/components/ui/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      eyebrow="Staff panel"
      title="Group management"
      description="Loading the shared Admins.Core, VIPCore, chat-tag, badge, privilege, and reward definitions."
      layout="form"
      staff
      staffSection="groups"
    />
  );
}
