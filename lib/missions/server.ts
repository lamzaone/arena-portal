import 'server-only';
import { getAdminAccess } from '@/lib/admin/access';
import { getSession, verifyAdminActionToken, type PortalSession } from '@/lib/auth/session';
import { getPortalDatabasePool } from '@/lib/data/database-pools';
import { getEconomyCatalogue } from '@/lib/data/portal-repository';
import { createMissionManagementRepository } from '@/lib/data/mission-management';
import { ConfigurationError } from './definitions';
import { createConfigurationHandlers } from './admin-api';
export function missionManagementRepository() { const pool = getPortalDatabasePool(); if (!pool)
    throw new ConfigurationError('Configuration storage is not configured.', 503); return createMissionManagementRepository(pool); }
export const configurationHandlers = createConfigurationHandlers({ getSession, canManage: async (id) => (await getAdminAccess(id)).canManageEconomy, verify: (session, token) => verifyAdminActionToken(session as PortalSession, token), repository: missionManagementRepository, catalogue: query => getEconomyCatalogue({ query: query || undefined, pageSize: 100 }) });
