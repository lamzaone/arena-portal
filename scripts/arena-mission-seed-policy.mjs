import { periodStart, validateMission } from '../lib/missions/definitions.ts';

export function parseSeedArguments(argv) {
    const allowed = new Set(['--audit', '--apply', '--help']);
    if (argv.some(argument => !allowed.has(argument)) || (argv.includes('--audit') && argv.includes('--apply')))
        throw new Error('Use --audit (default), --apply, or --help.');
    return { apply: argv.includes('--apply'), help: argv.includes('--help') };
}

/** The bootstrap is a fixed token-only library. Staff may add item rewards in the portal afterward. */
export function validateMissionPool(value) {
    if (!value || !Array.isArray(value.missions) || value.missions.length !== 100)
        throw new Error('The arena mission seed must contain exactly 100 missions.');
    const missions = value.missions.map(validateMission);
    if (new Set(missions.map(mission => mission.id)).size !== missions.length)
        throw new Error('Arena mission seed IDs must be unique.');
    for (const [period, count] of [['daily', 50], ['weekly', 30], ['monthly', 20]]) {
        if (missions.filter(mission => mission.period === period).length !== count)
            throw new Error(`The ${period} arena mission pool must contain ${count} entries.`);
    }
    for (const mission of missions) {
        if (!mission.id.startsWith(`arena_${mission.period[0]}_`) || !mission.enabled || mission.rewards.length || BigInt(mission.tokens) <= 0n)
            throw new Error('Seed only enabled arena-prefixed missions with positive token rewards and no item rewards.');
    }
    return missions;
}

/** Pure insert-only planning: a row in EITHER table always belongs to staff and is never repaired/overwritten. */
export function buildMissionSeedPlan(missions, existingDefinitions, existingVersions, now = new Date()) {
    const existing = new Set([...existingDefinitions, ...existingVersions].map(row => `${row.period_kind}/${row.mission_id}`));
    const insertions = [], preserved = [];
    for (const mission of missions) {
        const { period, enabled, ...snapshot } = mission;
        if (existing.has(`${period}/${mission.id}`)) {
            preserved.push({ period, id: mission.id });
            continue;
        }
        insertions.push({ period, id: mission.id, version: '1', effectivePeriodStart: periodStart(period, now), enabled: Number(enabled), definition: JSON.stringify(snapshot) });
    }
    return { insertions, preserved };
}
