import type { ComponentPropsWithoutRef, ElementType } from "react";

type StyledPolymorphicProps<
  Element extends ElementType,
  OwnProps extends object = object,
> = OwnProps & {
  as?: Element;
  className?: string;
} & Omit<
    ComponentPropsWithoutRef<Element>,
    keyof OwnProps | "as" | "className"
  >;

export type PanelProps<Element extends ElementType = "section"> =
  StyledPolymorphicProps<Element>;

export type PanelHeaderProps<Element extends ElementType = "header"> =
  StyledPolymorphicProps<Element>;

export type SectionHeaderProps<Element extends ElementType = "header"> =
  StyledPolymorphicProps<Element, { compact?: boolean }>;

function classNames(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

/** Shared surface wrapper using the established `.panel` presentation. */
export function Panel<Element extends ElementType = "section">({
  as,
  className,
  ...props
}: PanelProps<Element>) {
  const Component = as ?? "section";
  const dataUi = (props as { "data-ui"?: string })["data-ui"] ?? "panel";
  return (
    <Component
      {...props}
      data-ui={dataUi}
      className={classNames("panel", className)}
    />
  );
}

/** Composable heading row for content inside a Panel. */
export function PanelHeader<Element extends ElementType = "header">({
  as,
  className,
  ...props
}: PanelHeaderProps<Element>) {
  const Component = as ?? "header";
  return (
    <Component
      {...props}
      data-part="heading"
      className={classNames("panel-heading", className)}
    />
  );
}

/** Shared section heading, with support for the existing compact treatment. */
export function SectionHeader<Element extends ElementType = "header">({
  as,
  className,
  compact = false,
  ...props
}: SectionHeaderProps<Element>) {
  const Component = as ?? "header";
  return (
    <Component
      {...props}
      data-ui="section-heading"
      className={classNames("section-heading", compact && "compact", className)}
    />
  );
}
