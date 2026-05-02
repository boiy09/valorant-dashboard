import { Events, PermissionFlagsBits } from "discord.js";
import type { BotClient } from "../index";
import { prisma } from "../../lib/prisma";

function buildRolesString(member: import("discord.js").GuildMember): string {
  const names = member.roles.cache
    .filter(r => r.name !== "@everyone")
    .map(r => r.name);

  const perms = member.permissions;
  const isAdmin =
    perms.has(PermissionFlagsBits.Administrator) ||
    perms.has(PermissionFlagsBits.ManageGuild);
  const isAssist =
    !isAdmin && (
      perms.has(PermissionFlagsBits.ManageMessages) ||
      perms.has(PermissionFlagsBits.KickMembers) ||
      perms.has(PermissionFlagsBits.BanMembers) ||
      perms.has(PermissionFlagsBits.ManageRoles) ||
      perms.has(PermissionFlagsBits.MuteMembers)
    );

  if (isAdmin)  names.push("__관리자__");
  if (isAssist) names.push("__어시스트__");

  return names.join(",");
}

export function registerEvents(client: BotClient) {
  client.once(Events.ClientReady, async (c) => {
    console.log(`✅ 봇 온라인: ${c.user.tag}`);
    // 봇 시작 시 모든 서버 멤버 동기화
    for (const [, guild] of c.guilds.cache) {
      try {
        const dbGuild = await prisma.guild.upsert({
          where: { discordId: guild.id },
          update: { name: guild.name },
          create: { discordId: guild.id, name: guild.name },
        });
        const members = await guild.members.fetch();
        for (const [, member] of members) {
          if (member.user.bot) continue;
          const email = `${member.user.id}@discord`;
          const user = await prisma.user.upsert({
            where: { discordId: member.user.id },
            update: { name: member.user.displayName, image: member.user.displayAvatarURL() },
            create: { discordId: member.user.id, email, name: member.user.displayName, image: member.user.displayAvatarURL() },
          });
          const roles = buildRolesString(member);
          await prisma.guildMember.upsert({
            where: { userId_guildId: { userId: user.id, guildId: dbGuild.id } },
            update: { roles, nickname: member.nickname ?? undefined },
            create: { userId: user.id, guildId: dbGuild.id, roles, nickname: member.nickname ?? undefined },
          });
        }
        // 전체 오프라인으로 초기화 후 실제 온라인 멤버만 업데이트
        await prisma.guildMember.updateMany({ where: { guildId: dbGuild.id }, data: { isOnline: false } });
        for (const [, presence] of guild.presences.cache) {
          if (!presence.userId) continue;
          const isOnline = presence.status !== "offline" && presence.status !== "invisible";
          if (!isOnline) continue;
          const pu = await prisma.user.findUnique({ where: { discordId: presence.userId } });
          if (!pu) continue;
          await prisma.guildMember.updateMany({
            where: { userId: pu.id, guildId: dbGuild.id },
            data: { isOnline: true },
          });
        }
        console.log(`✅ 멤버 동기화 완료: ${guild.name} (${members.size}명)`);
      } catch (e) {
        console.error(`멤버 동기화 오류 [${guild.name}]:`, e);
      }
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    // 슬래시 커맨드
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`커맨드 오류 [${interaction.commandName}]:`, error);
        const msg = { content: "❌ 명령어 실행 중 오류가 발생했어요.", ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg);
        } else {
          await interaction.reply(msg);
        }
      }
      return;
    }

    // 버튼 인터랙션 (투표)
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (!id.startsWith("vote_")) return;

      // vote_{voteId}_{optionId}
      const parts = id.split("_");
      if (parts.length < 3) return;
      const voteId = parts[1];
      const optionId = parts[2];

      try {
        const guildDiscordId = interaction.guildId!;
        const guild = await prisma.guild.findUnique({ where: { discordId: guildDiscordId } });
        if (!guild) return;

        const email = `${interaction.user.id}@discord`;
        const user = await prisma.user.upsert({
          where: { discordId: interaction.user.id },
          update: {},
          create: { discordId: interaction.user.id, email, name: interaction.user.displayName },
        });

        const vote = await prisma.vote.findUnique({ where: { id: voteId }, include: { options: { include: { responses: true } } } });
        if (!vote) return interaction.reply({ content: "❌ 투표를 찾을 수 없어요.", ephemeral: true });
        if (vote.endsAt < new Date()) return interaction.reply({ content: "❌ 이미 종료된 투표예요.", ephemeral: true });

        // upsert (변경 허용)
        const existing = await prisma.voteResponse.findUnique({ where: { voteId_userId: { voteId, userId: user.id } } });
        if (existing) {
          await prisma.voteResponse.update({ where: { id: existing.id }, data: { optionId } });
        } else {
          await prisma.voteResponse.create({ data: { voteId, optionId, userId: user.id } });
        }

        // 결과 임베드 갱신
        const updatedVote = await prisma.vote.findUnique({
          where: { id: voteId },
          include: { options: { include: { responses: true } }, responses: true },
        });
        const total = updatedVote!.responses.length;
        const { EmbedBuilder } = await import("discord.js");
        const embed = new EmbedBuilder()
          .setColor(0xff4655)
          .setTitle(`🗳️ ${updatedVote!.title}`)
          .setDescription(
            updatedVote!.options.map((opt) => {
              const count = opt.responses.length;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
              return `**${opt.label}**\n${bar} ${pct}% (${count}표)`;
            }).join("\n\n")
          )
          .setFooter({ text: `총 ${total}명 참여 | 종료: ${updatedVote!.endsAt.toLocaleString("ko-KR")}` });

        await interaction.update({ embeds: [embed] });
      } catch (e) {
        console.error("투표 오류:", e);
        if (!interaction.replied) {
          await interaction.reply({ content: "❌ 오류가 발생했어요.", ephemeral: true });
        }
      }
    }
  });

  client.on(Events.GuildCreate, async (guild) => {
    console.log(`새 서버 참가: ${guild.name} (${guild.id})`);
    const dbGuild = await prisma.guild.upsert({
      where: { discordId: guild.id },
      update: { name: guild.name },
      create: { discordId: guild.id, name: guild.name },
    });
    // 기존 멤버 전체 동기화
    try {
      const members = await guild.members.fetch();
      for (const [, member] of members) {
        if (member.user.bot) continue;
        const email = `${member.user.id}@discord`;
        const user = await prisma.user.upsert({
          where: { discordId: member.user.id },
          update: { name: member.user.displayName, image: member.user.displayAvatarURL() },
          create: { discordId: member.user.id, email, name: member.user.displayName, image: member.user.displayAvatarURL() },
        });
        const roles = buildRolesString(member);
        await prisma.guildMember.upsert({
          where: { userId_guildId: { userId: user.id, guildId: dbGuild.id } },
          update: { roles, nickname: member.nickname ?? undefined },
          create: { userId: user.id, guildId: dbGuild.id, roles, nickname: member.nickname ?? undefined },
        });
      }
    } catch (e) {
      console.error("멤버 동기화 오류:", e);
    }
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;
    const guild = await prisma.guild.findUnique({ where: { discordId: member.guild.id } });
    if (!guild) return;
    const email = `${member.user.id}@discord`;
    const user = await prisma.user.upsert({
      where: { discordId: member.user.id },
      update: { name: member.user.displayName, image: member.user.displayAvatarURL() },
      create: { discordId: member.user.id, email, name: member.user.displayName, image: member.user.displayAvatarURL() },
    });
    await prisma.guildMember.upsert({
      where: { userId_guildId: { userId: user.id, guildId: guild.id } },
      update: {},
      create: { userId: user.id, guildId: guild.id },
    });
  });

  client.on(Events.PresenceUpdate, async (_, newPresence) => {
    if (!newPresence.userId || !newPresence.guild) return;
    try {
      const guild = await prisma.guild.findUnique({ where: { discordId: newPresence.guild.id } });
      if (!guild) return;
      const user = await prisma.user.findUnique({ where: { discordId: newPresence.userId } });
      if (!user) return;
      const isOnline = newPresence.status !== "offline" && newPresence.status !== "invisible";
      await prisma.guildMember.updateMany({
        where: { userId: user.id, guildId: guild.id },
        data: { isOnline },
      });
    } catch {}
  });

  client.on(Events.GuildMemberUpdate, async (_, member) => {
    if (member.user.bot) return;
    const guild = await prisma.guild.findUnique({ where: { discordId: member.guild.id } });
    if (!guild) return;
    const user = await prisma.user.findUnique({ where: { discordId: member.user.id } });
    if (!user) return;
    const roles = buildRolesString(member);
    await prisma.guildMember.upsert({
      where: { userId_guildId: { userId: user.id, guildId: guild.id } },
      update: { roles, nickname: member.nickname ?? undefined },
      create: { userId: user.id, guildId: guild.id, roles, nickname: member.nickname ?? undefined },
    });
  });
}
