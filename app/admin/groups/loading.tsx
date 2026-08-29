import { RouteLoading } from "@/components/ui/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      eyebrow="Founder identity controls"
      title="Groups, tags & privileges"
      description="Loading the shared Admins.Core, VIPCore, chat-tag, badge, privilege, and reward definitions."
      layout="form"
      staff
      staffSection="groups"
    />
  );
}
