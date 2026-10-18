import { CustomPerkWorkspace } from "./custom-perk-workspace";
export default function VipPerkAdminPage({ searchParams }: { searchParams: Promise<{ view?: string; page?: string; notice?: string; error?: string }> }) {
  return <CustomPerkWorkspace searchParams={searchParams} embedded={false} />;
}
