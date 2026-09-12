import { MessageFlags, PermissionFlagsBits, Routes, SlashCommandBuilder, escapeMarkdown } from 'discord.js';
import { handleLink } from './link.mjs';
import { RuntimeError, validateSnapshot } from './validation.mjs';

export const commandDefinitions = [
  ['help', 'Show ARENA account and role commands'],
  ['link', 'Privately link your ARENA / Steam account to Discord'],
  ['account', 'Check your linked Steam account and effective portal groups'],
  ['sync', 'Refresh your Discord roles from your portal account'],
  ['sync-all', 'Admins: refresh portal roles for everyone in this server'],
].map(([name, description]) => new SlashCommandBuilder().setName(name).setDescription(description).toJSON());

export async function registerCommands({ rest, applicationId, guildId }) {
  // Upsert only our names, preserving other commands installed for this application.
  for (const body of commandDefinitions) await rest.post(Routes.applicationGuildCommands(applicationId, guildId), { body });
}

/** Guild-scoped, private replies; authorization always uses current authority. */
export function createCommandHandler({ config, portal, sync, now = Date.now }) {
  const cooldowns = new Map();
  let allSyncAfter = 0;
  return async interaction => {
    if (!interaction.isChatInputCommand() || !commandDefinitions.some(command => command.name === interaction.commandName)) return;
    const reply = content => interaction.editReply({ content, allowedMentions: { parse: [] } });
    if (interaction.commandName === 'link') return handleLink(interaction, { config, portal });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (interaction.guildId !== config.guildId) return reply('Use these commands in the ARENA Discord server.');
    if (interaction.commandName === 'help') return reply(
      '**ARENA commands**\n/link — Get a private Steam/portal link code.\n/account — View your linked account and effective groups.\n/sync — Refresh your own portal roles.\n/sync-all — Refresh everyone (current portal admins or Discord Administrators only).\n\nLink on the website or with `/discordlink CODE` in game. Roles also refresh automatically.',
    );
    const timestamp = now();
    for (const [key, until] of cooldowns) if (until <= timestamp) cooldowns.delete(key);
    const key = `${interaction.user.id}:${interaction.commandName}`;
    if (cooldowns.has(key)) return reply('Please wait 15 seconds between requests for this command.');
    cooldowns.set(key, timestamp + 15_000);
    try {
      if (interaction.commandName === 'account') {
        const data = validateSnapshot(await portal.snapshot());
        const member = data.members.find(value => value.discordUserId === interaction.user.id);
        if (!member) return reply('Your account is not linked. Use /link to connect your Steam account.');
        const groups = data.groups.filter(group => group.enabled && member.groupIds.includes(group.id));
        const names = groups.map(group => escapeMarkdown(group.name.replace(/[\r\n\t]/g, ' '))).join(', ');
        const identity = member.steamId ? `Steam: <https://steamcommunity.com/profiles/${member.steamId}>\n` : '';
        return reply(`**Your ARENA account is linked.**\n${identity}Effective groups: ${names ? names.slice(0, 1400) : 'None'}\nManage your link: <${config.portalUrl}/discord-link>`);
      }
      if (interaction.commandName === 'sync-all') {
        let authorized = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) === true;
        if (!authorized) {
          const data = validateSnapshot(await portal.snapshot());
          const member = data.members.find(value => value.discordUserId === interaction.user.id);
          authorized = data.groups.some(group => group.enabled && group.isAdmin && member?.groupIds.includes(group.id));
        }
        if (!authorized) return reply('Only current portal admins or Discord Administrators can use /sync-all.');
        if (allSyncAfter > timestamp) return reply('Please wait 30 seconds between server-wide role syncs.');
        allSyncAfter = timestamp + 30_000;
        const result = await sync();
        return reply(`Server roles synchronized: ${result.added} added, ${result.removed} removed.`);
      }
      const result = await sync(interaction.user.id);
      return reply(result.linked
        ? `Your roles are synchronized: ${result.added} added, ${result.removed} removed.`
        : 'Your account is not linked. Stale managed roles were cleared; use /link to connect your Steam account.');
    } catch (error) {
      return reply(error instanceof RuntimeError && error.message === 'A role sync is already running. Please try again shortly.'
        ? error.message
        : 'Account or role synchronization is unavailable. Check the portal connection and bot role permissions, then try again shortly.');
    }
  };
}
