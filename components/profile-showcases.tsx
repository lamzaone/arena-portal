import { BadgeCheck, LayoutPanelTop, Trophy } from "lucide-react";

import { Panel } from "@/components/ui/panel";

const upcomingShowcases = [
  {
    title: "Loadout showcase",
    description: "Feature your equipped T and CT cosmetics on your profile.",
    icon: LayoutPanelTop,
  },
  {
    title: "Achievement showcase",
    description: "Choose the milestones that best represent your ARENA record.",
    icon: Trophy,
  },
  {
    title: "Badge showcase",
    description: "Pin earned community and event badges beside your identity.",
    icon: BadgeCheck,
  },
] as const;

/** Static roadmap content shared by Settings and its async route fallback. */
export function ProfileShowcases() {
  return (
    <Panel className="settings-section" aria-labelledby="showcase-heading">
      <div className="settings-section-heading">
        <div>
          <p className="eyebrow">Profile showcases</p>
          <h2 id="showcase-heading">More ways to tell your ARENA story.</h2>
        </div>
        <span className="badge">Coming soon</span>
      </div>
      <div className="settings-upcoming-grid">
        {upcomingShowcases.map(({ title, description, icon: Icon }) => (
          <article key={title} aria-disabled="true">
            <Icon aria-hidden="true" />
            <strong>{title}</strong>
            <p>{description}</p>
            <span>Upcoming</span>
          </article>
        ))}
      </div>
    </Panel>
  );
}
