import { ConfigurationError, configurationVersion, validateEffects, validateMission, type MissionPeriod } from './definitions.ts';
import type { createMissionManagementRepository } from '../data/mission-management.ts';
type Session = {
    steamId: string;
};
type Dependencies = {
    getSession: () => Promise<Session | null>;
    canManage: (steamId: string) => Promise<boolean>;
    verify: (session: Session, token: string) => boolean;
    repository: () => ReturnType<typeof createMissionManagementRepository>;
    catalogue?: (query: string) => Promise<unknown>;
};
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
export function createConfigurationHandlers(deps: Dependencies) {
    async function authorize() { const session = await deps.getSession(); if (!session)
        throw new ConfigurationError('Sign in with a staff account.', 401); if (!await deps.canManage(session.steamId))
        throw new ConfigurationError('Economy management permission is required.', 403); return session; }
    async function run(work: () => Promise<Response>) { try {
        return await work();
    }
    catch (error) {
        return error instanceof ConfigurationError ? json({ ok: false, message: error.message }, error.status) : json({ ok: false, message: 'Configuration storage is unavailable. Please retry shortly.' }, 503);
    } }
    async function body(request: Request, session: Session): Promise<Record<string, unknown> & {
        actorSteamId: string;
        idempotencyKey: string;
        expectedVersion: string;
    }> {
        let value: unknown;
        try {
            const text = await request.text();
            if (text.length > 32768)
                throw new Error();
            value = JSON.parse(text);
        }
        catch {
            throw new ConfigurationError('Send a valid settings request (maximum 32 KB).');
        }
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new ConfigurationError('Send a settings object.');
        const v = value as Record<string, unknown>;
        if (!deps.verify(session, typeof v.csrf === 'string' ? v.csrf : ''))
            throw new ConfigurationError('Staff verification expired. Reload and try again.', 403);
        if (typeof v.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(v.idempotencyKey))
            throw new ConfigurationError('A valid action key is required.');
        return { ...v, actorSteamId: session.steamId, idempotencyKey: v.idempotencyKey, expectedVersion: configurationVersion(v.expectedVersion) };
    }
    return {
        getMissions: (request: Request) => run(async () => { await authorize(); const url = new URL(request.url); if (url.searchParams.has('q') && deps.catalogue)
            return json({ ok: true, catalogue: await deps.catalogue((url.searchParams.get('q') ?? '').trim().slice(0, 100)) }); return json({ ok: true, missions: await deps.repository().list() }); }),
        postMissions: (request: Request) => run(async () => { const session = await authorize(), input = await body(request, session); const repository = deps.repository(); if (input.action === 'publish')
            return json({ ok: true, result: await repository.publish({ ...input, definition: validateMission(input.definition) }) }); if (input.action === 'disable-immediately')
            return json({ ok: true, result: await repository.disable({ ...input, period: input.period as MissionPeriod, id: String(input.id ?? '') }) }); throw new ConfigurationError('Choose a supported mission action.'); }),
        getEffects: () => run(async () => { await authorize(); return json({ ok: true, result: await deps.repository().effects() }); }),
        postEffects: (request: Request) => run(async () => { const session = await authorize(), input = await body(request, session); return json({ ok: true, result: await deps.repository().saveEffects({ ...input, config: validateEffects(input.config) }) }); }),
    };
}
