import { tokenAmountField } from '../economy/token-amount.ts';
export const missionPeriods = ['daily', 'weekly', 'monthly'] as const;
export type MissionPeriod = typeof missionPeriods[number];
export const missionMetrics = ['kills', 'headshots', 'arena_wins', 'duel_wins', 'killstreak', 'knife_kills', 'knife_round_wins', 'grenade_round_wins', 'decoy_round_wins', 'weapon_kills', 'playtime_minutes', 'playtime_seconds', 'completions'] as const;
export const missionWeapons = ['ak47', 'm4a1', 'm4a1_silencer', 'awp', 'ssg08', 'aug', 'sg556', 'famas', 'galilar', 'glock', 'hkp2000', 'usp_silencer', 'p250', 'deagle', 'revolver', 'elite', 'fiveseven', 'tec9', 'cz75a', 'mac10', 'mp9', 'mp7', 'mp5sd', 'ump45', 'p90', 'bizon', 'nova', 'xm1014', 'mag7', 'sawedoff', 'm249', 'negev', 'g3sg1', 'scar20', 'taser', 'knife'] as const;
export type MissionDefinition = {
    period: MissionPeriod;
    id: string;
    title: string;
    metric: typeof missionMetrics[number];
    target: number;
    tokens: string;
    enabled: boolean;
    weapon?: string;
    rewards: Array<{
        catalogueKey: string;
        quantity: number;
        label?: string;
    }>;
    includesWeekly?: boolean;
};
export type ManagedMission = {
    period: MissionPeriod;
    id: string;
    version: string;
    effectivePeriodStart: string;
    disabledImmediately: boolean;
    disabledUntilPeriodStart: string | null;
    definition: MissionDefinition;
    currentDefinition: MissionDefinition | null;
};
export class ConfigurationError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ConfigurationError('Expected a settings object.'); return value as Record<string, unknown>; }
function text(value: unknown, max: number) { if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value))
    throw new ConfigurationError('Review the name or catalogue key.'); return value.trim(); }
function integer(value: unknown, min: number, max: number) { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw new ConfigurationError(`Enter a whole value from ${min} to ${max}.`); return value; }
export function validateMission(value: unknown): MissionDefinition {
    const v = object(value);
    if (!missionPeriods.includes(v.period as MissionPeriod) || !missionMetrics.includes(v.metric as typeof missionMetrics[number]))
        throw new ConfigurationError('Choose a supported schedule and objective.');
    const id = text(v.id, 64);
    if (!/^[A-Za-z0-9_-]+$/.test(id))
        throw new ConfigurationError('Mission ID may contain letters, numbers, underscore and hyphen.');
    const tokens = tokenAmountField(v.tokens);
    if (tokens === null || typeof v.enabled !== 'boolean')
        throw new ConfigurationError('Review token rewards and enabled status.');
    if (v.metric === 'completions' && v.period !== 'monthly')
        throw new ConfigurationError('Completion objectives are monthly.');
    if (!Array.isArray(v.rewards) || v.rewards.length > 16)
        throw new ConfigurationError('Choose up to 16 reward items.');
    const rewards = v.rewards.map(entry => { const reward = object(entry); return { catalogueKey: text(reward.catalogueKey, 191), quantity: integer(reward.quantity, 1, 100), ...(reward.label === undefined ? {} : { label: text(reward.label, 120) }) }; });
    if (new Set(rewards.map(r => r.catalogueKey)).size !== rewards.length || rewards.reduce((n, r) => n + r.quantity, 0) > 100)
        throw new ConfigurationError('Use one row per item and at most 100 items in total.');
    if (v.metric === 'weapon_kills' && !missionWeapons.includes(v.weapon as typeof missionWeapons[number]))
        throw new ConfigurationError('Choose a supported weapon.');
    if (v.includesWeekly !== undefined && typeof v.includesWeekly !== 'boolean')
        throw new ConfigurationError('Invalid weekly completion option.');
    return { period: v.period as MissionPeriod, id, title: text(v.title, 120), metric: v.metric as MissionDefinition['metric'], target: integer(v.target, 1, 1000000000), tokens, enabled: v.enabled, ...(v.metric === 'weapon_kills' ? { weapon: v.weapon as string } : {}), rewards, ...(v.metric === 'completions' ? { includesWeekly: v.includesWeekly === true } : {}) };
}
export function periodStart(period: MissionPeriod, now = new Date()): string {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (period === 'weekly')
        date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    if (period === 'monthly')
        date.setUTCDate(1);
    return date.toISOString().slice(0, 10);
}
export function nextPeriodStart(period: MissionPeriod, now = new Date()): string {
    const date = new Date(`${periodStart(period, now)}T00:00:00Z`);
    if (period === 'monthly')
        date.setUTCMonth(date.getUTCMonth() + 1);
    else
        date.setUTCDate(date.getUTCDate() + (period === 'weekly' ? 7 : 1));
    return date.toISOString().slice(0, 10);
}
export const effectStyles = ['none', 'glow', 'gradient', 'shimmer', 'pulse', 'cycle', 'wave', 'sparkle', 'steps'] as const;
export const effectPalettes = ['original', 'rose', 'gold', 'ice', 'mint'] as const;
export type HudEffects = {
    styleId: typeof effectStyles[number];
    palette: typeof effectPalettes[number];
    speed: number;
    intensity: number;
    reducedMotion: 'respect' | 'always';
};
export const defaultEffects: HudEffects = { styleId: 'none', palette: 'original', speed: 1, intensity: .5, reducedMotion: 'respect' };
export type EffectsSettings = {
    version: string;
    config: HudEffects;
};
export function validateEffects(value: unknown): HudEffects {
    const v = object(value);
    if (Object.keys(v).some(k => !['styleId', 'palette', 'speed', 'intensity', 'reducedMotion'].includes(k)) || !effectStyles.includes(v.styleId as HudEffects['styleId']) || !effectPalettes.includes(v.palette as HudEffects['palette']) || !['respect', 'always'].includes(v.reducedMotion as string))
        throw new ConfigurationError('Choose supported effect settings. Custom styles and asset paths are not allowed.');
    if (typeof v.speed !== 'number' || ![.25, .5, 1, 1.5, 2].includes(v.speed) || typeof v.intensity !== 'number' || ![0, .25, .5, .75, 1].includes(v.intensity))
        throw new ConfigurationError('Choose a listed speed and intensity.');
    return { styleId: v.styleId as HudEffects['styleId'], palette: v.palette as HudEffects['palette'], speed: v.speed, intensity: v.intensity, reducedMotion: v.reducedMotion as HudEffects['reducedMotion'] };
}
export function configurationVersion(value: unknown): string { if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(value) || BigInt(value) > 18446744073709551615n)
    throw new ConfigurationError('Invalid settings version.'); return value; }
