import { GuildMember, MessageFlags, type ChatInputCommandInteraction } from "discord.js";

const PRIVILEGED_ROLE_KEYWORDS = ["관리자", "발로네끼", "admin", "administrator"];

function normalizeRole(role: string) {
  return role.trim().toLowerCase().replace(/\s+/g, "");
}

export function isPrivilegedMember(member: unknown) {
  if (!(member instanceof GuildMember)) return false;
  const roles = member.roles.cache.map((role) => normalizeRole(role.name));
  return roles.some((role) =>
    PRIVILEGED_ROLE_KEYWORDS.some((keyword) => role.includes(normalizeRole(keyword)))
  );
}

export async function requirePrivilegedMember(interaction: ChatInputCommandInteraction) {
  if (isPrivilegedMember(interaction.member)) return true;

  const content = "관리자 또는 발로네끼 역할이 있는 사람만 사용할 수 있습니다.";
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(content).catch(() => {});
  } else {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
  return false;
}
