import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { readConfig } from './config.mjs';
import { safeError } from './validation.mjs';

async function register() {
  const { token, guildId } = readConfig(process.env, { registrationOnly: true });
  const rest = new REST({ version: '10', timeout: 15_000, retries: 2 }).setToken(token);
  const application = await rest.get(Routes.oauth2CurrentApplication());
  const command = new SlashCommandBuilder().setName('link').setDescription('Privately link your ARENA / Steam account to Discord');
  // POST upserts this command by name, preserving other application commands.
  await rest.post(Routes.applicationGuildCommands(application.id, guildId), { body: command.toJSON() });
  console.info('[arena-discord] Registered /link in the configured guild');
}

register().catch(error => { console.error(`[arena-discord] Registration failed: ${safeError(error)}`); process.exitCode = 1; });
