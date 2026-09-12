import { RuntimeError, isSnowflake } from './validation.mjs';

/** Read only this bot's explicitly named environment settings. Never log their values. */
export function readConfig(env = process.env, { registrationOnly = false } = {}) {
  const required = name => {
    const value = env[name]?.trim();
    if (!value) throw new RuntimeError(`Missing ${name}`);
    return value;
  };
  const snowflake = name => {
    const value = required(name);
    if (!isSnowflake(value)) throw new RuntimeError(`Invalid ${name}`);
    return value;
  };
  const token = required('DISCORD_BOT_TOKEN');
  const guildId = snowflake('DISCORD_GUILD_ID');
  if (registrationOnly) return { token, guildId };
  const secret = required('DISCORD_BRIDGE_SECRET');
  if (secret.length < 32 || /[\r\n]/.test(secret)) throw new RuntimeError('DISCORD_BRIDGE_SECRET must contain at least 32 characters');
  let url;
  try { url = new URL(required('PORTAL_URL')); } catch { throw new RuntimeError('Invalid PORTAL_URL'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new RuntimeError('PORTAL_URL must be an HTTPS origin (HTTP allowed for localhost only)');
  }
  return { token, guildId, secret, portalUrl: url.origin, staffChannelId: snowflake('DISCORD_STAFF_CHANNEL_ID'), timeoutMs: 10_000 };
}
