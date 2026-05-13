import { auth, signIn } from "@/lib/auth";
import Link from "next/link";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-space-grotesk",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-jetbrains-mono",
});

export default async function PromoPage() {
  const session = await auth();

  async function loginAction() {
    "use server";
    await signIn("discord", { redirectTo: "/dashboard" });
  }

  return (
    <div className={`bento-page ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>

      {/* ── Tactical Background ─────────────────────────────────────────── */}
      <div className="bento-bg-deco" aria-hidden="true">
        <div className="bento-bd-scan" />
        <svg className="bento-bg-svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="sweepFan" x1="0" y1="0" x2="380" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="oklch(62% 0.22 25)" stopOpacity="0"/>
              <stop offset=".4" stopColor="oklch(62% 0.22 25)" stopOpacity="0"/>
              <stop offset="1" stopColor="oklch(62% 0.22 25)" stopOpacity=".22"/>
            </linearGradient>
          </defs>
          <path className="bg-contour" d="M -40 200 Q 200 150, 400 240 T 800 220 T 1200 260 T 1640 230"/>
          <path className="bg-contour" d="M -40 260 Q 220 220, 420 300 T 820 280 T 1220 320 T 1640 290"/>
          <path className="bg-contour" d="M -40 760 Q 240 720, 460 800 T 880 780 T 1280 820 T 1640 790"/>
          <path className="bg-contour" d="M -40 820 Q 260 780, 480 860 T 900 840 T 1300 880 T 1640 850"/>
          <path className="bg-contour" d="M -40 880 Q 280 840, 500 920 T 920 900 T 1320 940 T 1640 910"/>
          <line className="bg-traj" x1="-40" y1="160" x2="1640" y2="880"/>
          <line className="bg-traj" x1="-40" y1="880" x2="1640" y2="160"/>
          <line className="bg-traj" x1="800" y1="-40" x2="800" y2="1040"/>
          <line className="bg-traj" x1="-40" y1="500" x2="1640" y2="500"/>
          <g transform="translate(0, 500)">
            <g className="bg-sweep-grp">
              <path d="M 0 0 L 380 -80 A 380 380 0 0 1 380 80 Z" fill="url(#sweepFan)"/>
            </g>
            <circle className="bg-ring" r="380"/>
            <circle className="bg-ring-thin" r="300"/>
            <circle className="bg-ring-thin" r="220"/>
            <circle className="bg-ring-thin" r="140"/>
            <circle className="bg-ring" r="60"/>
            <line className="bg-tick" x1="-380" y1="0" x2="380" y2="0"/>
            <line className="bg-tick" x1="0" y1="-380" x2="0" y2="380"/>
            <line className="bg-tick-minor" x1="-380" y1="0" x2="380" y2="0" transform="rotate(45)"/>
            <line className="bg-tick-minor" x1="-380" y1="0" x2="380" y2="0" transform="rotate(-45)"/>
            <text className="bg-label" x="0" y="-388" textAnchor="middle">000</text>
            <text className="bg-label" x="388" y="4" textAnchor="start">090</text>
            <text className="bg-label" x="0" y="398" textAnchor="middle">180</text>
            <text className="bg-label-dim" x="275" y="-265" textAnchor="middle">045</text>
            <text className="bg-label-dim" x="275" y="285" textAnchor="middle">135</text>
            <text className="bg-label-dim" x="6" y="-144">1KM</text>
            <text className="bg-label-dim" x="6" y="-224">2KM</text>
            <text className="bg-label-dim" x="6" y="-304">3KM</text>
          </g>
          <g transform="translate(1600, 500)">
            <g className="bg-sweep-grp" style={{animationDuration:"11s",animationDirection:"reverse"}}>
              <path d="M 0 0 L -380 -80 A 380 380 0 0 0 -380 80 Z" fill="url(#sweepFan)" transform="scale(-1,1)"/>
            </g>
            <circle className="bg-ring" r="380"/>
            <circle className="bg-ring-thin" r="280"/>
            <circle className="bg-ring-thin" r="180"/>
            <circle className="bg-ring" r="60"/>
            <line className="bg-tick" x1="-380" y1="0" x2="380" y2="0"/>
            <line className="bg-tick" x1="0" y1="-380" x2="0" y2="380"/>
            <line className="bg-tick-minor" x1="-380" y1="0" x2="380" y2="0" transform="rotate(45)"/>
            <line className="bg-tick-minor" x1="-380" y1="0" x2="380" y2="0" transform="rotate(-45)"/>
            <text className="bg-label" x="0" y="-388" textAnchor="middle">000</text>
            <text className="bg-label" x="-388" y="4" textAnchor="end">270</text>
            <text className="bg-label" x="0" y="398" textAnchor="middle">180</text>
          </g>
          <g transform="translate(800, 500)" opacity=".55">
            <circle className="bg-reticle-dim" r="180"/>
            <circle className="bg-reticle-dim" r="100"/>
            <circle className="bg-reticle" r="40"/>
            <line className="bg-tick" x1="-220" y1="0" x2="-50" y2="0"/>
            <line className="bg-tick" x1="50" y1="0" x2="220" y2="0"/>
            <line className="bg-tick" x1="0" y1="-220" x2="0" y2="-50"/>
            <line className="bg-tick" x1="0" y1="50" x2="0" y2="220"/>
            <circle r="3" fill="oklch(62% 0.22 25 / .6)"/>
            <text className="bg-label-dim" x="0" y="-228" textAnchor="middle">TARGET ACQ</text>
          </g>
          <g transform="translate(280, 250)">
            <circle className="bg-reticle bg-pulse" r="24"/>
            <circle r="4" fill="oklch(62% 0.22 25 / .8)"/>
            <text className="bg-label-dim" x="10" y="-12">CT-04</text>
          </g>
          <g transform="translate(1300, 760)">
            <circle className="bg-reticle bg-pulse bg-pulse-d2" r="24"/>
            <circle r="4" fill="oklch(62% 0.22 25 / .8)"/>
            <text className="bg-label-dim" x="10" y="-12">CT-12</text>
          </g>
          <g transform="translate(1100, 220)">
            <circle className="bg-reticle bg-pulse bg-pulse-d3" r="24"/>
            <circle r="4" fill="oklch(62% 0.22 25 / .8)"/>
            <text className="bg-label-dim" x="10" y="-12">CT-07</text>
          </g>
          <g transform="translate(380, 820)">
            <circle className="bg-reticle bg-pulse bg-pulse-d2" r="24"/>
            <circle r="4" fill="oklch(62% 0.22 25 / .8)"/>
            <text className="bg-label-dim" x="10" y="-12">CT-22</text>
          </g>
          <g className="bg-arc-rot" transform="translate(440, 760)">
            <path className="bg-reticle" d="M -30 -30 L -30 -10 M -30 -30 L -10 -30 M 30 -30 L 30 -10 M 30 -30 L 10 -30 M -30 30 L -30 10 M -30 30 L -10 30 M 30 30 L 30 10 M 30 30 L 10 30"/>
          </g>
          <g className="bg-arc-rot bg-arc-rot-r2" transform="translate(1180, 320)">
            <path className="bg-reticle" d="M -40 -40 L -40 -16 M -40 -40 L -16 -40 M 40 -40 L 40 -16 M 40 -40 L 16 -40 M -40 40 L -40 16 M -40 40 L -16 40 M 40 40 L 40 16 M 40 40 L 16 40"/>
          </g>
          <path className="bg-reticle" d="M 28 28 L 28 90 M 28 28 L 90 28"/>
          <path className="bg-reticle" d="M 1572 28 L 1572 90 M 1572 28 L 1510 28"/>
          <path className="bg-reticle" d="M 28 972 L 28 910 M 28 972 L 90 972"/>
          <path className="bg-reticle" d="M 1572 972 L 1572 910 M 1572 972 L 1510 972"/>
          <text className="bg-label" x="104" y="36">SECTOR 04-K // 37.5N 127.0E</text>
          <text className="bg-label" x="1496" y="36" textAnchor="end">CHAN 145.8 // SECURE</text>
          <text className="bg-label" x="104" y="962">UPLINK OK // 12ms</text>
          <text className="bg-label" x="1496" y="962" textAnchor="end">REV 2.06 // BUILD 4711</text>
          <g className="bg-marker"><circle cx="600" cy="180" r="3" fill="oklch(62% 0.22 25)"/></g>
          <g className="bg-marker bg-marker-d2"><circle cx="980" cy="160" r="3" fill="oklch(62% 0.22 25)"/></g>
          <g className="bg-marker bg-marker-d3"><circle cx="720" cy="840" r="3" fill="oklch(62% 0.22 25)"/></g>
          <g className="bg-marker bg-marker-d4"><circle cx="540" cy="360" r="2.5" fill="oklch(62% 0.22 25)"/></g>
          <g className="bg-marker bg-marker-d2"><circle cx="1080" cy="700" r="2.5" fill="oklch(62% 0.22 25)"/></g>
          <g className="bg-marker bg-marker-d3"><circle cx="260" cy="560" r="3.5" fill="oklch(62% 0.22 25)"/></g>
        </svg>
        <div className="bento-stream bento-stream-left">// PKT 04A7 · 9B12 · FF03-K · OK · SYNC 64% · LAT 37.566 · LNG 126.978 · ALT 86m · BRG 045° · RNG 1.4KM · SIG 92% · ENC AES-256 · FREQ 145.825 MHz · BAND VHF · STATUS NORMAL · SECTOR 04-K · SWEEP CLEAR · PING 12ms</div>
        <div className="bento-stream bento-stream-right">// HANDSHAKE 200 OK · UPLINK STABLE · PING 12ms · RTT 24ms · LOSS 0.0% · SECTOR 03 CLEAR · SECTOR 04 CLEAR · OPS 24/7 · UPTIME 99.4% · BUILD 4711 · REV 2.06 · NODE KR-EAST · STATUS NORMAL · LAT 37.566 · LNG 126.978</div>
      </div>

      <div className="bento-app">

        {/* ── Top Rail ─────────────────────────────────────────────────── */}
        <header className="bento-rail">
          <div className="bento-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/valosegi-header-logo.webp" alt="발로세끼" className="bento-brand-logo" />
          </div>
          <div className="bento-rail-right">
            <span className="bento-dot" aria-hidden="true" />
            <span>LIVE · 62 ONLINE</span>
            <span className="bento-rail-sep" aria-hidden="true">·</span>
            <span>S2026</span>
            {session ? (
              <Link href="/dashboard" className="bento-cta bento-cta-sm" style={{ marginLeft: 14 }}>
                ← 대시보드로
              </Link>
            ) : (
              <form action={loginAction} style={{ marginLeft: 14 }}>
                <button type="submit" className="bento-cta bento-cta-sm">
                  ▸ DISCORD 로그인
                </button>
              </form>
            )}
          </div>
        </header>

        {/* ── Bento Grid ───────────────────────────────────────────────── */}
        <main className="bento-grid">

          {/* HERO */}
          <section className="bento-cell bento-hero" aria-label="히어로 섹션">
            <div className="bento-corners" aria-hidden="true" />
            <div className="bento-hero-top">
              <div>
                <span className="bento-label">// PROMO BRIEFING · S2026</span>
                <h1 className="bento-hero-h1">
                  항상 즐겁게<br />
                  <span className="bento-hero-accent">발로란트</span> 하기.
                </h1>
                <p className="bento-hero-desc">
                  로그인 한 번이면 끝.<br />
                  전적·내전·공지·하이라이트를 모두 한 페이지에서 확인하세요.
                </p>
              </div>
              <div className="bento-bigstat" aria-label="총 247명 활동 중">
                <div className="bento-bigstat-val">247</div>
                <div className="bento-bigstat-key">SQUADRON · TOTAL ACTIVE</div>
              </div>
            </div>
            <div className="bento-hero-actions">
              {session ? (
                <Link href="/dashboard" className="bento-cta">← 대시보드로 돌아가기</Link>
              ) : (
                <form action={loginAction}>
                  <button type="submit" className="bento-cta">▸ DISCORD 로그인</button>
                </form>
              )}
              <span className="bento-dim" style={{ marginLeft: "auto" }}>EST_LOGIN ▸ 30s</span>
            </div>
          </section>

          {/* TACTICAL COMMS (decorative) */}
          <div className="bento-cell bento-comms" aria-hidden="true">
            <div className="bento-comms-grid" />
            <div className="bento-comms-scan" />
            <div className="bento-comms-inner">
              <div className="bento-comms-head">
                <div className="bento-comms-head-l">
                  <i className="bento-dot" />
                  <span>TACTICAL COMMS</span>
                </div>
                <div className="bento-comms-head-r">SECTOR 04 · KR-EAST</div>
              </div>
              <div className="bento-comms-radar-wrap">
                <div className="bento-radar">
                  <svg viewBox="0 0 100 100">
                    <defs>
                      <radialGradient id="sweepG" cx="50" cy="50" r="50">
                        <stop offset="0" stopColor="oklch(62% 0.22 25)" stopOpacity="0"/>
                        <stop offset=".7" stopColor="oklch(62% 0.22 25)" stopOpacity="0"/>
                        <stop offset="1" stopColor="oklch(62% 0.22 25)" stopOpacity=".55"/>
                      </radialGradient>
                    </defs>
                    <circle cx="50" cy="50" r="48" stroke="oklch(62% 0.22 25 / .35)" strokeWidth=".6" fill="none"/>
                    <circle cx="50" cy="50" r="34" stroke="oklch(62% 0.22 25 / .25)" strokeWidth=".4" fill="none"/>
                    <circle cx="50" cy="50" r="20" stroke="oklch(62% 0.22 25 / .25)" strokeWidth=".4" fill="none"/>
                    <circle cx="50" cy="50" r="6"  stroke="oklch(62% 0.22 25 / .45)" strokeWidth=".4" fill="none"/>
                    <line x1="50" y1="2"  x2="50" y2="98" stroke="oklch(62% 0.22 25 / .18)" strokeWidth=".4"/>
                    <line x1="2"  y1="50" x2="98" y2="50" stroke="oklch(62% 0.22 25 / .18)" strokeWidth=".4"/>
                    <g className="bento-radar-sweep">
                      <path d="M50 50 L50 2 A48 48 0 0 1 92 28 Z" fill="url(#sweepG)"/>
                    </g>
                    <g className="bento-radar-blip"><circle cx="32" cy="30" r="1.8" fill="oklch(62% 0.22 25)"/></g>
                    <g className="bento-radar-blip"><circle cx="72" cy="38" r="1.6" fill="oklch(62% 0.22 25)"/></g>
                    <g className="bento-radar-blip"><circle cx="62" cy="68" r="2.2" fill="oklch(62% 0.22 25)"/></g>
                    <g className="bento-radar-blip"><circle cx="28" cy="62" r="1.4" fill="oklch(62% 0.22 25)"/></g>
                    <g className="bento-radar-blip"><circle cx="50" cy="50" r="2.4" fill="#fff"/></g>
                  </svg>
                </div>
                <div className="bento-comms-meters">
                  <div className="bento-meter"><span>PING</span><span className="bento-meter-bar"><i style={{width:"18%"}}/></span><span className="bento-meter-v">12ms</span></div>
                  <div className="bento-meter"><span>SIGNAL</span><span className="bento-meter-bar"><i style={{width:"92%"}}/></span><span className="bento-meter-v">92%</span></div>
                  <div className="bento-meter"><span>UPLINK</span><span className="bento-meter-bar"><i style={{width:"76%"}}/></span><span className="bento-meter-v">OK</span></div>
                  <div className="bento-meter"><span>ENCRYPT</span><span className="bento-meter-bar"><i style={{width:"100%"}}/></span><span className="bento-meter-v">AES</span></div>
                  <div className="bento-meter"><span>SYNC</span><span className="bento-meter-bar"><i style={{width:"64%"}}/></span><span className="bento-meter-v">✓</span></div>
                </div>
              </div>
              <div className="bento-comms-readout">
                <div className="bento-rdo"><div className="bento-rdo-k">SECTOR</div><div className="bento-rdo-v">04-K</div></div>
                <div className="bento-rdo"><div className="bento-rdo-k">OPS·HRS</div><div className="bento-rdo-v">24/7</div></div>
                <div className="bento-rdo"><div className="bento-rdo-k">UPTIME</div><div className="bento-rdo-v">99.4</div></div>
                <div className="bento-rdo"><div className="bento-rdo-k">VER</div><div className="bento-rdo-v">2.6</div></div>
              </div>
              <div className="bento-comms-feed">
                <div className="bento-comms-tick">
                  <span>[12:04] <b>FREQ</b> 145.8 MHz · NORMAL</span>
                  <span>[12:11] <b>SWEEP</b> SECTOR 03 · <span className="ok">CLEAR</span></span>
                  <span>[12:18] <b>UPLINK</b> KR-EAST · STABLE</span>
                  <span>[12:24] <b>HANDSHAKE</b> RIOT API · 200</span>
                  <span>[12:31] <b>SWEEP</b> SECTOR 04 · <span className="ok">CLEAR</span></span>
                  <span>[12:04] <b>FREQ</b> 145.8 MHz · NORMAL</span>
                  <span>[12:11] <b>SWEEP</b> SECTOR 03 · <span className="ok">CLEAR</span></span>
                  <span>[12:18] <b>UPLINK</b> KR-EAST · STABLE</span>
                  <span>[12:24] <b>HANDSHAKE</b> RIOT API · 200</span>
                  <span>[12:31] <b>SWEEP</b> SECTOR 04 · <span className="ok">CLEAR</span></span>
                </div>
              </div>
            </div>
          </div>

          {/* MODULES ×6 */}
          <div className="bento-cell bento-mod"><div className="bento-cell-tag"><span>M.01</span></div><div className="bento-mod-num">/match</div><div className="bento-mod-ico" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 12 12 3 21 12 12 21Z"/><circle cx="12" cy="12" r="3"/></svg></div><div className="bento-mod-name">내전</div><div className="bento-mod-desc">내전 관리 및 KD 랭킹</div></div>
          <div className="bento-cell bento-mod"><div className="bento-cell-tag"><span>M.02</span></div><div className="bento-mod-num">/stats</div><div className="bento-mod-ico" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 19 9 13 13 17 21 9"/><path d="M15 9 21 9 21 15"/></svg></div><div className="bento-mod-name">전적</div><div className="bento-mod-desc">라이엇 연동</div></div>
          <div className="bento-cell bento-mod"><div className="bento-cell-tag"><span>M.03</span></div><div className="bento-mod-num">/voice</div><div className="bento-mod-ico" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11v2a7 7 0 0 0 14 0v-2"/></svg></div><div className="bento-mod-name">활동</div><div className="bento-mod-desc">디스코드 음성 활동 자동 기록</div></div>
          <div className="bento-cell bento-mod"><div className="bento-cell-tag"><span>M.04</span></div><div className="bento-mod-num">/event</div><div className="bento-mod-ico" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="5" width="18" height="16"/><path d="M3 10H21M8 3v4M16 3v4"/></svg></div><div className="bento-mod-name">일정</div><div className="bento-mod-desc">일정 등록 및 관리</div></div>
          <div className="bento-cell bento-mod"><div className="bento-cell-tag"><span>M.05</span></div><div className="bento-mod-num">/notification</div><div className="bento-mod-ico" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3 21 9 12 15 3 9Z"/><path d="M3 14 12 20 21 14"/></svg></div><div className="bento-mod-name">공지</div><div className="bento-mod-desc">서버 공지 및 발로란트 공지</div></div>
          <div className="bento-cell bento-mod"><div className="bento-cell-tag"><span>M.06</span></div><div className="bento-mod-num">/clip</div><div className="bento-mod-ico" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M10 9 16 12 10 15Z" fill="currentColor"/></svg></div><div className="bento-mod-name">하이라이트</div><div className="bento-mod-desc">클립 자동 저장</div></div>

          {/* GUIDELINES */}
          <section className="bento-cell bento-rules" aria-label="서버 가이드라인">
            <div className="bento-rules-head">
              <span className="bento-rules-badge">GUIDELINES</span>
              <h2 className="bento-rules-title">발로세끼 서버 가이드라인</h2>
              <div className="bento-rules-meta"><span>v.2026.05 · 6 RULES</span><a href="#">전체보기 ▸</a></div>
            </div>
            <div className="bento-rules-grid">
              <article className="bento-rule"><span className="bento-rule-pin">R.02</span><span className="bento-rule-num">// FENCE</span><strong className="bento-rule-name">울타리 친목 금지</strong><p className="bento-rule-desc">DM만으로 인원 구성 금지. 구인글은 채널에서, 모두에게 기회를.</p></article>
              <article className="bento-rule"><span className="bento-rule-pin">R.03</span><span className="bento-rule-num">// DOUBLE</span><strong className="bento-rule-name">이중서버 금지</strong><p className="bento-rule-desc">다른 발로 서버 초대 링크 공유 금지. DM으로 받으면 관리자에게 제보.</p></article>
              <article className="bento-rule"><span className="bento-rule-pin">R.04</span><span className="bento-rule-num">// RECRUIT</span><strong className="bento-rule-name">구인·구직 채널 이용</strong><p className="bento-rule-desc">[게임/모드/현재·맥스 인원] 형식으로 구인. 우회 모집 자제.</p></article>
              <article className="bento-rule"><span className="bento-rule-pin">R.05</span><span className="bento-rule-num">// MAIL</span><strong className="bento-rule-name">민원은 마음의 편지</strong><p className="bento-rule-desc">불편 사항은 마편으로. 질문은 관리자·어시스트 DM. 민원 1건 · 건의 1건.</p></article>
              <article className="bento-rule"><span className="bento-rule-pin">R.06</span><span className="bento-rule-num">// NO MISAE</span><strong className="bento-rule-name">남·여미새 금지</strong><p className="bento-rule-desc">상대 의사 무시 이성 접근·사생활 침해 시 경고 없이 퇴출 가능.</p></article>
              <article className="bento-rule"><span className="bento-rule-pin">R.07</span><span className="bento-rule-num">// TOXIC</span><strong className="bento-rule-name">과한 톡식·혐오 금지</strong><p className="bento-rule-desc">팀원 비난·모욕 금지. 감정적 싸움 대신 휴식. 목격 시 운영진 제보.</p></article>
            </div>
          </section>

          {/* LEADERBOARD */}
          <section className="bento-cell bento-leader" aria-label="이번 주 활동 랭킹">
            <div className="bento-cell-tag"><span>WEEKLY</span></div>
            <div className="bento-corners" aria-hidden="true" />
            <div className="bento-row-head"><h3 className="bento-leader-title">이번 주 활동 랭킹</h3><span className="bento-dim">TOP 6</span></div>
            <div className="bento-leader-row bento-leader-gold"><span className="bento-leader-rank">01</span><span className="bento-leader-ign">VICTOR<small>#KR47</small></span><span className="bento-leader-pts">9,820P</span></div>
            <div className="bento-leader-row"><span className="bento-leader-rank">02</span><span className="bento-leader-ign">SAGE<small>#KR05</small></span><span className="bento-leader-pts">7,140P</span></div>
            <div className="bento-leader-row"><span className="bento-leader-rank">03</span><span className="bento-leader-ign">REX<small>#KR88</small></span><span className="bento-leader-pts">6,250P</span></div>
            <div className="bento-leader-row"><span className="bento-leader-rank">04</span><span className="bento-leader-ign">NOVA<small>#KR12</small></span><span className="bento-leader-pts">5,930P</span></div>
            <div className="bento-leader-row"><span className="bento-leader-rank">05</span><span className="bento-leader-ign">HALO<small>#KR03</small></span><span className="bento-leader-pts">5,420P</span></div>
            <div className="bento-leader-row"><span className="bento-leader-rank">06</span><span className="bento-leader-ign">ECHO<small>#KR21</small></span><span className="bento-leader-pts">4,810P</span></div>
            <div className="bento-leader-bar" aria-hidden="true"><div className="bento-leader-bar-fill" /></div>
          </section>

          {/* ACTIVITY FEED */}
          <section className="bento-cell bento-activity" aria-label="최근 활동">
            <div className="bento-cell-tag"><span>FEED</span></div>
            <h3 className="bento-activity-title">최근 활동</h3>
            <div className="bento-feed" role="list">
              <div role="listitem"><span className="bento-feed-ts">+02m</span><strong>VICTOR</strong> 내전 승리 · 13:11</div>
              <div role="listitem"><span className="bento-feed-ts">+05m</span><strong>NOVA</strong> 음성 입장 · 메인 채널</div>
              <div role="listitem"><span className="bento-feed-ts">+12m</span><strong>SAGE</strong> 도안 잠금해제 · CLAN EMBLEM</div>
              <div role="listitem"><span className="bento-feed-ts">+24m</span><strong>REX</strong> 일정 등록 · 22:00 내전</div>
            </div>
          </section>

          {/* MAP */}
          <section className="bento-cell bento-map" aria-label="서버 라이브 토폴로지">
            <div className="bento-cell-tag" style={{ color: "var(--bento-red)", zIndex: 5 }}><span>SERVER MAP</span></div>
            <div className="bento-map-grid" aria-hidden="true" />
            <div className="bento-map-label" aria-hidden="true">// LIVE TOPOLOGY</div>
            <svg className="bento-map-svg" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
              <path d="M40 80 L120 70 L160 130 L240 140 L260 90 L320 100 L360 60" stroke="oklch(62% 0.22 25 / .6)" strokeWidth="1.4" fill="none" strokeDasharray="3 3"/>
              <g fill="oklch(62% 0.22 25)" stroke="#fff" strokeWidth="1">
                <circle cx="40" cy="80" r="6"/><circle cx="160" cy="130" r="9"/><circle cx="260" cy="90" r="6"/><circle cx="360" cy="60" r="6"/>
              </g>
              <g fontFamily="JetBrains Mono,monospace" fontSize="9" fill="#fff" letterSpacing="1">
                <text x="50" y="76">A · MATCH</text><text x="170" y="148">B · VOICE</text><text x="270" y="84">C · EVENT</text><text x="320" y="56">D · SHOP</text>
              </g>
            </svg>
            <div className="bento-map-legend">5 OPS · LIVE</div>
          </section>

          {/* JOIN */}
          <section className="bento-cell bento-join" aria-label="서버 입장">
            <div className="bento-corners" aria-hidden="true" />
            <div className="bento-cell-tag" style={{ color: "var(--bento-red)" }}>
              <span className="bento-dot" style={{ width: 6, height: 6 }} aria-hidden="true" />
              JOIN_OPS · 24/7
            </div>
            <div className="bento-join-head">
              <div>
                <span className="bento-label">ENROLL · S2026</span>
                <h3 className="bento-join-title">30초면 입장 완료.</h3>
              </div>
            </div>
            <div className="bento-join-qrs">
              <div className="bento-qr-card">
                <div className="bento-qr-block bento-qr-real">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/discord-join-qr.png" alt="발로세끼 디스코드 QR" />
                </div>
                <div className="bento-qr-info">DISCORD<strong>발로세끼 서버</strong><small>QR 스캔 또는 ▸ DISCORD 로그인 버튼</small></div>
              </div>
              <div className="bento-qr-card">
                <div className="bento-qr-block bento-qr-real">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/kakao-openchat-qr.png" alt="발로세끼 카카오 오픈채팅 QR" />
                </div>
                <div className="bento-qr-info">KAKAO · OPENCHAT<strong>오픈채팅</strong><small>그룹 공지·내전 모집을 함께 볼 수 있어요</small></div>
              </div>
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}
