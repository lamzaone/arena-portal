import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildMissionSeedPlan, parseSeedArguments, validateMissionPool } from './arena-mission-seed-policy.mjs';

const catalogue = JSON.parse(await readFile(new URL('../lib/missions/arena-mission-pool.json', import.meta.url), 'utf8'));
const missions = catalogue.missions;

test('seed commands default to audit and refuse ambiguous or unknown arguments', () => {
    assert.deepEqual(parseSeedArguments([]), { apply: false, help: false });
    assert.deepEqual(parseSeedArguments(['--audit']), { apply: false, help: false });
    assert.deepEqual(parseSeedArguments(['--apply']), { apply: true, help: false });
    assert.equal(parseSeedArguments(['--help']).help, true);
    assert.throws(() => parseSeedArguments(['--apply', '--audit']));
    assert.throws(() => parseSeedArguments(['--force']));
});

test('first seed activates version one at the CURRENT UTC boundary for each independent schedule', () => {
    const plan = buildMissionSeedPlan(missions, [], [], new Date('2026-12-31T23:59:59Z'));
    assert.equal(plan.insertions.length, 100);
    assert.deepEqual(plan.preserved, []);
    for (const row of plan.insertions) {
        assert.equal(row.version, '1');
        assert.equal(row.effectivePeriodStart, { daily: '2026-12-31', weekly: '2026-12-28', monthly: '2026-12-01' }[row.period]);
        assert.equal(row.enabled, 1);
        const snapshot = JSON.parse(row.definition);
        assert.equal(snapshot.id, row.id);
        assert.equal(typeof snapshot.tokens, 'string');
        assert.equal(snapshot.period, undefined);
        assert.equal(snapshot.enabled, undefined);
    }
});

test('repeat seeds preserve all staff definitions, versions, immediate disables, and orphan parents', () => {
    const customDefinition = { period_kind: 'daily', mission_id: missions[0].id, disabled_immediately: 1, disabled_until_period_start: null };
    const staffVersion = { period_kind: 'daily', mission_id: missions[0].id, version: '17', enabled: 0, definition: '{"title":"Staff edited"}' };
    const orphanParent = { period_kind: missions[1].period, mission_id: missions[1].id, disabled_immediately: 0 };
    const orphanVersion = { period_kind: missions[2].period, mission_id: missions[2].id, version: '8', definition: '{}' };
    const definitions = [customDefinition, orphanParent];
    const versions = [staffVersion, orphanVersion];
    const before = JSON.stringify({ definitions, versions, missions });
    const plan = buildMissionSeedPlan(missions, definitions, versions, new Date('2026-10-22T00:00:00Z'));
    assert.equal(plan.insertions.length, 97);
    assert.deepEqual(plan.preserved.map(row => row.id), missions.slice(0, 3).map(row => row.id));
    assert.equal(JSON.stringify({ definitions, versions, missions }), before);
    assert.ok(!plan.insertions.some(row => missions.slice(0, 3).some(m => m.id === row.id)));
    const allDefinitions = missions.map(m => ({ period_kind: m.period, mission_id: m.id }));
    assert.equal(buildMissionSeedPlan(missions, allDefinitions, [], new Date()).insertions.length, 0);
});

test('catalogue validation rejects duplicates, changed schedules and invalid mission input before any database writes', () => {
    assert.equal(validateMissionPool(catalogue).length, 100);
    assert.throws(() => validateMissionPool({ missions: missions.slice(1) }));
    assert.throws(() => validateMissionPool({ missions: [...missions.slice(1), missions[1]] }));
    for (const change of [{ period: 'weekly' }, { target: 0 }, { tokens: '-1' }, { id: 'kills' }, { rewards: [{ catalogueKey: 'unpriced', quantity: 1 }] }])
        assert.throws(() => validateMissionPool({ missions: [{ ...missions[0], ...change }, ...missions.slice(1)] }));
});
