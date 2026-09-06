---
type: "query"
date: "2026-09-06T03:34:25.260161+00:00"
question: "Why can a selected theme reset while it remains in inventory?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["SettingsPage()", "session.ts", "portal-repository.ts", "reconcileIdentityGroupRewards()"]
---

# Q: Why can a selected theme reset while it remains in inventory?

## Answer

Expanded graph vocabulary: theme settings entitlement session. The graph connected settings, session, portal-repository.ts and reward reconciliation. Source inspection found profile-theme-entitlements.ts live membership checks hiding available owned items on membership change or outage. Theme authorization now uses matching available inventory and trusted enabled themes; the existing reward lifecycle still revokes items. Regression tests cover persistence, session renewal and actual inventory removal.

## Outcome

- Signal: useful

## Source Nodes

- SettingsPage()
- session.ts
- portal-repository.ts
- reconcileIdentityGroupRewards()