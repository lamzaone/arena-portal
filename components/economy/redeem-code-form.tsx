"use client";

import { CheckCircle2, Gift, LoaderCircle, TicketCheck } from "lucide-react";
import { FormEvent, useState } from "react";

import { postEconomyAction } from "@/components/economy/economy-request";
import { PortalToast } from "@/components/success-toast";

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
    <section className="panel redeem-player-panel">
      <div className="redeem-player-copy">
        <p className="eyebrow">
          <TicketCheck aria-hidden="true" /> Reward locker
        </p>
        <h2>Redeem a code</h2>
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
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={64}
            placeholder="TAPPD-SUMMER-2026"
            disabled={pending}
          />
          <button className="button button-primary" type="submit" disabled={pending || !code.trim()}>
            {pending ? <LoaderCircle className="spin" aria-hidden="true" /> : <Gift aria-hidden="true" />}
            {pending ? "Redeeming" : "Redeem"}
          </button>
        </div>
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
      {message ? <PortalToast message={message} onDismiss={() => setMessage(null)} /> : null}
      {error ? <PortalToast variant="danger" message={error} onDismiss={() => setError(null)} /> : null}
    </section>
  );
}
