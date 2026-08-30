import type { ReactNode } from "react";

type PageHeadingProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
  className?: string;
  id?: string;
};

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
  className = "",
  id,
}: PageHeadingProps) {
  const titleId = id ?? undefined;

  return (
    <section
      data-ui="page-heading"
      className={`page-heading ${className}`.trim()}
      aria-labelledby={titleId}
    >
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 id={titleId}>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="page-heading-actions">{actions}</div> : null}
    </section>
  );
}
