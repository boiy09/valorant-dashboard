import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import QrSection from "./QrSection";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-[#0f1923] flex flex-col overflow-hidden">
      {/* Top accent */}
      <div className="h-[2px] w-full bg-gradient-to-r from-[#ff4655] via-[#ff4655]/60 to-transparent" />

      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-[#2a3540]">
        <span className="font-black text-xl tracking-[0.2em] text-white">
          VAL<span className="text-[#ff4655]">ORANT</span>
          <span className="text-[#7b8a96] font-light tracking-wider text-sm ml-2">DASHBOARD</span>
        </span>
        <form action={async () => { "use server"; await signIn("discord", { redirectTo: "/dashboard" }); }}>
          <button type="submit"
            className="flex items-center gap-2 text-xs text-[#7b8a96] hover:text-white border border-[#2a3540] hover:border-[#7b8a96] px-3 py-1.5 rounded transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
            </svg>
            Discord 로그인
          </button>
        </form>
      </nav>

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center text-center px-4 pt-20 pb-16 overflow-hidden">
        {/* BG grid */}
        <div className="absolute inset-0 opacity-[0.025]" style={{
          backgroundImage: "linear-gradient(#ff4655 1px, transparent 1px), linear-gradient(90deg, #ff4655 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }} />
        {/* Red glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#ff4655]/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative flex flex-col items-center gap-6 max-w-3xl">
          <div className="flex items-center gap-2 bg-[#ff4655]/10 border border-[#ff4655]/30 px-4 py-1.5 text-xs text-[#ff4655] tracking-widest uppercase rounded-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff4655] animate-pulse" />
            발로란트 커뮤니티 대시보드
          </div>

          <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-white leading-none">
            발로세끼<br />
            <span className="text-[#ff4655]">커뮤니티 서버</span>
          </h1>

          <p className="text-[#7b8a96] text-base leading-relaxed max-w-xl">
            발로란트를 즐기는 모든 분들을 위한 커뮤니티입니다.<br />
            내전 시스템, ELO 랭킹, 전적 분석까지 — 한 곳에서 모두 확인하세요.
          </p>

          <div className="flex items-center gap-3 flex-wrap justify-center">
            <form action={async () => { "use server"; await signIn("discord", { redirectTo: "/dashboard" }); }}>
              <button type="submit"
                className="val-btn flex items-center gap-2.5 bg-[#5865f2] text-white font-bold px-8 py-3 text-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
                </svg>
                Discord로 참가하기
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 pb-16 w-full">
        <div className="text-center mb-10">
          <div className="text-[#ff4655] text-xs tracking-widest uppercase mb-2">서버 기능</div>
          <h2 className="text-2xl font-black text-white">발로세끼가 제공하는 것들</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { icon: "⚔️",  title: "내전 시스템",   desc: "10명이 모이면 자동으로 팀이 나뉘고 내전이 시작돼요. ELO 기반 밸런스 매칭." },
            { icon: "📊",  title: "ELO 랭킹",     desc: "내전 결과에 따라 ELO 점수가 변동돼요. 서버 내 실력 순위를 확인해보세요." },
            { icon: "🎮",  title: "전적 분석",     desc: "라이엇 계정 연동 후 랭크, 에이전트별 통계, 최근 경기 폼을 분석해드려요." },
            { icon: "🎙️", title: "음성 활동 추적", desc: "음성 채널 입장 시 자동으로 활동 시간이 기록돼요. 월간 활동 랭킹도 있어요." },
            { icon: "📅",  title: "일정 관리",     desc: "내전, 연습, 토너먼트 일정을 Discord 봇으로 등록하고 30분 전 알림을 받아요." },
            { icon: "💎",  title: "포인트 시스템", desc: "출석, 내전 참여, 음성 활동으로 포인트를 쌓아요. 마켓에서 아이템과 교환 가능." },
          ].map(f => (
            <div key={f.title} className="val-card p-5">
              <div className="text-2xl mb-3">{f.icon}</div>
              <div className="text-white font-bold text-sm mb-1.5">{f.title}</div>
              <div className="text-[#7b8a96] text-xs leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <QrSection />

      {/* Stats bar */}
      <section className="border-y border-[#2a3540] py-8 mb-0">
        <div className="max-w-5xl mx-auto px-4 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { label: "Discord 봇",    value: "24/7 운영" },
            { label: "내전 매칭",     value: "10인 자동" },
            { label: "전적 추적",     value: "실시간"    },
            { label: "ELO 시스템",    value: "자동 반영" },
          ].map(s => (
            <div key={s.label}>
              <div className="text-white font-black text-xl">{s.value}</div>
              <div className="text-[#7b8a96] text-xs mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="px-8 py-4 border-t border-[#2a3540] flex items-center justify-between text-[#7b8a96] text-xs">
        <span>VALORANT DASHBOARD — 발로세끼</span>
        <span>Not affiliated with Riot Games</span>
      </footer>
    </div>
  );
}
