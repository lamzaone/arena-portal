"use client";

import { useState } from "react";

import { CrateOpener } from "@/components/economy/crate-opener";
import { InventoryManager } from "@/components/economy/inventory-manager";
import {
  nextInventorySelectionOwner,
  type InventorySelectionOwner,
} from "@/lib/economy/inventory-selection";

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
  const [selectionOwner, setSelectionOwner] =
    useState<InventorySelectionOwner>(null);
  const [crateOpening, setCrateOpening] = useState(false);

  function setOwner(owner: Exclude<InventorySelectionOwner, null>, active: boolean) {
    setSelectionOwner((current) =>
      nextInventorySelectionOwner(current, owner, active),
    );
  }

  return (
    <>
      <InventoryManager
        inventory={inventory}
        loadout={loadout}
        wallet={wallet}
        csrf={csrf}
        selectionMode={selectionOwner === "inventory"}
        onSelectionModeChange={(active) => setOwner("inventory", active)}
        selectionDisabled={crateOpening}
      />
      <CrateOpener
        mode="owned"
        crates={[]}
        inventory={inventory}
        wallet={wallet}
        csrf={csrf}
        selectionMode={selectionOwner === "crates"}
        onSelectionModeChange={(active) => setOwner("crates", active)}
        onOwnedInteraction={() => setSelectionOwner(null)}
        onOwnedOpeningChange={setCrateOpening}
      />
    </>
  );
}
