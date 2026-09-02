import { InventoryManager } from "@/components/economy/inventory-manager";

type InventoryWorkspaceProps = {
  inventory: unknown;
  loadout: unknown;
  wallet: unknown;
  csrf: string;
};

export function InventoryWorkspace({
  inventory,
  loadout,
  wallet,
  csrf,
}: InventoryWorkspaceProps) {
  return (
    <InventoryManager
      inventory={inventory}
      loadout={loadout}
      wallet={wallet}
      csrf={csrf}
    />
  );
}
