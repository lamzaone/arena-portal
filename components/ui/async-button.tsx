"use client";

import { LoaderCircle } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";

type AsyncButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  children: ReactNode;
  icon?: ReactNode;
  pending: boolean;
  pendingLabel: ReactNode;
};

/**
 * A geometry-stable action button. Both labels remain in the same grid cell so
 * entering a pending state does not resize nearby controls.
 */
export function AsyncButton({
  children,
  className = "",
  disabled,
  icon,
  pending,
  pendingLabel,
  type = "button",
  ...props
}: AsyncButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`ui-async-button ${className}`.trim()}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      <span className="ui-async-button-icon" aria-hidden="true">
        <span className={pending ? "is-hidden" : ""}>{icon}</span>
        <LoaderCircle
          className={`ui-async-button-spinner${pending ? "" : " is-hidden"}`}
        />
      </span>
      <span className="ui-async-button-label">
        <span className={pending ? "is-hidden" : ""}>{children}</span>
        <span className={pending ? "" : "is-hidden"}>{pendingLabel}</span>
      </span>
    </button>
  );
}

type SubmitButtonProps = Omit<AsyncButtonProps, "pending" | "type">;

/** A form-action submit button driven by React's nearest form status. */
export function SubmitButton(props: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return <AsyncButton {...props} type="submit" pending={pending} />;
}
