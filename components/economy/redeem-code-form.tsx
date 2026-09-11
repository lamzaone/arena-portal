"use client";

import { Archive, ArrowUpRight, CheckCircle2, Gift, TicketCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

import { postEconomyAction } from "@/components/economy/economy-request";
import { PortalToast } from "@/components/success-toast";
import { AsyncButton } from "@/components/ui/async-button";
import styles from "./player-workspace.module.css";

type RedeemResult = {
  displayName: string;
  tokensAwarded: number;
  itemNames: string[];
};

export function RedeemCodeForm({ csrf }: { csrf: string }) {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code.trim() || pending) return;
    setPending(true);
    setError(null);
    setMessage(null);
    setResult(null);
    try {
      const response = await postEconomyAction("/api/economy/redeem", csrf, {
        code: code.trim(),
      });
      setResult({
        displayName: response.displayName ?? "Reward code",
        tokensAwarded: response.tokensAwarded ?? 0,
        itemNames: response.itemNames ?? [],
      });
      setMessage(response.message ?? "Reward added to your Token account.");
      setCode("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The redeem code could not be claimed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={`panel redeem-player-panel ${styles.redeem}`} aria-labelledby="redeem-form-heading">
      <div className="redeem-player-copy">
        <p className="eyebrow">
          <TicketCheck aria-hidden="true" /> Reward locker
        </p>
        <h2 id="redeem-form-heading">Redeem a code</h2>
        <p>
          Enter a code to add its Tokens and items directly to your account.
          Each code can be claimed only once per player.
        </p>
      </div>
      <form className="redeem-player-form" onSubmit={submit}>
        <label htmlFor="redeem-code">Reward code</label>
        <div>
          <input
            id="redeem-code"
            name="code"
            required
            autoComplete="off"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "redeem-code-error" : undefined}
            value={code}
            onChange={(event) => { setCode(event.target.value.toUpperCase()); setError(null); }}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={64}
            placeholder="TAPPD-SUMMER-2026"
            disabled={pending}
          />
          <AsyncButton
            className="button button-primary"
            type="submit"
            disabled={!code.trim()}
            icon={<Gift />}
            pending={pending}
            pendingLabel="Redeeming"
          >
            Redeem
          </AsyncButton>
        </div>
        {error ? <p id="redeem-code-error" className={styles.inlineError} role="alert">{error}</p> : null}
      </form>
      {result ? (
        <article className="redeem-reward-summary" aria-live="polite">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <strong>{result.displayName} claimed</strong>
            <p>
              {result.tokensAwarded
                ? `+${result.tokensAwarded.toLocaleString()} Tokens`
                : "No Token reward"}
              {result.itemNames.length
                ? ` · ${result.itemNames.join(", ")}`
                : ""}
            </p>
          </div>
        </article>
      ) : null}
      <nav className={styles.redeemLinks} aria-label="Reward destinations">
        <Link href="/inventory"><Archive aria-hidden="true" /> Your inventory</Link>
        <Link href="/market">Spend Tokens in Marketplace <ArrowUpRight aria-hidden="true" /></Link>
      </nav>
      {message ? <PortalToast message={message} onDismiss={() => setMessage(null)} /> : null}
    </section>
  );
}
