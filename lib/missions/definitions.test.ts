import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMission, nextPeriodStart, validateEffects } from './definitions.ts';
const mission = { period: 'daily', id: 'precision', title: 'Precision', metric: 'headshots', target: 10, tokens: '18446744073709551615', enabled: true, rewards: [{ catalogueKey: 'case:1', quantity: 2 }] };
test('mission contract preserves UInt64 rewards and independent item quantities', () => {
    assert.deepEqual(validateMission(mission), mission);
    assert.throws(() => validateMission({ ...mission, tokens: 18446744073709551615 }));
    assert.throws(() => validateMission({ ...mission, rewards: [{ catalogueKey: 'x', quantity: 101 }] }));
    assert.throws(() => validateMission({ ...mission, rewards: [{ catalogueKey: 'x', quantity: 1 }, { catalogueKey: 'x', quantity: 2 }] }));
});
test('objective and weapon allowlists reject arbitrary conditions', () => {
    assert.equal(validateMission({ ...mission, metric: 'weapon_kills', weapon: 'ak47' }).weapon, 'ak47');
    for (const change of [{ metric: 'eval' }, { metric: 'weapon_kills', weapon: 'weapon_ak47' }, { metric: 'weapon_kills', weapon: '../ak47' }, { target: 0 }, { period: 'rolling' }, { metric: 'completions' }])
        assert.throws(() => validateMission({ ...mission, ...change }));
});
test('publication uses UTC calendar boundaries including Monday, leap year and year rollover', () => {
    assert.equal(nextPeriodStart('daily', new Date('2028-02-28T23:59:59Z')), '2028-02-29');
    assert.equal(nextPeriodStart('weekly', new Date('2026-10-25T23:59:59Z')), '2026-10-26');
    assert.equal(nextPeriodStart('weekly', new Date('2026-10-26T00:00:00Z')), '2026-11-02');
    assert.equal(nextPeriodStart('monthly', new Date('2026-12-31T23:59:59Z')), '2027-01-01');
});
test('effects only accept bounded supported parameters, never executable input', () => {
    const settings = { styleId: 'pulse', palette: 'original', speed: 1, intensity: .5, reducedMotion: 'respect' };
    assert.deepEqual(validateEffects(settings), settings);
    for (const change of [{ styleId: '<script>' }, { palette: 'url(x)' }, { speed: 2.01 }, { speed: NaN }, { intensity: -.1 }, { reducedMotion: false }, { css: 'color:red' }, { assetPath: '../x' }])
        assert.throws(() => validateEffects({ ...settings, ...change }));
});
