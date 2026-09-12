import { REST, Routes } from 'discord.js';
import { registerCommands } from './commands.mjs';
import { readConfig } from './config.mjs';
import { safeError } from './validation.mjs';

async function register() {
  const { token, guildId } = readConfig(process.env, { registrationOnly: true });
  const rest = new REST({ version: '10', timeout: 15_000, retries: 2 }).setToken(token);
  const application = await rest.get(Routes.oauth2CurrentApplication());
  await registerCommands({ rest, applicationId: application.id, guildId });
  console.info('[arena-discord] Registered ARENA slash commands in the configured guild');
}

register().catch(error => { console.error(`[arena-discord] Registration failed: ${safeError(error)}`); process.exitCode = 1; });
