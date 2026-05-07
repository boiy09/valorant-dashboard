import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";

const COMMANDS = [
  {
    name: "/발로세끼",
    usage: "/발로세끼",
    description: "발로세끼 웹 대시보드 주소를 안내합니다.",
  },
  {
    name: "/하이라이트",
    usage: "/하이라이트 채널 #발로-클립, /하이라이트 해제",
    description: "지정한 Discord 채널에 올라온 영상을 웹 하이라이트 탭에 자동 등록합니다.",
  },
  {
    name: "/공지",
    usage: "/공지 작성, /공지 목록",
    description: "공지 작성과 최근 공지 확인에 사용합니다.",
  },
  {
    name: "/일정",
    usage: "/일정 등록 제목 날짜 설명, /일정 목록, /일정 취소 id",
    description: "내전, 연습, 토너먼트 일정을 웹 일정 탭에 등록합니다.",
  },
  {
    name: "/내전",
    usage: "/내전 시작, /내전 목록",
    description: "음성 채널 멤버를 팀으로 나누고 내전 기록을 남깁니다.",
  },
  {
    name: "/경고",
    usage: "/경고 발급, /경고 조회, /경고 취소",
    description: "서버 멤버 경고를 관리합니다.",
  },
  {
    name: "/전적",
    usage: "/전적 라이엇아이디 지역",
    description: "발로란트 기본 전적을 조회합니다.",
  },
  {
    name: "/매치",
    usage: "/매치 라이엇아이디 지역 개수",
    description: "최근 매치 기록을 조회합니다.",
  },
  {
    name: "/랭크",
    usage: "/랭크 라이엇아이디 지역",
    description: "현재 경쟁전 랭크를 조회합니다.",
  },
];

export const data = new SlashCommandBuilder()
  .setName("도움말")
  .setDescription("발로세끼 봇 명령어 사용법을 확인합니다.");

export async function execute(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setColor(0xff4655)
    .setTitle("발로세끼 도움말")
    .setDescription("현재 사용할 수 있는 명령어 목록입니다.")
    .addFields(
      COMMANDS.map((command) => ({
        name: command.name,
        value: `${command.description}\n사용법: \`${command.usage}\``,
      }))
    )
    .setFooter({ text: "관리 명령어는 권한이 있는 멤버에게만 보일 수 있습니다." });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
