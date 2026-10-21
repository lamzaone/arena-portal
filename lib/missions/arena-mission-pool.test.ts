import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateMission, type MissionDefinition } from './definitions.ts';

async function catalogue(): Promise<MissionDefinition[]> {
    const data = JSON.parse(await readFile(new URL('./arena-mission-pool.json', import.meta.url), 'utf8'));
    return data.missions.map(validateMission);
}

test('arena pool offers 100 distinct enabled token missions in separate 50/30/20 schedules', async () => {
    const missions = await catalogue();
    assert.equal(missions.length, 100);
    assert.equal(new Set(missions.map(m => m.id)).size, 100);
    assert.deepEqual(['daily', 'weekly', 'monthly'].map(p => missions.filter(m => m.period === p).length), [50, 30, 20]);
    assert.equal(new Set(missions.map(m => `${m.period}/${m.metric}/${m.weapon ?? ''}/${m.target}`)).size, 100);
    for (const mission of missions) {
        assert.match(mission.id, /^arena_[dwm]_[a-z0-9_]+$/);
        assert.equal(mission.enabled, true);
        assert.deepEqual(mission.rewards, []);
        assert.ok(BigInt(mission.tokens) > 0n);
        assert.ok(!['completions', 'playtime_seconds'].includes(mission.metric));
    }
});

test('daily, weekly and monthly difficulty budgets fit their play windows', async () => {
    const limits: Record<string, Record<string, [number, number]>> = {
        daily: { kills: [15, 60], headshots: [5, 25], arena_wins: [5, 25], duel_wins: [1, 3], killstreak: [3, 5], knife_kills: [1, 3], weapon_kills: [2, 15], playtime_minutes: [15, 45] },
        weekly: { kills: [100, 250], headshots: [35, 90], arena_wins: [40, 100], duel_wins: [5, 15], killstreak: [5, 8], knife_kills: [5, 10], weapon_kills: [25, 60], playtime_minutes: [120, 240] },
        monthly: { kills: [500, 1500], headshots: [150, 300], arena_wins: [200, 400], duel_wins: [25, 50], killstreak: [8, 12], knife_kills: [25, 25], weapon_kills: [125, 250], playtime_minutes: [600, 1200] },
    };
    for (const mission of await catalogue()) {
        const [min, max] = limits[mission.period][mission.metric] ?? (mission.period === 'daily' ? [1, 1] : mission.period === 'weekly' ? [2, 3] : [5, 8]);
        assert.ok(mission.target >= min && mission.target <= max, `${mission.id}: target ${mission.target} outside ${min}..${max}`);
        const [rewardMin, rewardMax] = mission.period === 'daily' ? [10n, 100n] : mission.period === 'weekly' ? [50n, 300n] : [250n, 1200n];
        assert.ok(BigInt(mission.tokens) >= rewardMin && BigInt(mission.tokens) <= rewardMax, mission.id);
    }
});

test('harder targets for each objective and weapon never pay fewer tokens', async () => {
    const missions = await catalogue();
    for (const easier of missions) for (const harder of missions) {
        if (easier.metric === harder.metric && easier.weapon === harder.weapon && easier.target < harder.target)
            assert.ok(BigInt(easier.tokens) <= BigInt(harder.tokens), `${easier.id} pays more than ${harder.id}`);
    }
    assert.equal(missions.find(m => m.period === 'daily' && m.metric === 'kills' && m.target === 25)?.tokens, '25');
    assert.equal(missions.find(m => m.period === 'weekly' && m.metric === 'kills' && m.target === 250)?.tokens, '150');
});

test('rare special rounds occupy only three entries in each schedule', async () => {
    const missions = await catalogue();
    const special = missions.filter(m => /^(knife|grenade|decoy)_round_wins$/.test(m.metric));
    assert.equal(special.length, 9);
    for (const period of ['daily', 'weekly', 'monthly'])
        assert.deepEqual(special.filter(m => m.period === period).map(m => m.metric).sort(), ['decoy_round_wins', 'grenade_round_wins', 'knife_round_wins']);
});
