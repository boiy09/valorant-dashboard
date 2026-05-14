"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const RIOT_LOGIN_URL =
  "https://auth.riotgames.com/authorize" +
  "?client_id=play-valorant-web-prod" +
  "&redirect_uri=https://playvalorant.com/opt_in" +
  "&response_type=token+id_token" +
  "&scope=account+openid" +
  "&nonce=1" +
  "&prompt=login";

type FormState = "idle" | "loading" | "success" | "error";
type RiotRegion = "KR" | "AP";
type AuthMethod = "url" | "ssid";

const guideSteps = [
  {
    title: "Riot 로그인 페이지 열기",
    desc: "연동 버튼을 누르면 Riot 공식 로그인 화면이 새 탭으로 열립니다.",
    image: "/guides/riot-link/step-01-open-link.jpg",
  },
  {
    title: "Riot 계정으로 로그인",
    desc: "아이디와 비밀번호는 Riot 공식 페이지에서만 입력합니다.",
    image: "/guides/riot-link/step-02-riot-login.jpg",
  },
  {
    title: "보안 인증 진행",
    desc: "인증 코드가 나오면 Riot 안내에 따라 인증을 완료합니다.",
    image: "/guides/riot-link/step-03-auth-check.jpg",
  },
  {
    title: "404 화면 확인",
    desc: "로그인 후 404 화면이 보여도 정상입니다. 주소창의 URL이 필요합니다.",
    image: "/guides/riot-link/step-04-copy-url.jpg",
  },
  {
    title: "주소 전체 복사 후 붙여넣기",
    desc: "주소창을 클릭하고 Ctrl+A, Ctrl+C로 전체 URL을 복사한 뒤 입력칸에 붙여넣습니다.",
    image: "/guides/riot-link/step-05-paste-url.jpg",
  },
  {
    title: "연동 완료 확인",
    desc: "연동이 완료되면 연결된 Riot 계정과 서버가 표시됩니다.",
    image: "/guides/riot-link/step-06-complete.jpg",
  },
];

const cookieGuideSteps = [
  {
    title: "Riot 로그인 페이지",
    desc: "Riot 로그인 열기 버튼을 눌러 아이디와 비밀번호를 입력합니다.",
    image: "/guides/riot-cookie/step-01-login.jpg",
  },
  {
    title: "2단계 인증",
    desc: "휴대전화 푸시 알림 또는 인증 코드로 보안 인증을 완료합니다.",
    image: "/guides/riot-cookie/step-02-mfa.jpg",
  },
  {
    title: "404 페이지 등장",
    desc: "로그인 후 이 화면이 나오면 정상입니다. 여기서 F12를 누릅니다.",
    image: "/guides/riot-cookie/step-03-404.jpg",
  },
  {
    title: "F12 → Network 탭 열기",
    desc: "개발자 도구가 열리면 상단에서 Network 탭을 클릭합니다.",
    image: "/guides/riot-cookie/step-04-f12.jpg",
  },
  {
    title: "F5 새로고침 후 목록 확인",
    desc: "F5로 새로고침하면 요청 목록이 뜹니다. check-session-iframe 항목을 찾아 클릭합니다.",
    image: "/guides/riot-cookie/step-05-refresh.jpg",
  },
  {
    title: "Headers → Cookie 값 복사",
    desc: "오른쪽 Headers 탭 → Request Headers → Cookie 값 전체를 복사합니다.",
    image: "/guides/riot-cookie/step-06-headers.jpg",
  },
  {
    title: "대시보드에 붙여넣기",
    desc: "복사한 Cookie 값을 입력칸에 붙여넣고 Cookie로 연동하기 버튼을 누릅니다.",
    image: "/guides/riot-cookie/step-07-paste.jpg",
  },
  {
    title: "연동 완료",
    desc: "연동이 완료됩니다. 이후 토큰은 만료될 때마다 자동으로 갱신됩니다.",
    image: "/guides/riot-cookie/step-08-success.jpg",
  },
];

function regionLabel(region: RiotRegion) {
  return region === "KR" ? "한국 서버" : "아시아 서버";
}

function LoadingLabel({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white" style={{ animationDelay: "0ms" }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white" style={{ animationDelay: "120ms" }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white" style={{ animationDelay: "240ms" }} />
      <span>{label}</span>
    </span>
  );
}

export default function RiotConnectPage() {
  const router = useRouter();
  const [method, setMethod] = useState<AuthMethod>("url");

  // URL 방식 상태
  const [url, setUrl] = useState("");
  const [region, setRegion] = useState<RiotRegion>("KR");
  const [urlState, setUrlState] = useState<FormState>("idle");
  const [urlError, setUrlError] = useState("");

  // SSID 방식 상태
  const [cookieInput, setCookieInput] = useState("");
  const [ssidState, setSsidState] = useState<FormState>("idle");
  const [ssidError, setSsidError] = useState("");

  // 공통 성공 상태
  const [riotId, setRiotId] = useState("");
  const [connectedRegion, setConnectedRegion] = useState<RiotRegion | "">("");

  async function handleUrlSubmit(event: React.FormEvent) {
    event.preventDefault();
    setUrlState("loading");
    setUrlError("");

    try {
      const response = await fetch("/api/riot/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), region }),
      });
      const data = (await response.json()) as {
        error?: string;
        account?: { riotId: string; region: RiotRegion };
      };

      if (!response.ok) {
        setUrlError(data.error ?? "연동에 실패했습니다. 주소 전체를 다시 붙여넣어 주세요.");
        setUrlState("error");
        return;
      }

      setRiotId(data.account?.riotId ?? "");
      setConnectedRegion(data.account?.region ?? "");
      window.dispatchEvent(new Event("riot-accounts-updated"));
      setUrlState("success");
    } catch {
      setUrlError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      setUrlState("error");
    }
  }

  async function handleSsidSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSsidState("loading");
    setSsidError("");

    try {
      const response = await fetch("/api/riot/auth/ssid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: cookieInput.trim() }),
      });
      const data = (await response.json()) as {
        error?: string;
        account?: { riotId?: string; region?: string };
      };

      if (!response.ok) {
        setSsidError(data.error ?? "연동에 실패했습니다. Cookie 값을 다시 확인해 주세요.");
        setSsidState("error");
        return;
      }

      setRiotId(data.account?.riotId ?? "");
      setConnectedRegion((data.account?.region as RiotRegion) ?? "");
      window.dispatchEvent(new Event("riot-accounts-updated"));
      setSsidState("success");
    } catch {
      setSsidError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      setSsidState("error");
    }
  }

  const isSuccess = urlState === "success" || ssidState === "success";

  if (isSuccess) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="val-card p-8 text-center">
          <div className="mb-2 text-xs font-black uppercase tracking-[0.24em] text-[#ff4655]">Riot Connected</div>
          <h1 className="text-2xl font-black text-white">연동 완료</h1>
          <div className="mt-5 rounded border border-[#2a3540] bg-[#0f1923] px-4 py-3">
            <div className="text-sm text-[#8da0ad]">연결된 계정</div>
            <div className="mt-1 text-lg font-black text-[#ff4655]">{riotId}</div>
            {connectedRegion ? (
              <div className="mt-1 text-xs font-bold text-green-400">
                {connectedRegion} / {regionLabel(connectedRegion as RiotRegion)}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard/valorant")}
            className="val-btn mt-6 bg-[#ff4655] px-8 py-2.5 text-sm font-black text-white"
          >
            전적 보러가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="val-card p-6">
        <div className="mb-1 text-xs font-black uppercase tracking-[0.24em] text-[#ff4655]">Riot Account Link</div>
        <h1 className="text-2xl font-black text-white">Riot 계정 연동</h1>
        <p className="mt-2 break-keep text-sm leading-relaxed text-[#9aa8b3]">
          비밀번호는 이 대시보드에 입력하거나 저장하지 않습니다. 아래에서 연동 방식을 선택하세요.
        </p>
      </div>

      {/* 방식 선택 */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setMethod("url")}
          className={`relative overflow-hidden rounded-lg border-2 p-5 text-left transition-all active:scale-[0.98] ${
            method === "url"
              ? "border-[#ff4655] bg-[#ff4655]/8 shadow-[0_0_20px_rgba(255,70,85,0.15)]"
              : "border-[#2a3540] bg-[#0d1822] hover:border-[#ff4655]/60 hover:bg-[#ff4655]/4"
          }`}
        >
          {/* 선택 표시 */}
          {method === "url" && (
            <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#ff4655] text-[10px] font-black text-white">✓</span>
          )}
          {/* 스티커 */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            <span className="rounded bg-[#ff4655] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">초보자용</span>
            <span className="rounded bg-[#f6c945] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black">강추</span>
          </div>
          <div className="text-xs font-black uppercase tracking-widest text-[#ff4655]">URL 방식</div>
          <div className="mt-1 text-base font-black text-white">로그인 후 주소 복사</div>
          <ul className="mt-3 space-y-1.5">
            <li className="flex items-start gap-1.5 text-xs text-[#7fffe6]">
              <span className="mt-px font-black">+</span>
              <span>절차가 단순해서 누구나 쉽게 할 수 있음</span>
            </li>
            <li className="flex items-start gap-1.5 text-xs text-[#ff8b95]">
              <span className="mt-px font-black">-</span>
              <span>토큰 만료(약 1시간)마다 재연동 필요</span>
            </li>
          </ul>
        </button>

        <button
          type="button"
          onClick={() => setMethod("ssid")}
          className={`relative overflow-hidden rounded-lg border-2 p-5 text-left transition-all active:scale-[0.98] ${
            method === "ssid"
              ? "border-[#7fffe6] bg-[#7fffe6]/8 shadow-[0_0_20px_rgba(127,255,230,0.12)]"
              : "border-[#2a3540] bg-[#0d1822] hover:border-[#7fffe6]/50 hover:bg-[#7fffe6]/4"
          }`}
        >
          {method === "ssid" && (
            <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#7fffe6] text-[10px] font-black text-black">✓</span>
          )}
          <div className="mb-3 flex flex-wrap gap-1.5">
            <span className="rounded bg-[#1a3a33] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#7fffe6] ring-1 ring-[#7fffe6]/30">숙련자용</span>
          </div>
          <div className="text-xs font-black uppercase tracking-widest text-[#7fffe6]">Cookie 방식</div>
          <div className="mt-1 text-base font-black text-white">F12 Cookie 복사</div>
          <ul className="mt-3 space-y-1.5">
            <li className="flex items-start gap-1.5 text-xs text-[#7fffe6]">
              <span className="mt-px font-black">+</span>
              <span>한 번 연동하면 토큰 자동 갱신, 재연동 불필요</span>
            </li>
            <li className="flex items-start gap-1.5 text-xs text-[#ff8b95]">
              <span className="mt-px font-black">-</span>
              <span>F12 개발자 도구를 열어야 해서 절차가 조금 복잡함</span>
            </li>
          </ul>
        </button>
      </div>

      {/* URL 방식 */}
      {method === "url" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="val-card p-5">
            <div className="mb-4 text-base font-black text-white">따라하기</div>
            <ol className="space-y-3">
              <li className="rounded border border-[#2a3540] bg-[#0f1923] p-4">
                <div className="text-xs font-black uppercase tracking-widest text-[#ff4655]">Step 1</div>
                <div className="mt-1 font-bold text-white">Riot 공식 로그인 페이지를 엽니다.</div>
                <a
                  href={RIOT_LOGIN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex rounded bg-[#ff4655] px-4 py-2 text-sm font-black text-white hover:bg-[#cc3644]"
                >
                  Riot 로그인 열기
                </a>
              </li>
              <li className="rounded border border-[#2a3540] bg-[#0f1923] p-4">
                <div className="text-xs font-black uppercase tracking-widest text-[#ff4655]">Step 2</div>
                <div className="mt-1 font-bold text-white">로그인 후 404 화면이 떠도 정상입니다.</div>
                <p className="mt-2 break-keep text-sm text-[#9aa8b3]">
                  그 화면의 주소창을 클릭하고 <span className="font-black text-white">Ctrl+A</span>, <span className="font-black text-white">Ctrl+C</span>로 주소 전체를 복사하세요.
                </p>
              </li>
              <li className="rounded border border-[#2a3540] bg-[#0f1923] p-4">
                <div className="text-xs font-black uppercase tracking-widest text-[#ff4655]">Step 3</div>
                <div className="mt-1 font-bold text-white">오른쪽 입력칸에 붙여넣고 연동합니다.</div>
                <p className="mt-2 break-keep text-sm text-[#9aa8b3]">
                  주소에는 임시 로그인 토큰이 들어있습니다. 다른 곳에 공유하지 말고 이 화면에만 붙여넣어 주세요.
                </p>
              </li>
            </ol>
          </section>

          <section className="val-card p-5">
            <form onSubmit={handleUrlSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-black text-white">서버 선택</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["KR", "AP"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRegion(value)}
                      disabled={urlState === "loading"}
                      className={`rounded border px-3 py-3 text-sm font-black transition-colors ${
                        region === value
                          ? "border-[#ff4655] bg-[#ff4655]/10 text-white"
                          : "border-[#2a3540] text-[#8da0ad] hover:border-[#ff4655]/60 hover:text-white"
                      }`}
                    >
                      {value} / {regionLabel(value)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-black text-white">복사한 주소 붙여넣기</label>
                <textarea
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    if (urlState === "error") setUrlState("idle");
                  }}
                  rows={8}
                  required
                  disabled={urlState === "loading"}
                  placeholder="https://playvalorant.com/opt_in#access_token=..."
                  className="w-full resize-none rounded border border-[#2a3540] bg-[#0f1923] px-4 py-3 font-mono text-sm text-white placeholder:text-[#465766] focus:border-[#ff4655] focus:outline-none"
                />
                <p className="mt-2 break-keep text-xs leading-relaxed text-[#7b8a96]">
                  예전 주소는 재사용할 수 없습니다. 토큰이 만료되면 Riot 로그인 페이지를 다시 열어 새 주소를 받아야 합니다.
                </p>
              </div>

              {urlState === "error" && (
                <div className="rounded border border-[#ff4655]/40 bg-[#ff4655]/10 px-4 py-3 text-sm font-bold text-[#ff8b95]">
                  {urlError}
                </div>
              )}

              <button
                type="submit"
                disabled={urlState === "loading" || !url.trim()}
                className="val-btn w-full bg-[#ff4655] py-3 text-sm font-black text-white hover:bg-[#cc3644] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {urlState === "loading" ? <LoadingLabel label="연동 중" /> : "Riot 계정 연동하기"}
              </button>
            </form>
          </section>
        </div>
      )}

      {/* Cookie(SSID) 방식 */}
      {method === "ssid" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="val-card p-5">
            <div className="mb-4 text-base font-black text-white">따라하기</div>
            <ol className="space-y-3">
              <li className="rounded border border-[#2a3540] bg-[#0f1923] p-4">
                <div className="text-xs font-black uppercase tracking-widest text-[#7fffe6]">Step 1</div>
                <div className="mt-1 font-bold text-white">아래 버튼으로 Riot 로그인을 완료합니다.</div>
                <p className="mt-2 break-keep text-sm leading-relaxed text-[#9aa8b3]">
                  새 탭이 열리면 평소처럼 Riot 계정으로 로그인하세요. 로그인 후 페이지가 이동하면 완료입니다.
                </p>
                <a
                  href={RIOT_LOGIN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex rounded bg-[#ff4655] px-4 py-2 text-sm font-black text-white hover:bg-[#cc3644]"
                >
                  Riot 로그인 열기
                </a>
              </li>
              <li className="rounded border border-[#2a3540] bg-[#0f1923] p-4">
                <div className="text-xs font-black uppercase tracking-widest text-[#7fffe6]">Step 2</div>
                <div className="mt-1 font-bold text-white">F12 → Network 탭에서 Cookie를 복사합니다.</div>
                <ol className="mt-2 space-y-1 break-keep text-sm leading-relaxed text-[#9aa8b3]">
                  <li>① 로그인된 탭에서 <span className="font-black text-white">F12</span> 를 눌러 개발자 도구를 엽니다.</li>
                  <li>② 상단 탭에서 <span className="font-black text-white">Network</span> 를 클릭합니다.</li>
                  <li>③ 페이지를 <span className="font-black text-white">새로고침(F5)</span> 합니다.</li>
                  <li>④ 왼쪽 요청 목록에서 <span className="font-black text-white">check-session-iframe</span> 을 클릭합니다.</li>
                  <li>⑤ 오른쪽 <span className="font-black text-white">Headers → Request Headers → Cookie</span> 값 전체를 복사합니다.</li>
                </ol>
              </li>
              <li className="rounded border border-[#2a3540] bg-[#0f1923] p-4">
                <div className="text-xs font-black uppercase tracking-widest text-[#7fffe6]">Step 3</div>
                <div className="mt-1 font-bold text-white">복사한 값을 오른쪽에 붙여넣고 연동합니다.</div>
                <p className="mt-2 break-keep text-sm leading-relaxed text-[#9aa8b3]">
                  성공하면 토큰이 만료될 때마다 자동으로 갱신되어 재연동 팝업이 뜨지 않습니다.
                </p>
              </li>
            </ol>
          </section>

          <section className="val-card p-5">
            <form onSubmit={handleSsidSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-black text-white">Cookie 값 붙여넣기</label>
                <textarea
                  value={cookieInput}
                  onChange={(event) => {
                    setCookieInput(event.target.value);
                    if (ssidState === "error") setSsidState("idle");
                  }}
                  rows={10}
                  required
                  disabled={ssidState === "loading"}
                  placeholder="ssid=...; clid=...; csid=..."
                  className="w-full resize-none rounded border border-[#2a3540] bg-[#0f1923] px-4 py-3 font-mono text-sm text-white placeholder:text-[#465766] focus:border-[#7fffe6] focus:outline-none"
                />
                <p className="mt-2 break-keep text-xs leading-relaxed text-[#7b8a96]">
                  Cookie에는 로그인 세션 정보가 들어 있습니다. 이 화면 외 다른 곳에는 절대 공유하지 마세요.
                </p>
              </div>

              {ssidState === "error" && (
                <div className="rounded border border-[#ff4655]/40 bg-[#ff4655]/10 px-4 py-3 text-sm font-bold text-[#ff8b95]">
                  {ssidError}
                </div>
              )}

              <button
                type="submit"
                disabled={ssidState === "loading" || !cookieInput.trim()}
                className="val-btn w-full bg-[#7fffe6]/10 py-3 text-sm font-black text-[#7fffe6] ring-1 ring-[#7fffe6]/40 hover:bg-[#7fffe6]/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {ssidState === "loading" ? <LoadingLabel label="연동 중" /> : "Cookie로 연동하기"}
              </button>
            </form>
          </section>
        </div>
      )}

      {/* 이미지 가이드 (Cookie 방식) */}
      {method === "ssid" && (
        <section className="val-card p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.22em] text-[#7fffe6]">Image Guide</div>
              <h2 className="mt-1 text-lg font-black text-white">이미지로 보는 연동 방법</h2>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {cookieGuideSteps.map((step, index) => (
              <article key={step.image} className="overflow-hidden rounded border border-[#263746] bg-[#0f1923]">
                <div className="relative aspect-[16/9] overflow-hidden border-b border-[#263746] bg-black/30">
                  <img src={step.image} alt={step.title} className="h-full w-full object-cover" loading="lazy" />
                  <div className="absolute left-3 top-3 rounded bg-[#7fffe6] px-2 py-1 text-xs font-black text-black">
                    STEP {index + 1}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="break-keep text-base font-black text-white">{step.title}</h3>
                  <p className="mt-2 break-keep text-sm leading-relaxed text-[#9aa8b3]">{step.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* 이미지 가이드 (URL 방식) */}
      {method === "url" && (
        <section className="val-card p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.22em] text-[#ff4655]">Image Guide</div>
              <h2 className="mt-1 text-lg font-black text-white">이미지로 보는 연동 방법</h2>
            </div>
            <div className="text-xs text-[#7b8a96]">404 화면은 실패가 아니라 정상 단계입니다.</div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {guideSteps.map((step, index) => (
              <article key={step.image} className="overflow-hidden rounded border border-[#263746] bg-[#0f1923]">
                <div className="relative aspect-[16/9] overflow-hidden border-b border-[#263746] bg-black/30">
                  <img src={step.image} alt={step.title} className="h-full w-full object-cover" loading="lazy" />
                  <div className="absolute left-3 top-3 rounded bg-[#ff4655] px-2 py-1 text-xs font-black text-white">
                    STEP {index + 1}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="break-keep text-base font-black text-white">{step.title}</h3>
                  <p className="mt-2 break-keep text-sm leading-relaxed text-[#9aa8b3]">{step.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
