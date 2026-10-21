import 'server-only';
import { createHash } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { isCs2CatalogueFinishAvailable } from '../economy/cs2-finish-catalogue.ts';
import { ConfigurationError, configurationVersion, defaultEffects, nextPeriodStart, periodStart, validateEffects, validateMission, type EffectsSettings, type ManagedMission, type MissionDefinition, type MissionPeriod } from '../missions/definitions.ts';
type Row = RowDataPacket & Record<string, unknown>;
type Mutation = {
    actorSteamId: string;
    idempotencyKey: string;
    expectedVersion: string;
};
function decode(value: unknown): unknown { return typeof value === 'string' ? JSON.parse(value) : Buffer.isBuffer(value) ? JSON.parse(value.toString('utf8')) : value; }
function date(value: unknown): string { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10); }
function increment(version: string) { if (BigInt(version) >= 18446744073709551615n)
    throw new ConfigurationError('Settings version exhausted.', 409); return (BigInt(version) + 1n).toString(); }
function conflict() { throw new ConfigurationError('Settings changed since you opened them. Reload before saving.', 409); }
function definition(row: Row): MissionDefinition { return validateMission({ ...decode(row.definition) as object, period: row.period_kind, enabled: Boolean(Number(row.enabled)) }); }
async function audit(connection: PoolConnection, actor: string, action: string, target: string, metadata: unknown) { await connection.execute("INSERT INTO portal_audit_events(actor_type,actor_id,action,target_type,target_id,metadata) VALUES('steam',?,?,'hud-configuration',?,?)", [actor, action, target, JSON.stringify(metadata)]); }
export function createMissionManagementRepository(pool: Pick<Pool, 'query' | 'getConnection'>, clock = () => new Date()) {
    async function mutate<T>(input: Mutation, payload: unknown, work: (connection: PoolConnection) => Promise<T>): Promise<T> {
        if (!/^7656119\d{10}$/.test(input.actorSteamId) || !/^[A-Za-z0-9_-]{16,128}$/.test(input.idempotencyKey))
            throw new ConfigurationError('Invalid actor or action key.');
        configurationVersion(input.expectedVersion);
        const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.execute('INSERT IGNORE INTO portal_staff_config_operations(actor_steam_id,idempotency_key,request_hash) VALUES(?,?,?)', [input.actorSteamId, input.idempotencyKey, hash]);
            const [operations] = await connection.query<Row[]>('SELECT request_hash,result_json FROM portal_staff_config_operations WHERE actor_steam_id=? AND idempotency_key=? FOR UPDATE', [input.actorSteamId, input.idempotencyKey]);
            const op = operations[0];
            if (!op || op.request_hash !== hash)
                throw new ConfigurationError('This action key was reused with different settings.', 409);
            if (op.result_json) {
                const result = decode(op.result_json) as T;
                await connection.commit();
                return result;
            }
            const result = await work(connection);
            await connection.execute('UPDATE portal_staff_config_operations SET result_json=? WHERE actor_steam_id=? AND idempotency_key=?', [JSON.stringify(result), input.actorSteamId, input.idempotencyKey]);
            await connection.commit();
            return result;
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    async function lockMission(connection: PoolConnection, period: MissionPeriod, id: string, expectedVersion: string, create = false) {
        if (create)
            await connection.execute('INSERT IGNORE INTO portal_mission_definitions(period_kind,mission_id,created_at,updated_at) VALUES(?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))', [period, id]);
        const [parents] = await connection.query<Row[]>('SELECT disabled_immediately FROM portal_mission_definitions WHERE period_kind=? AND mission_id=? FOR UPDATE', [period, id]);
        if (!parents[0])
            throw new ConfigurationError('Mission no longer exists.', 409);
        const [versions] = await connection.query<Row[]>('SELECT version FROM portal_mission_definition_versions WHERE period_kind=? AND mission_id=? ORDER BY version DESC LIMIT 1', [period, id]);
        const version = String(versions[0]?.version ?? '0');
        if (version !== expectedVersion)
            conflict();
        return { version, disabled: Boolean(Number(parents[0].disabled_immediately)) };
    }
    return {
        async list(): Promise<ManagedMission[]> {
            const [rows] = await pool.query<Row[]>('SELECT v.*,d.disabled_immediately,d.disabled_until_period_start FROM portal_mission_definition_versions v INNER JOIN portal_mission_definitions d ON d.period_kind=v.period_kind AND d.mission_id=v.mission_id ORDER BY v.period_kind,v.mission_id,v.effective_period_start DESC,v.version DESC');
            const groups = new Map<string, ManagedMission>();
            for (const row of rows) {
                const key = `${row.period_kind}/${row.mission_id}`;
                const period = row.period_kind as MissionPeriod;
                const existing = groups.get(key);
                if (!existing)
                    groups.set(key, { period, id: String(row.mission_id), version: String(row.version), effectivePeriodStart: date(row.effective_period_start), disabledImmediately: Boolean(Number(row.disabled_immediately)), disabledUntilPeriodStart: row.disabled_until_period_start ? date(row.disabled_until_period_start) : null, definition: definition(row), currentDefinition: null });
                const item = groups.get(key)!;
                if (!item.currentDefinition && date(row.effective_period_start) <= periodStart(period, clock()))
                    item.currentDefinition = definition(row);
            }
            return [...groups.values()];
        },
        async publish(input: Mutation & {
            definition: unknown;
        }) {
            const draft = validateMission(input.definition);
            return mutate(input, { action: 'mission.publish', expectedVersion: input.expectedVersion, definition: draft }, async (connection) => {
                const locked = await lockMission(connection, draft.period, draft.id, input.expectedVersion, true);
                // Catalogue availability is checked again by the claim transaction. Do not
                // publish missing/disabled products or unsupported membership quantities.
                for (const reward of draft.rewards) {
                    const [items] = await connection.query<Row[]>('SELECT id,enabled,item_type,rarity_rank,metadata,definition_index,paintkit FROM portal_economy_catalogue WHERE catalogue_key=? FOR UPDATE', [reward.catalogueKey]);
                    if (!items[0] || !Number(items[0].enabled))
                        throw new ConfigurationError('A reward item is unavailable. Choose an enabled catalogue product.', 409);
                    const item = items[0], type = String(item.item_type);
                    if (!['skin', 'knife', 'glove', 'crate', 'capsule', 'nametag', 'sticker', 'agent', 'music_kit', 'keychain', 'patch', 'graffiti', 'vip_membership', 'profile_theme'].includes(type))
                        throw new ConfigurationError('This reward product is not supported.');
                    if (['vip_membership', 'profile_theme'].includes(type) && (Number(item.rarity_rank) !== 8 || (decode(item.metadata) as Record<string, unknown>)?.customProduct !== true))
                        throw new ConfigurationError('This custom reward product is not supported.');
                    if (['skin', 'knife', 'glove'].includes(type)) {
                        const [prices] = await connection.query<Row[]>('SELECT price_source,source_reference,market_price_eur_cents FROM portal_economy_catalogue_prices WHERE catalogue_id=? AND is_current=1 LIMIT 1', [item.id]);
                        const price = prices[0];
                        if (!isCs2CatalogueFinishAvailable({ itemType: type, definitionIndex: item.definition_index === null ? null : Number(item.definition_index), paintkit: item.paintkit === null ? null : Number(item.paintkit), price: price ? { source: String(price.price_source), sourceReference: price.source_reference === null ? null : String(price.source_reference), euroCents: Number(price.market_price_eur_cents) } : null }))
                            throw new ConfigurationError('This item finish is not supported.');
                    }
                    if (['crate', 'capsule'].includes(type)) {
                        const [loot] = await connection.query<Row[]>('SELECT t.id FROM portal_loot_tables t INNER JOIN portal_loot_entries e ON e.loot_table_id=t.id INNER JOIN portal_economy_catalogue c ON c.id=e.catalogue_id WHERE t.container_catalogue_id=? AND t.enabled=1 AND e.enabled=1 AND e.weight>0 AND c.enabled=1 LIMIT 1 FOR UPDATE', [item.id]);
                        if (!loot[0])
                            throw new ConfigurationError('This container has no available loot table.', 409);
                    }
                }
                const version = increment(locked.version), effectivePeriodStart = nextPeriodStart(draft.period, clock());
                const { period, enabled, ...snapshot } = draft;
                await connection.execute('INSERT INTO portal_mission_definition_versions(period_kind,mission_id,version,effective_period_start,enabled,definition,created_at,actor_steam_id) VALUES(?,?,?,?,?,?,UTC_TIMESTAMP(6),?)', [period, draft.id, version, effectivePeriodStart, Number(enabled), JSON.stringify(snapshot), input.actorSteamId]);
                if (locked.disabled && enabled)
                    await connection.execute('UPDATE portal_mission_definitions SET disabled_until_period_start=?,updated_at=UTC_TIMESTAMP(6) WHERE period_kind=? AND mission_id=?', [effectivePeriodStart, period, draft.id]);
                await audit(connection, input.actorSteamId, 'mission.published', `${period}/${draft.id}`, { version, effectivePeriodStart, definition: draft });
                return { version, effectivePeriodStart };
            });
        },
        async disable(input: Mutation & {
            period: MissionPeriod;
            id: string;
        }) {
            if (!['daily', 'weekly', 'monthly'].includes(input.period) || !/^[A-Za-z0-9_-]{1,64}$/.test(input.id))
                throw new ConfigurationError('Choose a valid mission.');
            return mutate(input, { action: 'mission.disable', period: input.period, id: input.id, expectedVersion: input.expectedVersion }, async (connection) => {
                const locked = await lockMission(connection, input.period, input.id, input.expectedVersion);
                const version = increment(locked.version);
                // Suppression is a configuration change too. Clone the latest immutable
                // definition without changing its publication boundary so every stale
                // editor conflicts, including editors opened before an immediate disable.
                await connection.execute('INSERT INTO portal_mission_definition_versions(period_kind,mission_id,version,effective_period_start,enabled,definition,created_at,actor_steam_id) SELECT period_kind,mission_id,?,effective_period_start,enabled,definition,UTC_TIMESTAMP(6),? FROM portal_mission_definition_versions WHERE period_kind=? AND mission_id=? AND version=?', [version, input.actorSteamId, input.period, input.id, locked.version]);
                await connection.execute('UPDATE portal_mission_definitions SET disabled_immediately=1,disabled_until_period_start=NULL,updated_at=UTC_TIMESTAMP(6) WHERE period_kind=? AND mission_id=?', [input.period, input.id]);
                await audit(connection, input.actorSteamId, 'mission.disabled-immediately', `${input.period}/${input.id}`, { version });
                return { version, disabledImmediately: true };
            });
        },
        async effects(): Promise<EffectsSettings> { const [rows] = await pool.query<Row[]>('SELECT version,config_json FROM portal_hud_effect_settings WHERE id=1'); return rows[0] ? { version: String(rows[0].version), config: validateEffects(decode(rows[0].config_json)) } : { version: '0', config: defaultEffects }; },
        async saveEffects(input: Mutation & {
            config: unknown;
        }) {
            const config = validateEffects(input.config);
            return mutate(input, { action: 'effects.save', expectedVersion: input.expectedVersion, config }, async (connection) => {
                const [rows] = await connection.query<Row[]>('SELECT version,config_json FROM portal_hud_effect_settings WHERE id=1 FOR UPDATE');
                if (!rows[0])
                    throw new ConfigurationError('Effects storage is unavailable. Apply migration 047.', 503);
                const version = String(rows[0].version);
                if (version !== input.expectedVersion)
                    conflict();
                if (JSON.stringify(validateEffects(decode(rows[0].config_json))) === JSON.stringify(config))
                    return { version, config };
                const next = increment(version);
                await connection.execute('UPDATE portal_hud_effect_settings SET version=?,config_json=?,updated_by=?,updated_at=UTC_TIMESTAMP(6) WHERE id=1', [next, JSON.stringify(config), input.actorSteamId]);
                await audit(connection, input.actorSteamId, 'hud.effects.updated', '1', { version: next, config });
                return { version: next, config };
            });
        },
    };
}
