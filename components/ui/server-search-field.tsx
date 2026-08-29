import { Search } from "lucide-react";
import type { InputHTMLAttributes } from "react";

import styles from "@/components/ui/search-field.module.css";

type ServerSearchFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  id: string;
  label: string;
  helpText?: string;
  rootClassName?: string;
};

/**
 * Server-rendered counterpart to SearchField for native GET forms. It shares
 * the exact control geometry without shipping client state for a simple form.
 */
export function ServerSearchField({
  id,
  label,
  helpText,
  rootClassName,
  ...inputProps
}: ServerSearchFieldProps) {
  const helpId = helpText ? `${id}-help` : undefined;

  return (
    <div className={[styles.root, rootClassName].filter(Boolean).join(" ")}>
      <label className={styles.labelText} htmlFor={id}>{label}</label>
      <span className={styles.control}>
        <Search className={styles.icon} aria-hidden="true" />
        <input
          {...inputProps}
          className={styles.input}
          id={id}
          type="search"
          aria-describedby={inputProps["aria-describedby"] ?? helpId}
        />
        <span className={styles.trailingSpace} aria-hidden="true" />
      </span>
      {helpText ? <span className={styles.meta} id={helpId}>{helpText}</span> : null}
    </div>
  );
}
