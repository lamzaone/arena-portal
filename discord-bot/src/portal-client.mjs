import { RuntimeError, isSnowflake, safePortalUrl, validateEvents, validateSnapshot } from './validation.mjs';

export class PortalError extends RuntimeError {}

export function createPortalClient(config, fetchImpl = fetch) {
  async function request(path, body) {
    try {
      const response = await fetchImpl(`${config.portalUrl}/api/discord/bot/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error', signal: AbortSignal.timeout(config.timeoutMs),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new PortalError(`Portal HTTP ${response.status}`);
      }
      if (!response.headers.get('content-type')?.includes('application/json')) {
        await response.body?.cancel();
        throw new PortalError('Portal returned a non-JSON response');
      }
      // Bound memory even when Content-Length is missing or inaccurate.
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > 16 * 1024 * 1024) throw new PortalError('Portal response exceeded size limit');
        chunks.push(chunk);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (error) {
      if (error instanceof PortalError) throw error;
      throw new PortalError('Portal request failed or timed out');
    }
  }
  return {
    snapshot: async () => validateSnapshot(await request('snapshot')),
    saveRole: (groupId, discordRoleId, previousRoleId = null) => request('roles', { groupId, discordRoleId, previousRoleId }),
    claimNotifications: async () => validateEvents(await request('notifications', { action: 'claim' })),
    finishNotification: payload => request('notifications', payload),
    createLinkCode: async discordUserId => {
      if (!isSnowflake(discordUserId)) throw new PortalError('Invalid Discord user ID');
      const data = await request('link-code', { discordUserId });
      if (!data || typeof data.code !== 'string' || !/^[A-Za-z0-9-]{6,64}$/.test(data.code) || typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt)) || !safePortalUrl(data.linkUrl, config.portalUrl)) throw new PortalError('Portal returned an invalid link code');
      return data;
    },
  };
}
