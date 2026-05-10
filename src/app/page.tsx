import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
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

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");

  async function loginAction() {
    "use server";
    await signIn("discord", { redirectTo: "/dashboard" });
  }

  return (
    <div
      className={`bento-page ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <div className="bento-app">

        {/* ── Top Rail ──────────────────────────────────────────────────── */}
        <header className="bento-rail">
          <div className="bento-brand">
            <div className="bento-brand-mark" aria-hidden="true">V</div>
            <span>발로세끼</span>
          </div>

          <nav className="bento-nav" aria-label="주요 메뉴">
            <span className="bento-nav-item active">// OVERVIEW</span>
            <span className="bento-nav-item">NAMEPLATES</span>
            <span className="bento-nav-item">ROSTER</span>
            <span className="bento-nav-item">STATS</span>
            <span className="bento-nav-item">GUIDE</span>
          </nav>

          <div className="bento-rail-right">
            <span className="bento-dot" aria-hidden="true" />
            <span>LIVE · 62 ONLINE</span>
            <span className="bento-rail-sep" aria-hidden="true">·</span>
            <span>S2026</span>
            <form action={loginAction} style={{ marginLeft: 14 }}>
              <button type="submit" className="bento-cta bento-cta-sm">
                ▸ DISCORD 로그인
              </button>
            </form>
          </div>
        </header>

        {/* ── Bento Grid ────────────────────────────────────────────────── */}
        <main className="bento-grid">

          {/* GUIDELINES ────────────────────────────────────────────────── */}
          <section className="bento-cell bento-rules" aria-label="서버 가이드라인">
            <div className="bento-rules-head">
              <span className="bento-rules-badge">GUIDELINES</span>
              <h2 className="bento-rules-title">발로세끼 서버 가이드라인</h2>
              <div className="bento-rules-meta">
                <span>v.2026.05 · 6 RULES</span>
                <a href="#">전체보기 ▸</a>
              </div>
            </div>
            <div className="bento-rules-grid">
              <article className="bento-rule">
                <span className="bento-rule-pin">R.02</span>
                <span className="bento-rule-num">// FENCE</span>
                <strong className="bento-rule-name">울타리 친목 금지</strong>
                <p className="bento-rule-desc">DM만으로 인원 구성 금지. 구인글은 채널에서, 모두에게 기회를.</p>
              </article>
              <article className="bento-rule">
                <span className="bento-rule-pin">R.03</span>
                <span className="bento-rule-num">// DOUBLE</span>
                <strong className="bento-rule-name">이중서버 금지</strong>
                <p className="bento-rule-desc">다른 발로 서버 초대 링크 공유 금지. DM으로 받으면 관리자에게 제보.</p>
              </article>
              <article className="bento-rule">
                <span className="bento-rule-pin">R.04</span>
                <span className="bento-rule-num">// RECRUIT</span>
                <strong className="bento-rule-name">구인·구직 채널 이용</strong>
                <p className="bento-rule-desc">[게임/모드/현재·맥스 인원] 형식으로 구인. 우회 모집 자제.</p>
              </article>
              <article className="bento-rule">
                <span className="bento-rule-pin">R.05</span>
                <span className="bento-rule-num">// MAIL</span>
                <strong className="bento-rule-name">민원은 마음의 편지</strong>
                <p className="bento-rule-desc">불편 사항은 마편으로. 질문은 관리자·어시스트 DM. 민원 1건 · 건의 1건.</p>
              </article>
              <article className="bento-rule">
                <span className="bento-rule-pin">R.06</span>
                <span className="bento-rule-num">// NO MISAE</span>
                <strong className="bento-rule-name">남·여미새 금지</strong>
                <p className="bento-rule-desc">상대 의사 무시 이성 접근·사생활 침해 시 경고 없이 퇴출 가능.</p>
              </article>
              <article className="bento-rule">
                <span className="bento-rule-pin">R.07</span>
                <span className="bento-rule-num">// TOXIC</span>
                <strong className="bento-rule-name">과한 톡식·혐오 금지</strong>
                <p className="bento-rule-desc">팀원 비난·모욕 금지. 감정적 싸움 대신 휴식. 목격 시 운영진 제보.</p>
              </article>
            </div>
          </section>

          {/* HERO ────────────────────────────────────────────────────────── */}
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
              <form action={loginAction}>
                <button type="submit" className="bento-cta">▸ DISCORD 로그인</button>
              </form>
              <a href="#bento-plate" className="bento-cta bento-cta-ghost">↓ 카드 보기</a>
              <span className="bento-dim" style={{ marginLeft: "auto" }}>EST_LOGIN ▸ 30s</span>
            </div>
          </section>

          {/* FEATURED NAMEPLATE ──────────────────────────────────────────── */}
          <section className="bento-cell bento-plate" id="bento-plate" aria-label="시즌 카드">
            <div className="bento-cell-tag" style={{ color: "var(--bento-red)" }}>
              <span className="bento-dot" style={{ width: 6, height: 6 }} aria-hidden="true" />
              FEATURED · DROP_03
            </div>
            <div className="bento-nameplate">
              <div className="bento-plate-art">
                <div className="bento-plate-slot" aria-label="총기 도안 / 요원 일러스트 / 클랜 엠블럼">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" opacity={0.3}>
                    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
                  </svg>
                  <span>총기 도안 / 요원 일러스트</span>
                </div>
                <div className="bento-corners" aria-hidden="true" />
                <div className="bento-plate-bp">BLUEPRINT · № 047</div>
              </div>
              <div className="bento-plate-id">
                <div className="bento-plate-id-row">
                  <span className="bento-plate-ign">발로세끼</span>
                  <span className="bento-plate-tag">#KR47</span>
                </div>
                <div className="bento-plate-title">« CALL ME WHEN IT&apos;S OVER »</div>
              </div>
              <div className="bento-plate-foot">
                <span>발로세끼 · S2026</span>
                <span>
                  <span style={{ color: "var(--bento-dim)" }}>LVL </span>
                  <span className="bento-plate-lvl">147</span>
                </span>
              </div>
            </div>
            <div className="bento-plate-copy">
              <span>UNLOCKED</span>
              <strong>3/12 도안</strong>
            </div>
          </section>

          {/* MODULES ×6 ──────────────────────────────────────────────────── */}
          <div className="bento-cell bento-mod">
            <div className="bento-cell-tag"><span>M.01</span></div>
            <div className="bento-mod-num">/match</div>
            <div className="bento-mod-ico" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M3 12 12 3 21 12 12 21Z" /><circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <div className="bento-mod-name">내전 매칭</div>
            <div className="bento-mod-desc">10인 자동 분배</div>
          </div>

          <div className="bento-cell bento-mod">
            <div className="bento-cell-tag"><span>M.02</span></div>
            <div className="bento-mod-num">/stats</div>
            <div className="bento-mod-ico" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M3 19 9 13 13 17 21 9" /><path d="M15 9 21 9 21 15" />
              </svg>
            </div>
            <div className="bento-mod-name">전적 분석</div>
            <div className="bento-mod-desc">라이엇 연동</div>
          </div>

          <div className="bento-cell bento-mod">
            <div className="bento-cell-tag"><span>M.03</span></div>
            <div className="bento-mod-num">/voice</div>
            <div className="bento-mod-ico" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11v2a7 7 0 0 0 14 0v-2" />
              </svg>
            </div>
            <div className="bento-mod-name">음성 활동</div>
            <div className="bento-mod-desc">자동 기록</div>
          </div>

          <div className="bento-cell bento-mod">
            <div className="bento-cell-tag"><span>M.04</span></div>
            <div className="bento-mod-num">/event</div>
            <div className="bento-mod-ico" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="3" y="5" width="18" height="16" /><path d="M3 10H21M8 3v4M16 3v4" />
              </svg>
            </div>
            <div className="bento-mod-name">일정 관리</div>
            <div className="bento-mod-desc">30분 전 알림</div>
          </div>

          <div className="bento-cell bento-mod">
            <div className="bento-cell-tag"><span>M.05</span></div>
            <div className="bento-mod-num">/shop</div>
            <div className="bento-mod-ico" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M12 3 21 9 12 15 3 9Z" /><path d="M3 14 12 20 21 14" />
              </svg>
            </div>
            <div className="bento-mod-name">포인트</div>
            <div className="bento-mod-desc">마켓 교환</div>
          </div>

          <div className="bento-cell bento-mod">
            <div className="bento-cell-tag"><span>M.06</span></div>
            <div className="bento-mod-num">/clip</div>
            <div className="bento-mod-ico" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="3" y="5" width="18" height="14" rx="1" />
                <path d="M10 9 16 12 10 15Z" fill="currentColor" />
              </svg>
            </div>
            <div className="bento-mod-name">하이라이트</div>
            <div className="bento-mod-desc">클립 자동 저장</div>
          </div>

          {/* LEADERBOARD ─────────────────────────────────────────────────── */}
          <section className="bento-cell bento-leader" aria-label="이번 주 활동 랭킹">
            <div className="bento-cell-tag"><span>WEEKLY</span></div>
            <div className="bento-corners" aria-hidden="true" />
            <div className="bento-row-head">
              <h3 className="bento-leader-title">이번 주 활동 랭킹</h3>
              <span className="bento-dim">TOP 6</span>
            </div>
            <div className="bento-leader-row bento-leader-gold">
              <span className="bento-leader-rank">01</span>
              <span className="bento-leader-ign">VICTOR<small>#KR47</small></span>
              <span className="bento-leader-pts">9,820P</span>
            </div>
            <div className="bento-leader-row"><span className="bento-leader-rank">02</span><span className="bento-leader-ign">SAGE<small>#KR05</small></span><span className="bento-leader-pts">7,140P</span></div>
            <div className="bento-leader-row"><span className="bento-leader-rank">03</span><span className="bento-leader-ign">REX<small>#KR88</small></span><span className="bento-leader-pts">6,250P</span></div>
            <div className="bento-leader-row"><span className="bento-leader-rank">04</span><span className="bento-leader-ign">NOVA<small>#KR12</small></span><span className="bento-leader-pts">5,930P</span></div>
            <div className="bento-leader-row"><span className="bento-leader-rank">05</span><span className="bento-leader-ign">HALO<small>#KR03</small></span><span className="bento-leader-pts">5,420P</span></div>
            <div className="bento-leader-row"><span className="bento-leader-rank">06</span><span className="bento-leader-ign">ECHO<small>#KR21</small></span><span className="bento-leader-pts">4,810P</span></div>
            <div className="bento-leader-bar" aria-hidden="true"><div className="bento-leader-bar-fill" /></div>
          </section>

          {/* ACTIVITY FEED ───────────────────────────────────────────────── */}
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

          {/* MAP ─────────────────────────────────────────────────────────── */}
          <section className="bento-cell bento-map" aria-label="서버 라이브 토폴로지">
            <div className="bento-cell-tag" style={{ color: "var(--bento-red)", zIndex: 5 }}>
              <span>SERVER MAP</span>
            </div>
            <div className="bento-map-grid" aria-hidden="true" />
            <div className="bento-map-label" aria-hidden="true">// LIVE TOPOLOGY</div>
            <svg className="bento-map-svg" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
              <path d="M40 80 L120 70 L160 130 L240 140 L260 90 L320 100 L360 60" stroke="oklch(62% 0.22 25 / .6)" strokeWidth="1.4" fill="none" strokeDasharray="3 3" />
              <g fill="oklch(62% 0.22 25)" stroke="#fff" strokeWidth="1">
                <circle cx="40" cy="80" r="6" /><circle cx="160" cy="130" r="9" />
                <circle cx="260" cy="90" r="6" /><circle cx="360" cy="60" r="6" />
              </g>
              <g fontFamily="JetBrains Mono,monospace" fontSize="9" fill="#fff" letterSpacing="1">
                <text x="50" y="76">A · MATCH</text>
                <text x="170" y="148">B · VOICE</text>
                <text x="270" y="84">C · EVENT</text>
                <text x="320" y="56">D · SHOP</text>
              </g>
            </svg>
            <div className="bento-map-legend">5 OPS · LIVE</div>
          </section>

          {/* JOIN ────────────────────────────────────────────────────────── */}
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
                <div className="bento-qr-block" aria-label="Discord QR 코드" />
                <div className="bento-qr-info">DISCORD<strong>발로세끼 서버</strong></div>
              </div>
              <div className="bento-qr-card">
                <div className="bento-qr-block" aria-label="카카오 QR 코드" />
                <div className="bento-qr-info">KAKAO<strong>오픈채팅</strong></div>
              </div>
              <form action={loginAction} style={{ marginLeft: "auto" }}>
                <button type="submit" className="bento-cta">▸ DISCORD 로그인</button>
              </form>
            </div>
          </section>

          {/* TICKER ─────────────────────────────────────────────────────── */}
          <div className="bento-cell bento-ticker" aria-live="off">
            <div className="bento-ticker-track" aria-hidden="true">
              <span>▸ 내전 매칭 자동화</span>
              <span className="bento-ticker-hl">▸ 라이엇 전적 연동</span>
              <span>▸ 음성 활동 추적</span>
              <span>▸ 일정 30분 전 알림</span>
              <span>▸ 포인트 마켓</span>
              <span className="bento-ticker-hl">▸ 시즌 카드 매주 갱신</span>
              <span>▸ 24/7 운영</span>
              <span>▸ 내전 매칭 자동화</span>
              <span className="bento-ticker-hl">▸ 라이엇 전적 연동</span>
              <span>▸ 음성 활동 추적</span>
              <span>▸ 일정 30분 전 알림</span>
              <span>▸ 포인트 마켓</span>
              <span className="bento-ticker-hl">▸ 시즌 카드 매주 갱신</span>
              <span>▸ 24/7 운영</span>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
