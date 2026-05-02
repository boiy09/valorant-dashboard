import { REST, Routes } from "discord.js";
import { readdirSync } from "fs";
import { join } from "path";
import type { BotClient } from "./index";

export async function loadCommands(client: BotClient) {
  const commandsPath = join(__dirname, "commands");
  const files = readdirSync(commandsPath).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
  const commandData = [];

  for (const file of files) {
    const command = await import(join(commandsPath, file));
    if (!command.data || !command.execute) continue;
    client.commands.set(command.data.name, command);
    commandData.push(command.data.toJSON());
  }

  const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN!);
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.DISCORD_CLIENT_ID!,
      process.env.DISCORD_GUILD_ID!
    ),
    { body: commandData }
  );
  console.log(`✅ ${commandData.length}개 슬래시 커맨드 등록 완료`);
}
