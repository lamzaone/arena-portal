import { randomUUID } from "node:crypto";
import { Gift } from "lucide-react";

import {
  StaffGrantItemControls,
  type GrantCatalogueItem,
} from "@/components/economy/staff-grant-item-controls";
import { PlayerIdentity } from "@/components/player-identity";
import { Panel, PanelHeader } from "@/components/ui/panel";
import type { PlayerIdentityData } from "@/lib/player-identities";

export type { GrantCatalogueItem } from "@/components/economy/staff-grant-item-controls";

export function StaffGrantItemForm({
  action,
  catalogue,
  csrf,
  playerIdentity,
  steamId,
}: {
  action: string;
  catalogue: GrantCatalogueItem[];
  csrf: string;
  playerIdentity: PlayerIdentityData;
  steamId: string;
}) {
  return (
    <Panel className="economy-admin-section staff-grant-panel" id="staff-grant-item">
      <PanelHeader>
        <div>
          <p className="eyebrow">
            <Gift aria-hidden="true" /> Inventory grant
          </p>
          <h2>Grant player items</h2>
          <p>
            Build one independently configured selection, then grant every
            item in a single atomic request.
          </p>
        </div>
        <div className="economy-admin-target staff-grant-target">
          <span>Recipient</span>
          <PlayerIdentity
            player={playerIdentity}
            variant="compact"
            profileLink="hover-card"
          />
        </div>
      </PanelHeader>
      <StaffGrantItemControls
        action={action}
        catalogue={catalogue}
        csrf={csrf}
        initialIdempotencyKey={randomUUID().replaceAll("-", "")}
        steamId={steamId}
      />
    </Panel>
  );
}
