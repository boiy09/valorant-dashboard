import { config } from "dotenv";
config();
config({ path: ".env.local", override: false });
import { Client, GatewayIntentBits, Collection } from "discord.js";
import { loadCommands } from "./loader";
import { registerEvents } from "./events/index";
import { registerVoiceEvents } from "./events/voiceActivity";

export interface BotClient extends Client {
  commands: Collection<string, any>;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
  ],
}) as BotClient;

client.commands = new Collection();

async function main() {
  await loadCommands(client);
  registerEvents(client);
  registerVoiceEvents(client);
  await client.login(process.env.DISCORD_BOT_TOKEN);
  const { startNotifier } = await import("./notifier");
  startNotifier(client);
}

main().catch(console.error);
