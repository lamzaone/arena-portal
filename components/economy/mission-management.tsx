'use client';
import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Target, Trash2 } from 'lucide-react';
import { AsyncButton } from '@/components/ui/async-button';
import { PortalDialog } from '@/components/ui/portal-dialog';
import { missionPeriods, missionMetrics, missionWeapons, nextPeriodStart, validateMission, type ManagedMission, type MissionDefinition } from '@/lib/missions/definitions';
import type { EconomyCatalogueItem } from '@/lib/data/portal-repository';
import './mission-management.css';
const labels: Record<string, string> = { kills: 'Kills', headshots: 'Headshots', arena_wins: 'Arena wins', duel_wins: 'Duel wins', killstreak: 'Kills without dying', knife_kills: 'Knife kills', knife_round_wins: 'Knife arena round wins', grenade_round_wins: 'Grenade arena round wins', decoy_round_wins: 'Decoy arena round wins', weapon_kills: 'Selected weapon kills', playtime_minutes: 'Active playtime (minutes)', playtime_seconds: 'Active playtime (seconds, legacy)', completions: 'Completed missions' };
const empty: MissionDefinition = { period: 'daily', id: '', title: '', metric: 'kills', target: 25, tokens: '0', enabled: true, rewards: [] };
export function MissionManagement({ csrf, missions, catalogue }: {
    csrf: string;
    missions: ManagedMission[];
    catalogue: EconomyCatalogueItem[];
}) {
    const router = useRouter();
    const [draft, setDraft] = useState<MissionDefinition>({ ...empty });
    const [version, setVersion] = useState('0');
    const [editing, setEditing] = useState(false);
    const [filter, setFilter] = useState('all');
    const [query, setQuery] = useState('');
    const [items, setItems] = useState(catalogue);
    const [pending, setPending] = useState(false);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [disable, setDisable] = useState<ManagedMission | null>(null);
    const keys = useRef(new Map<string, string>());
    const allItems = new Map([...catalogue, ...items].map(i => [i.catalogueKey, i]));
    function update(change: Partial<MissionDefinition>) { setDraft(old => ({ ...old, ...change })); setError(null); }
    function edit(mission?: ManagedMission) { setDraft(mission ? structuredClone(mission.definition) : { ...empty, rewards: [] }); setVersion(mission?.version ?? '0'); setEditing(Boolean(mission)); setError(null); setNotice(null); }
    async function action(payload: Record<string, unknown>) { const fingerprint = JSON.stringify(payload), idempotencyKey = keys.current.get(fingerprint) ?? crypto.randomUUID(); keys.current.set(fingerprint, idempotencyKey); const response = await fetch('/api/admin/missions', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ ...payload, csrf, idempotencyKey }) }); const result = await response.json(); if (!response.ok || !result.ok)
        throw new Error(result.message ?? 'The mission could not be saved.'); keys.current.delete(fingerprint); router.refresh(); return result.result; }
    async function publish(event: FormEvent) { event.preventDefault(); setError(null); setNotice(null); try {
        const definition = validateMission(draft);
        setPending(true);
        const result = await action({ action: 'publish', expectedVersion: version, definition });
        setNotice(`Version ${result.version} published for ${result.effectivePeriodStart} at 00:00 UTC.`);
        setDraft({ ...empty, rewards: [] });
        setVersion('0');
        setEditing(false);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Review the mission.');
    }
    finally {
        setPending(false);
    } }
    async function disableNow() { if (!disable)
        return; setPending(true); setError(null); try {
        await action({ action: 'disable-immediately', period: disable.period, id: disable.id, expectedVersion: disable.version });
        setDisable(null);
        setNotice('Mission disabled immediately. Progress and awarded rewards are preserved.');
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Could not disable mission.');
    }
    finally {
        setPending(false);
    } }
    async function search() { setSearching(true); setError(null); try {
        const response = await fetch(`/api/admin/missions?q=${encodeURIComponent(query)}`, { credentials: 'same-origin', cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || !result.ok)
            throw new Error(result.message ?? 'Catalogue search failed.');
        setItems(result.catalogue.items);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Catalogue search failed.');
    }
    finally {
        setSearching(false);
    } }
    function rewardName(key: string) { return allItems.get(key)?.displayName ?? draft.rewards.find(r => r.catalogueKey === key)?.label ?? key; }
    return <div className="mission-workspace">
  {notice ? <p role="status" className="mission-notice">{notice}</p> : null}{error ? <p role="alert" className="mission-error">{error}</p> : null}
  <section className="mission-card mission-library" aria-labelledby="mission-library-title"><div className="mission-heading"><div><p className="mission-kicker">UTC calendar</p><h2 id="mission-library-title">Mission library</h2></div><button className="button button-secondary" onClick={() => edit()} disabled={pending}><Plus size={16}/>New mission</button></div>
   <p>This library is the candidate pool. Each player receives three random daily, three weekly and three monthly missions. Assignments and progress stay saved through reconnects until their reset: daily at midnight UTC, weekly on Monday, monthly on the 1st. Changes publish at the next reset; disabling stops progress and claims immediately.</p>
   <label className="mission-filter">Schedule<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All schedules</option>{missionPeriods.map(p => <option key={p}>{p}</option>)}</select></label>
   <div className="mission-library-list" tabIndex={0} aria-label="Managed missions">{missions.filter(m => filter === 'all' || m.period === filter).map(m => {
            const suppressed = m.disabledImmediately && (!m.disabledUntilPeriodStart || m.disabledUntilPeriodStart > new Date().toISOString().slice(0, 10));
            return <article key={`${m.period}/${m.id}`} className="mission-library-row"><div><span className="mission-kicker">{m.period} · v{m.version}</span><h3>{m.definition.title}</h3><p>{labels[m.definition.metric]} · {m.definition.target.toLocaleString()}</p><small>{suppressed ? 'Disabled immediately' : m.currentDefinition?.enabled ? 'Current version active' : 'No active managed version'} · Next version {m.definition.enabled ? 'enabled' : 'disabled'} from {m.effectivePeriodStart} UTC</small></div><div className="mission-row-actions"><button className="button button-secondary" aria-label={`Edit ${m.definition.title}`} onClick={() => edit(m)} disabled={pending}>Edit</button><button className="button button-secondary" aria-label={`Disable ${m.definition.title} now`} onClick={() => setDisable(m)} disabled={pending || suppressed}>Disable now</button></div></article>;
        })}{!missions.length ? <p>No managed definitions yet. Create a mission to start the library.</p> : null}</div>
  </section>
  <div className="mission-editor-grid"><form className="mission-card mission-editor" onSubmit={publish} aria-labelledby="mission-editor-title"><div className="mission-heading"><h2 id="mission-editor-title">{editing ? 'Edit mission' : 'Create mission'}</h2><Target aria-hidden="true"/></div><fieldset disabled={pending}>
    <div className="mission-fields"><label>Title<input required maxLength={120} value={draft.title} onChange={e => update({ title: e.target.value })}/></label><label>Stable ID<input required pattern="[A-Za-z0-9_-]+" maxLength={64} value={draft.id} disabled={editing} onChange={e => update({ id: e.target.value })}/></label><label>Schedule<select value={draft.period} disabled={editing} onChange={e => update({ period: e.target.value as MissionDefinition['period'] })}>{missionPeriods.map(p => <option key={p}>{p}</option>)}</select></label><label>Objective<select value={draft.metric} onChange={e => update({ metric: e.target.value as MissionDefinition['metric'], weapon: undefined })}>{missionMetrics.filter(m => m !== 'completions' || draft.period === 'monthly').map(m => <option value={m} key={m}>{labels[m]}</option>)}</select></label>
    {draft.metric === 'weapon_kills' ? <label>Weapon<select required value={draft.weapon ?? ''} onChange={e => update({ weapon: e.target.value })}><option value="">Choose weapon</option>{missionWeapons.map(w => <option key={w} value={w}>{w.replaceAll('_', ' ')}</option>)}</select></label> : null}<label>Target<input type="number" min={1} max={1000000000} required value={draft.target || ''} onChange={e => update({ target: Number(e.target.value) })}/></label><label>Token reward<input inputMode="numeric" pattern="[0-9]+" required value={draft.tokens} onChange={e => update({ tokens: e.target.value })}/></label></div>
    <label className="mission-check"><input type="checkbox" checked={draft.enabled} onChange={e => update({ enabled: e.target.checked })}/>Enabled from next period</label>{draft.metric === 'completions' ? <label className="mission-check"><input type="checkbox" checked={draft.includesWeekly === true} onChange={e => update({ includesWeekly: e.target.checked })}/>Include weekly completions</label> : null}
    <h3>Item rewards</h3><p>Up to 16 catalogue products, 100 items total. Every reward is paid together with Tokens.</p><ul className="mission-rewards">{draft.rewards.map((reward, index) => <li key={reward.catalogueKey}><span>{rewardName(reward.catalogueKey)}</span><input aria-label={`Quantity for ${rewardName(reward.catalogueKey)}`} type="number" required min={1} max={100} value={reward.quantity || ''} onChange={e => update({ rewards: draft.rewards.map((r, i) => i === index ? { ...r, quantity: Number(e.target.value) } : r) })}/><button type="button" className="button button-secondary" aria-label={`Remove ${rewardName(reward.catalogueKey)}`} onClick={() => update({ rewards: draft.rewards.filter((_, i) => i !== index) })}><Trash2 size={16}/></button></li>)}</ul>
    <div className="mission-search"><label>Search catalogue<input type="search" value={query} onChange={e => setQuery(e.target.value)}/></label><AsyncButton pending={searching} pendingLabel="Searching…" className="button button-secondary" onClick={search}>Search</AsyncButton></div>
    <div className="mission-catalogue" tabIndex={0} aria-label="Reward catalogue">{items.filter(i => i.catalogueKey && i.enabled).map(item => <div key={item.catalogueKey}><span>{item.displayName}<small>{item.itemType.replaceAll('_', ' ')}</small></span><button type="button" className="button button-secondary" aria-label={`Add ${item.displayName}`} disabled={draft.rewards.some(r => r.catalogueKey === item.catalogueKey) || draft.rewards.length >= 16} onClick={() => update({ rewards: [...draft.rewards, { catalogueKey: item.catalogueKey!, quantity: 1 }] })}>Add</button></div>)}</div>
   </fieldset><div className="mission-publication"><strong>Publishes {nextPeriodStart(draft.period)} at 00:00 UTC</strong><p>Current objectives and reward snapshots stay fixed. Enabling a disabled mission also waits for this boundary.</p><AsyncButton type="submit" pending={pending} pendingLabel="Publishing…" className="button button-primary">Publish next period</AsyncButton></div>
  </form><aside className="mission-card mission-player-preview" aria-label="Player preview"><p className="mission-kicker">Player preview</p><h2>{draft.title || 'Mission title'}</h2><p>{labels[draft.metric]}{draft.weapon ? ` · ${draft.weapon}` : ''}</p><progress value={0} max={draft.target || 1}/><p>0 / {(draft.target || 0).toLocaleString()}</p><hr /><h3>Rewards</h3><p>{draft.tokens || '0'} Tokens</p><ul>{draft.rewards.map(r => <li key={r.catalogueKey}>{r.quantity} × {rewardName(r.catalogueKey)}</li>)}</ul><p className="mission-muted">Rewards are granted in one claim. If a reward is unavailable, the claim stays available.</p></aside></div>
  <PortalDialog open={Boolean(disable)} title="Disable mission immediately?" description="Current progress stays saved. New progress and claims stop immediately. To enable it again, publish for the next UTC period." confirmLabel="Disable immediately" confirmDisabled={pending} tone="danger" onConfirm={disableNow} onDismiss={() => { if (!pending)
        setDisable(null); }}>{error ? <p role="alert">{error}</p> : null}</PortalDialog>
 </div>;
}
