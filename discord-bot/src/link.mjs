import { MessageFlags } from 'discord.js';
import { safePortalUrl } from './validation.mjs';

export async function handleLink(interaction, { config, portal }) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'link') return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (interaction.guildId !== config.guildId) {
    await interaction.editReply({ content: 'Use /link in the ARENA Discord server.', allowedMentions: { parse: [] } });
    return;
  }
  try {
    const { code, expiresAt, linkUrl } = await portal.createLinkCode(interaction.user.id);
    const url = safePortalUrl(linkUrl, config.portalUrl) ?? `${config.portalUrl}/discord-link`;
    await interaction.editReply({ content: `Your private, one-use link code: **\`${code}\`**\n\nSign in with Steam at <${url}> and enter the code, or type \`/discordlink ${code}\` in game.\nExpires <t:${Math.floor(Date.parse(expiresAt) / 1000)}:R>. Keep this code private; it links your Steam account to this Discord account.`, allowedMentions: { parse: [] } });
  } catch {
    await interaction.editReply({ content: 'The portal could not create a link code. Please try /link again shortly.', allowedMentions: { parse: [] } });
  }
}
