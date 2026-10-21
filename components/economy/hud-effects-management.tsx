'use client';
import { useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AsyncButton } from '@/components/ui/async-button';
import { effectPalettes, effectStyles, validateEffects, type EffectsSettings, type HudEffects } from '@/lib/missions/definitions';
import './mission-management.css';
export function HudEffectsManagement({ csrf, settings }: {
    csrf: string;
    settings: EffectsSettings;
}) {
    const router = useRouter();
    const [config, setConfig] = useState(settings.config);
    const [version, setVersion] = useState(settings.version);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const keys = useRef(new Map<string, string>());
    function update(change: Partial<HudEffects>) { setConfig(old => ({ ...old, ...change })); setNotice(null); setError(null); }
    async function save(event: FormEvent) { event.preventDefault(); setPending(true); setError(null); try {
        const validated = validateEffects(config), fingerprint = JSON.stringify({ version, config: validated }), key = keys.current.get(fingerprint) ?? crypto.randomUUID();
        keys.current.set(fingerprint, key);
        const response = await fetch('/api/admin/hud-effects', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csrf, idempotencyKey: key, expectedVersion: version, config: validated }) });
        const result = await response.json();
        if (!response.ok || !result.ok)
            throw new Error(result.message ?? 'Could not save effects.');
        keys.current.delete(fingerprint);
        setVersion(result.result.version);
        setNotice(`Effects saved · version ${result.result.version}`);
        router.refresh();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Review the effect settings.');
    }
    finally {
        setPending(false);
    } }
    return <form className="mission-workspace mission-card mission-effects" onSubmit={save}>
  <div><p className="mission-kicker">Version {version}</p><h2>HUD effects</h2><p>Choose the supported in-game text effect profile. Changes apply at the next settings refresh. Player text, item metadata and run colors remain independent.</p></div>
  <fieldset disabled={pending}><div className="mission-fields"><label>Style<select aria-label="Style" value={config.styleId} onChange={e => update({ styleId: e.target.value as HudEffects['styleId'] })}>{effectStyles.map(s => <option key={s} value={s}>{s === 'none' ? 'Keep player effects (no global override)' : s}</option>)}</select></label><label>Palette<select aria-label="Palette" value={config.palette} onChange={e => update({ palette: e.target.value as HudEffects['palette'] })}>{effectPalettes.map(p => <option key={p}>{p}</option>)}</select></label><label>Speed<select aria-label="Speed" value={config.speed} onChange={e => update({ speed: Number(e.target.value) })}>{[.25, .5, 1, 1.5, 2].map(s => <option value={s} key={s}>{s}×</option>)}</select></label><label>Intensity<select aria-label="Intensity" value={config.intensity} onChange={e => update({ intensity: Number(e.target.value) })}>{[0, .25, .5, .75, 1].map(s => <option value={s} key={s}>{s * 100}%</option>)}</select></label><label>Reduced motion<select aria-label="Reduced motion" value={config.reducedMotion} onChange={e => update({ reducedMotion: e.target.value as HudEffects['reducedMotion'] })}><option value="respect">Respect client preference</option><option value="always">Always reduce motion</option></select></label></div></fieldset>
  <div><div className="mission-effects-preview" data-style={config.styleId} data-reduced={config.reducedMotion} style={{ '--effect-duration': `${2 / config.speed}s`, '--effect-min-opacity': 1 - config.intensity * .65 } as CSSProperties}>Arena player · Mission completed</div><p>Browser text sample: {config.styleId}, {config.palette}, {config.speed}×, {config.intensity * 100}%. Reduced motion retains static styling. Native rendering requires verification in CS2. New artwork families require the usual Workshop asset update.</p></div>
  {error ? <p role="alert" className="mission-error">{error}</p> : null}{notice ? <p role="status" className="mission-notice">{notice}</p> : null}<AsyncButton type="submit" pending={pending} pendingLabel="Saving…" className="button button-primary">Save effects</AsyncButton>
 </form>;
}
