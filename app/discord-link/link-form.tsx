"use client";

import { CheckCircle2, Link2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { AsyncButton } from "@/components/ui/async-button";
import type { DiscordLink } from "@/lib/discord/link-repository";
import styles from "./link.module.css";

export function DiscordLinkForm({ csrf, initialLink, available }: { csrf: string; initialLink: DiscordLink | null; available: boolean }) {
  const [link, setLink] = useState(initialLink);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !code.trim()) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/discord/link", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ csrf, code }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.link) throw new Error(result.message || "Your Discord account could not be linked.");
      setLink(result.link);
      setCode("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Discord linking is temporarily unavailable. Try again later.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={`panel ${styles.panel}`} aria-labelledby="discord-link-heading">
      {link ? (
        <div className={styles.linked} role="status">
          <CheckCircle2 aria-hidden="true" />
          <div><h2 id="discord-link-heading">Discord connected</h2><p>Your Steam account is linked to Discord user <code>{link.discordUserId}</code>.</p><p>Your account is ready for ARENA community features.</p></div>
        </div>
      ) : (
        <>
          <div className={styles.copy}>
            <p className="eyebrow"><Link2 aria-hidden="true" /> Discord connection</p>
            <h2 id="discord-link-heading">Enter your link code</h2>
            <p>Use <code>/link</code> in the ARENA Discord server. The bot will give you a private code that expires in 10 minutes.</p>
            <p>Only enter a code you requested yourself. It connects the Discord account that requested it to your signed-in Steam account.</p>
          </div>
          {available ? (
            <form className={styles.form} onSubmit={submit}>
              <label htmlFor="discord-link-code">Discord link code</label>
              <div className={styles.controls}>
                <input id="discord-link-code" name="code" value={code} onChange={(event) => { setCode(event.target.value.toUpperCase()); setError(null); }}
                  placeholder="ABCD-1234-EF56" required maxLength={64} autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                  aria-invalid={Boolean(error)} aria-describedby={error ? "discord-link-error discord-link-help" : "discord-link-help"} disabled={pending} />
                <AsyncButton className="button button-primary" type="submit" icon={<Link2 />} pending={pending} pendingLabel="Linking" disabled={!code.trim() || !csrf}>Link Discord</AsyncButton>
              </div>
              <p id="discord-link-help" className={styles.help}>Each code works once. You can also enter <code>/discordlink CODE</code> in game.</p>
              {error ? <p id="discord-link-error" className={styles.error} role="alert">{error}</p> : null}
              {!csrf ? <p className={styles.error} role="alert">Account verification is unavailable. Try again later.</p> : null}
            </form>
          ) : <p className={styles.error} role="alert">Discord linking is temporarily unavailable. Reload this page to try again.</p>}
        </>
      )}
    </section>
  );
}
