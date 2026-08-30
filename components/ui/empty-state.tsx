import { Box } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  headingLevel?: "h1" | "h2" | "h3";
  size?: "compact" | "default";
  tone?: "default" | "danger" | "quiet";
};

export function EmptyState({
  title,
  description,
  icon = <Box aria-hidden="true" />,
  actions,
  className = "",
  headingLevel = "h2",
  size = "default",
  tone = "default",
}: EmptyStateProps) {
  const Heading = headingLevel;

  return (
    <section
      data-ui="empty-state"
      className={`panel ui-empty-state ui-empty-state-${size} ui-empty-state-${tone} ${className}`.trim()}
    >
      <div className="icon-box">{icon}</div>
      <div>
        <Heading>{title}</Heading>
        <p className="empty-copy">{description}</p>
      </div>
      {actions ? <div className="hero-actions">{actions}</div> : null}
    </section>
  );
}
