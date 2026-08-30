"use client";

import { LoaderCircle, Search, X } from "lucide-react";
import {
  createContext,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type FormEvent,
  type FormHTMLAttributes,
  type InputHTMLAttributes,
  type InputEvent,
  type Ref,
  useEffect,
  useContext,
  useRef,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

import { announceNavigationStart } from "@/components/ui/navigation-progress";
import styles from "@/components/ui/search-field.module.css";

export const DEFAULT_SEARCH_DEBOUNCE_MS = 280;

const SearchNavigationPendingContext = createContext(false);

type SearchNavigationFormProps = Omit<
  FormHTMLAttributes<HTMLFormElement>,
  "action" | "method" | "onSubmit"
> & {
  action: string;
  /**
   * Debounces text entry and navigates immediately when a select, checkbox,
   * or radio changes. Enter still submits immediately.
   */
  instant?: boolean;
  debounceMs?: number;
  /** Query-string fields that should be removed whenever filters change. */
  resetFields?: readonly string[];
  replace?: boolean;
};

/**
 * GET search form that uses an App Router transition instead of a browser
 * document navigation. Server-filtered result pages can update while shared
 * navigation and surrounding UI stay mounted.
 */
export function SearchNavigationForm({
  action,
  instant = false,
  debounceMs = DEFAULT_SEARCH_DEBOUNCE_MS,
  resetFields = [],
  replace = true,
  children,
  onChange,
  onInput,
  ...formProps
}: SearchNavigationFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  function navigate(form: HTMLFormElement) {
    const formData = new FormData(form);
    const target = new URL(action, window.location.href);
    target.search = "";
    for (const [name, value] of formData.entries()) {
      if (typeof value === "string" && value) target.searchParams.append(name, value);
    }
    for (const field of resetFields) target.searchParams.delete(field);
    const href = `${target.pathname}${target.search}${target.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (href !== current) announceNavigationStart();
    startTransition(() => {
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });
  }

  function schedule(form: HTMLFormElement, delay: number) {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (delay <= 0) {
      timerRef.current = null;
      navigate(form);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      navigate(form);
    }, delay);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    navigate(event.currentTarget);
  }

  function input(event: InputEvent<HTMLFormElement>) {
    onInput?.(event);
    if (!instant) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type !== "search" && target.type !== "text") return;
    schedule(event.currentTarget, debounceMs);
  }

  function change(event: ChangeEvent<HTMLFormElement>) {
    onChange?.(event);
    if (!instant) return;
    const target = event.target;
    if (target instanceof HTMLSelectElement) {
      schedule(event.currentTarget, 0);
      return;
    }
    if (
      target instanceof HTMLInputElement &&
      (target.type === "checkbox" || target.type === "radio")
    ) {
      schedule(event.currentTarget, 0);
    }
  }

  return (
    <SearchNavigationPendingContext.Provider value={pending}>
      <form
        {...formProps}
        action={action}
        method="get"
        role={formProps.role ?? "search"}
        aria-busy={pending || undefined}
        data-instant-search={instant ? "true" : undefined}
        onChange={change}
        onInput={input}
        onSubmit={submit}
      >
        {children}
      </form>
    </SearchNavigationPendingContext.Provider>
  );
}

type SearchFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  onClear?: () => void;
  helpText?: string;
  rootClassName?: string;
  inputRef?: Ref<HTMLInputElement>;
  pending?: boolean;
};

export function SearchField({
  id,
  label,
  value,
  onValueChange,
  onClear,
  helpText,
  rootClassName,
  inputRef,
  pending = false,
  disabled,
  ...inputProps
}: SearchFieldProps) {
  const localInputRef = useRef<HTMLInputElement>(null);
  const navigationPending = useContext(SearchNavigationPendingContext);
  const isPending = pending || navigationPending;
  const helpId = helpText ? `${id}-help` : undefined;

  function clear() {
    if (onClear) onClear();
    else onValueChange("");
    window.requestAnimationFrame(() => {
      const input = localInputRef.current;
      input?.focus();
      // Controlled input changes do not emit a native input event. Dispatch
      // one so an enclosing instant SearchNavigationForm refreshes on clear.
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  return (
    <div data-ui="search-field" className={[styles.root, rootClassName].filter(Boolean).join(" ")}>
      <label className={styles.labelText} htmlFor={id}>{label}</label>
      <span className={styles.control} data-part="control">
        <Search className={styles.icon} aria-hidden="true" />
        <input
          {...inputProps}
          ref={(node) => {
            localInputRef.current = node;
            if (typeof inputRef === "function") inputRef(node);
            else if (inputRef) inputRef.current = node;
          }}
          className={styles.input}
          id={id}
          type="search"
          value={value}
          disabled={disabled}
          aria-describedby={inputProps["aria-describedby"] ?? helpId}
          onChange={(event) => onValueChange(event.currentTarget.value)}
        />
        {isPending ? (
          <span className={styles.pending} aria-hidden="true">
            <LoaderCircle />
          </span>
        ) : value && !disabled ? (
          <button
            className={styles.clear}
            type="button"
            onClick={clear}
            aria-label={`Clear ${label.toLocaleLowerCase()}`}
          >
            <X aria-hidden="true" />
          </button>
        ) : (
          <span className={styles.trailingSpace} aria-hidden="true" />
        )}
      </span>
      {helpText ? <span className={styles.meta} id={helpId}>{helpText}</span> : null}
    </div>
  );
}

type SearchSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  alignWithLabel?: boolean;
  iconOnly?: boolean;
  pending?: boolean;
  pendingLabel?: string;
  variant?: "primary" | "secondary";
};

export function SearchSubmitButton({
  children = "Search",
  className,
  alignWithLabel = false,
  iconOnly = false,
  pending = false,
  pendingLabel = "Searching",
  variant = "primary",
  type = "submit",
  ...props
}: SearchSubmitButtonProps) {
  const navigationPending = useContext(SearchNavigationPendingContext);
  const isPending = pending || navigationPending;
  return (
    <button
      {...props}
      className={[
        `button button-${variant}`,
        styles.submit,
        alignWithLabel ? styles.alignWithLabel : "",
        iconOnly ? styles.iconOnly : "",
        className,
      ].filter(Boolean).join(" ")}
      type={type}
      disabled={props.disabled || isPending}
      aria-busy={isPending || undefined}
    >
      {isPending ? <LoaderCircle className={styles.buttonSpinner} aria-hidden="true" /> : <Search aria-hidden="true" />}
      {iconOnly ? <span className="sr-only">{isPending ? pendingLabel : children}</span> : isPending ? pendingLabel : children}
    </button>
  );
}
