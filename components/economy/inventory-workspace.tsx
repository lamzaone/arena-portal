"use client";

import { useState } from "react";

import { CrateOpener } from "@/components/economy/crate-opener";
import { InventoryManager } from "@/components/economy/inventory-manager";
import {
  inventoryWorkflowAccess,
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
  const [inventoryMutation, setInventoryMutation] = useState(false);
  const [inventoryResetKey, setInventoryResetKey] = useState(0);
  const [crateResetKey, setCrateResetKey] = useState(0);
  const access = inventoryWorkflowAccess({
    crateInteractionActive: crateOpening,
    inventoryMutationActive: inventoryMutation,
  });

  function setOwner(owner: Exclude<InventorySelectionOwner, null>, active: boolean) {
    setSelectionOwner((current) =>
      nextInventorySelectionOwner(current, owner, active),
    );
    if (active) {
      if (owner === "inventory") setCrateResetKey((current) => current + 1);
      else setInventoryResetKey((current) => current + 1);
    }
  }

  function startInventoryInteraction() {
    setSelectionOwner(null);
    setCrateResetKey((current) => current + 1);
  }

  function startCrateInteraction() {
    setSelectionOwner(null);
    setInventoryResetKey((current) => current + 1);
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
        selectionDisabled={access.inventoryDisabled}
        interactionDisabled={access.inventoryDisabled}
        interactionResetKey={inventoryResetKey}
        onInteractionStart={startInventoryInteraction}
        onMutationActiveChange={setInventoryMutation}
      />
      <CrateOpener
        mode="owned"
        crates={[]}
        inventory={inventory}
        wallet={wallet}
        csrf={csrf}
        selectionMode={selectionOwner === "crates"}
        onSelectionModeChange={(active) => setOwner("crates", active)}
        interactionDisabled={access.cratesDisabled}
        interactionResetKey={crateResetKey}
        onOwnedInteraction={startCrateInteraction}
        onOwnedOpeningChange={setCrateOpening}
      />
    </>
  );
}
