import { Client, Events, GatewayIntentBits, ChannelType, PermissionFlagsBits } from 'discord.js';
import { readConfig } from './config.mjs';
import { createPortalClient } from './portal-client.mjs';
import { reconcileRoles } from './roles.mjs';
import { deliverNotifications, resolveAdminRoles } from './notifications.mjs';
import { handleLink } from './link.mjs';
import { runLoop } from './scheduler.mjs';
import { RuntimeError, safeError } from './validation.mjs';

const logError = (label, error) => console.error(`[arena-discord] ${label}: ${safeError(error)}`);

async function main() {
  const config = readConfig();
  const portal = createPortalClient(config);
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
    rest: { timeout: 15_000, retries: 2 }, failIfNotExists: false });
  const shutdown = new AbortController();
  let loopTasks = [];
  const stop = () => shutdown.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  client.on(Events.Error, error => logError('Discord client', error));
  client.on(Events.InteractionCreate, interaction => {
    void handleLink(interaction, { config, portal }).catch(error => logError('Link command', error));
  });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new RuntimeError('Discord login timed out')), 45_000);
      const finish = callback => value => { clearTimeout(timeout); shutdown.signal.removeEventListener('abort', aborted); callback(value); };
      const aborted = finish(() => reject(new RuntimeError('Discord startup stopped')));
      shutdown.signal.addEventListener('abort', aborted, { once: true });
      client.once(Events.ClientReady, finish(resolve));
      void client.login(config.token).catch(finish(reject));
    });
    const guild = await client.guilds.fetch(config.guildId);
    const me = await guild.members.fetchMe();
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) throw new RuntimeError('Bot requires Manage Roles in the configured guild');
    const channel = await guild.channels.fetch(config.staffChannelId);
    if (!channel || channel.guildId !== config.guildId || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) throw new RuntimeError('DISCORD_STAFF_CHANNEL_ID must identify a text channel in the configured guild');
    const channelPermissions = () => {
      const permissions = channel.permissionsFor(guild.members.me);
      if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) throw new RuntimeError('Bot requires View Channel, Send Messages and Embed Links in the staff channel');
      return permissions;
    };
    channelPermissions();
    // Verify the bridge contract before starting either background loop.
    await portal.snapshot();
    const sync = async () => {
      if (!client.isReady()) throw new RuntimeError('Discord is reconnecting');
      const { added, removed } = await reconcileRoles({ guild, portal });
      if (added || removed) console.info(`[arena-discord] Roles synchronized: ${added} added, ${removed} removed`);
    };
    const notify = async () => {
      if (!client.isReady()) throw new RuntimeError('Discord is reconnecting');
      const [snapshot, roles] = await Promise.all([portal.snapshot(), guild.roles.fetch()]);
      const adminRoleIds = resolveAdminRoles(snapshot, roles, config.adminRoleIds, channelPermissions().has(PermissionFlagsBits.MentionEveryone), guild.id);
      await deliverNotifications({ portal, channel, adminRoleIds, portalUrl: config.portalUrl });
    };
    console.info('[arena-discord] Connected; role synchronization and notification polling started');
    loopTasks = [
      runLoop(sync, { intervalMs: 60_000, signal: shutdown.signal, onError: error => logError('Role synchronization', error) }),
      runLoop(notify, { intervalMs: 5_000, signal: shutdown.signal, onError: error => logError('Notifications', error) }),
    ];
    await Promise.all(loopTasks);
  } finally {
    shutdown.abort();
    // Release the Gateway and REST sweepers after in-flight cycles settle.
    await client.destroy();
    await Promise.allSettled(loopTasks);
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

main().catch(error => { logError('Startup/runtime failure', error); process.exitCode = 1; });
