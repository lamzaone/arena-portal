import { Client, Events, GatewayIntentBits, ChannelType, PermissionFlagsBits } from 'discord.js';
import { readConfig } from './config.mjs';
import { createPortalClient } from './portal-client.mjs';
import { reconcileRoles } from './roles.mjs';
import { deliverNotifications, resolveAdminRoles } from './notifications.mjs';
import { createCommandHandler, registerCommands } from './commands.mjs';
import { createRoleSync, runLoop } from './scheduler.mjs';
import { RuntimeError, safeError } from './validation.mjs';
import { startHealthReporter } from './health.mjs';

const logError = (label, error) => console.error(`[arena-discord] ${label}: ${safeError(error)}`);

async function main() {
  const config = readConfig();
  const portal = createPortalClient(config);
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
    rest: { timeout: 15_000, retries: 2 }, failIfNotExists: false });
  const shutdown = new AbortController();
  let loopTasks = [];
  let stopHealth = () => {};
  let handleCommand;
  const commandTasks = new Set();
  const stop = () => shutdown.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  client.on(Events.Error, error => logError('Discord client', error));
  client.on(Events.InteractionCreate, interaction => {
    if (!handleCommand || shutdown.signal.aborted) return;
    const task = handleCommand(interaction).catch(error => logError('Slash command', error));
    commandTasks.add(task);
    void task.finally(() => commandTasks.delete(task));
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
    const sync = createRoleSync(async userId => {
      if (!client.isReady()) throw new RuntimeError('Discord is reconnecting');
      const result = await reconcileRoles({ guild, portal, userId, signal: shutdown.signal });
      if (result.added || result.removed) console.info(`[arena-discord] Roles synchronized: ${result.added} added, ${result.removed} removed`);
      return result;
    });
    handleCommand = createCommandHandler({ config, portal, sync });
    await registerCommands({ rest: client.rest, applicationId: client.application.id, guildId: config.guildId });
    console.info('[arena-discord] Registered /help, /link, /account, /sync and /sync-all');
    // Verify the bridge contract before starting either background loop.
    await portal.snapshot();
    stopHealth = startHealthReporter({ directory: process.env.ARENA_BOT_HEALTH_DIR, ready: () => client.isReady() && !shutdown.signal.aborted });
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
    stopHealth();
    // Manual syncs and link requests must finish their in-flight writes too.
    await Promise.allSettled([...loopTasks, ...commandTasks]);
    await client.destroy();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

main().catch(error => { logError('Startup/runtime failure', error); process.exitCode = 1; });
