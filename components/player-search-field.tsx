"use client";

import { LoaderCircle, LockKeyhole, Search, X } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { PlayerIdentity } from "@/components/player-identity";
import type { PlayerIdentityData } from "@/lib/player-identities";
import styles from "@/components/player-search-field.module.css";

export const PLAYER_SEARCH_ENDPOINT = "/api/players/search";

export type PlayerSearchResult = {
  steamId: string;
  displayName: string;
  avatarUrl: string | null;
  presence: PlayerIdentityData["presence"];
  profileThemeKey: string | null;
  inventoryVisibility: "public" | "private";
};

export type PlayerSearchFieldProps = {
  /** The existing form field receiving the query or selected SteamID64. */
  name: string;
  label: string;
  id?: string;
  className?: string;
  mode?: "query" | "target";
  defaultQuery?: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  disabled?: boolean;
  includeSelf?: boolean;
  /** Optional second existing field that always receives the selected SteamID64. */
  selectionName?: string;
  /** Existing sibling field to populate with the selected profile name. */
  companionNameField?: string;
  autoSubmitOnSelect?: boolean;
  onSelectionChange?: (player: PlayerSearchResult | null) => void;
  showInventoryVisibility?: boolean;
};

type SearchState = "idle" | "loading" | "ready" | "error";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isSteamId64(value: string) {
  return /^7656119\d{10}$/.test(value.trim());
}

function parsePlayers(value: unknown): PlayerSearchResult[] {
  if (!isRecord(value) || !Array.isArray(value.players)) return [];
  return value.players.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const steamId = text(candidate.steamId);
    if (!isSteamId64(steamId)) return [];
    return [{
      steamId,
      displayName: text(candidate.displayName) || steamId,
      avatarUrl: text(candidate.avatarUrl) || text(candidate.avatarFull) || null,
      presence:
        candidate.presence === "online" || candidate.presence === "offline"
          ? candidate.presence
          : "unknown",
      profileThemeKey: text(candidate.profileThemeKey) || null,
      inventoryVisibility: candidate.inventoryVisibility === "public" ? "public" : "private",
    }];
  });
}

async function responseMessage(response: Response) {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.message === "string") return body.message;
  } catch {
    // A stable local message covers proxies that return a non-JSON failure.
  }
  return "Player search is unavailable right now.";
}

function setCompanionField(form: HTMLFormElement | null, name: string | undefined, value: string) {
  if (!form || !name) return;
  const control = form.elements.namedItem(name);
  if (!(control instanceof HTMLInputElement) && !(control instanceof HTMLTextAreaElement)) return;
  control.value = value;
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

function playerIdentity(player: PlayerSearchResult): PlayerIdentityData {
  return {
    steamId: player.steamId,
    displayName: player.displayName,
    avatarUrl: player.avatarUrl,
    presence: player.presence,
    profileThemeKey: player.profileThemeKey,
    identityGroups: [],
  };
}

export function PlayerSearchField({
  name,
  label,
  id,
  className,
  mode = "target",
  defaultQuery = "",
  placeholder = "Start typing a name or SteamID64",
  helpText,
  required = false,
  disabled = false,
  includeSelf = false,
  selectionName,
  companionNameField,
  autoSubmitOnSelect = false,
  onSelectionChange,
  showInventoryVisibility = false,
}: PlayerSearchFieldProps) {
  const generatedId = useId().replaceAll(":", "");
  const inputId = id ?? `player-search-${generatedId}`;
  const listboxId = `${inputId}-results`;
  const statusId = `${inputId}-status`;
  const errorId = `${inputId}-error`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(defaultQuery);
  const [selected, setSelected] = useState<PlayerSearchResult | null>(null);
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [open, setOpen] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [validationMessage, setValidationMessage] = useState("");

  const trimmedQuery = query.trim();
  const selectedSteamId = selected?.steamId ?? (isSteamId64(trimmedQuery) ? trimmedQuery : "");
  const submittedValue = mode === "target"
    ? selectedSteamId
    : selected?.steamId ?? trimmedQuery;

  useEffect(() => {
    setQuery(defaultQuery);
    setSelected(null);
    setValidationMessage("");
  }, [defaultQuery]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setSearchState("idle");
      setResults([]);
      return;
    }
    if (!engaged) {
      setOpen(false);
      return;
    }
    if (selected && trimmedQuery === selected.displayName) {
      setSearchState("idle");
      setResults([]);
      return;
    }
    if (trimmedQuery.length < 2 && !isSteamId64(trimmedQuery)) {
      setSearchState("idle");
      setResults([]);
      setActiveIndex(-1);
      return;
    }

    setSearchState("loading");
    setResults([]);
    setActiveIndex(-1);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: trimmedQuery });
      if (includeSelf) params.set("includeSelf", "1");
      void fetch(`${PLAYER_SEARCH_ENDPOINT}?${params.toString()}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(await responseMessage(response));
          return response.json() as Promise<unknown>;
        })
        .then((body) => {
          if (controller.signal.aborted) return;
          const players = parsePlayers(body);
          setResults(players);
          setActiveIndex(players.length ? 0 : -1);
          setSearchState("ready");
          setOpen(true);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setResults([]);
          setActiveIndex(-1);
          setSearchState("error");
          setOpen(true);
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [disabled, engaged, includeSelf, selected, trimmedQuery]);

  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    const validate = (event: FormEvent<HTMLFormElement> | Event) => {
      if (disabled || !required || submittedValue) return;
      event.preventDefault();
      setValidationMessage(
        mode === "target"
          ? "Choose a matching player or enter a complete SteamID64."
          : "Enter a player name or SteamID64.",
      );
      setOpen(true);
      inputRef.current?.focus();
    };
    form.addEventListener("submit", validate);
    return () => form.removeEventListener("submit", validate);
  }, [disabled, mode, required, submittedValue]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document
      .getElementById(`${inputId}-option-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, inputId, open]);

  function choosePlayer(player: PlayerSearchResult) {
    const form = rootRef.current?.closest("form") ?? null;
    setSelected(player);
    setQuery(player.displayName);
    setResults([]);
    setSearchState("idle");
    setEngaged(false);
    setActiveIndex(-1);
    setOpen(false);
    setValidationMessage("");
    setCompanionField(form, companionNameField, player.displayName);
    onSelectionChange?.(player);
    inputRef.current?.focus();
    if (autoSubmitOnSelect) {
      window.requestAnimationFrame(() => form?.requestSubmit());
    }
  }

  function clearSelection() {
    const form = rootRef.current?.closest("form") ?? null;
    if (selected && companionNameField) {
      const control = form?.elements.namedItem(companionNameField);
      if (
        (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) &&
        control.value === selected.displayName
      ) {
        setCompanionField(form, companionNameField, "");
      }
    }
    setSelected(null);
    setQuery("");
    setResults([]);
    setSearchState("idle");
    setActiveIndex(-1);
    setOpen(false);
    setValidationMessage("");
    onSelectionChange?.(null);
    inputRef.current?.focus();
  }

  function handleInput(value: string) {
    const form = rootRef.current?.closest("form") ?? null;
    if (selected && value !== selected.displayName) {
      if (companionNameField) {
        const control = form?.elements.namedItem(companionNameField);
        if (
          (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) &&
          control.value === selected.displayName
        ) {
          setCompanionField(form, companionNameField, "");
        }
      }
      setSelected(null);
      onSelectionChange?.(null);
    }
    setQuery(value);
    setEngaged(true);
    setValidationMessage("");
    setOpen(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => current < results.length - 1 ? current + 1 : 0);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => current > 0 ? current - 1 : results.length - 1);
      return;
    }
    if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      choosePlayer(results[activeIndex]);
    }
  }

  const showResults = open && (searchState === "loading" || searchState === "ready" || searchState === "error");
  const describedBy = [statusId, validationMessage ? errorId : ""].filter(Boolean).join(" ");
  const defaultHelp = mode === "target"
    ? "Choose a result, or enter a complete SteamID64 for an account not listed."
    : "Search with at least two characters or a complete SteamID64.";

  return (
    <div
      ref={rootRef}
      className={[styles.root, className].filter(Boolean).join(" ")}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setEngaged(false);
          setOpen(false);
        }
      }}
    >
      <div className={styles.label}>
        <label className={styles.labelText} htmlFor={inputId}>{label}</label>
        <span className={styles.combobox} data-invalid={validationMessage ? "true" : "false"}>
          <Search className={styles.searchIcon} aria-hidden="true" />
          <input
            ref={inputRef}
            className={styles.input}
            id={inputId}
            type="search"
            value={query}
            disabled={disabled}
            required={required}
            maxLength={64}
            placeholder={placeholder}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={showResults}
            aria-activedescendant={open && activeIndex >= 0 ? `${inputId}-option-${activeIndex}` : undefined}
            aria-describedby={describedBy}
            aria-invalid={validationMessage ? "true" : undefined}
            onChange={(event) => handleInput(event.target.value)}
            onFocus={() => {
              setEngaged(true);
              if (searchState !== "idle") setOpen(true);
            }}
            onKeyDown={handleKeyDown}
          />
          {searchState === "loading" ? (
            <span className={styles.trailing} aria-hidden="true"><LoaderCircle className={styles.spinner} /></span>
          ) : selected || query ? (
            <button className={styles.trailing} type="button" onClick={clearSelection} aria-label="Clear player search">
              <X aria-hidden="true" />
            </button>
          ) : <span className={styles.trailing} aria-hidden="true" />}
        </span>
      </div>
      <input type="hidden" name={name} value={submittedValue} readOnly />
      {selectionName ? <input type="hidden" name={selectionName} value={selectedSteamId} readOnly /> : null}
      <p className={`${styles.meta}${validationMessage ? ` ${styles.error}` : ""}`} id={validationMessage ? errorId : undefined}>
        {validationMessage ? validationMessage : selected ? (
          <PlayerIdentity
            player={playerIdentity(selected)}
            variant="inline"
            className={styles.selectedProfile}
            hoverCard={false}
            profileLink="none"
          />
        ) : helpText ?? defaultHelp}
      </p>
      <span className="sr-only" id={statusId} role="status" aria-live="polite">
        {selected
          ? `${selected.displayName}, SteamID64 ${selected.steamId}, selected.`
          : searchState === "loading"
            ? "Searching for players."
            : searchState === "ready"
              ? `${results.length} matching player${results.length === 1 ? "" : "s"} found.`
              : searchState === "error"
                ? "Player search is unavailable. You can still enter a complete SteamID64."
                : "Enter at least two characters to search for a player."}
      </span>
      {showResults ? (
        <div className={styles.results} id={listboxId} role="listbox" aria-label="Matching players">
          {searchState === "loading" ? Array.from({ length: 3 }, (_, index) => (
            <span className={styles.skeleton} key={index} aria-hidden="true">
              <i className={styles.skeletonAvatar} />
              <span className={styles.skeletonCopy}><i className={styles.skeletonLine} /><i className={styles.skeletonLine} /></span>
            </span>
          )) : searchState === "ready" && results.length ? results.map((player, index) => (
            <div
              className={`${styles.result}${showInventoryVisibility ? ` ${styles.resultWithMeta}` : ""}`}
              id={`${inputId}-option-${index}`}
              key={player.steamId}
              role="option"
              tabIndex={0}
              aria-label={`Select ${player.displayName}`}
              aria-selected={activeIndex === index}
              data-active={activeIndex === index ? "true" : "false"}
              onMouseEnter={() => setActiveIndex(index)}
              onFocusCapture={() => setActiveIndex(index)}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("a")) return;
                choosePlayer(player);
              }}
              onKeyDown={(event) => {
                if ((event.target as HTMLElement).closest("a")) return;
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                choosePlayer(player);
              }}
            >
              <PlayerIdentity
                player={playerIdentity(player)}
                variant="compact"
                className={styles.resultProfile}
                profileLink="hover-card"
              />
              {showInventoryVisibility ? (
                <span className={`${styles.visibility} ${player.inventoryVisibility === "public" ? styles.public : styles.private}`}>
                  {player.inventoryVisibility === "public" ? "Public" : <><LockKeyhole aria-hidden="true" /> Private</>}
                </span>
              ) : null}
            </div>
          )) : (
            <p className={styles.empty}>
              {searchState === "error"
                ? "Search is temporarily unavailable. A complete SteamID64 can still be submitted."
                : isSteamId64(trimmedQuery)
                  ? "No saved profile matched, but this complete SteamID64 can still be used."
                  : "No matching ARENA players found."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
