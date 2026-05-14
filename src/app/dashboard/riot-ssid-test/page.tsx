"use client";

import { useState } from "react";

type FormState = "idle" | "loading" | "success" | "error";

const RIOT_LOGIN_URL =
  "https://auth.riotgames.com/authorize" +
  "?client_id=play-valorant-web-prod" +
  "&redirect_uri=https://playvalorant.com/opt_in" +
  "&response_type=token+id_token" +
  "&scope=account+openid" +
  "&nonce=1" +
  "&prompt=login";

function LoadingLabel() {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white" style={{ animationDelay: "0ms" }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white" style={{ animationDelay: "120ms" }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white" style={{ animationDelay: "240ms" }} />
      <span>테스트 중</span>
    </span>
  );
}

export default function RiotSsidTestPage() {
  const [authInput, setAuthInput] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");
  const [riotId, setRiotId] = useState("");
  const [region, setRegion] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setState("loading");
    setMessage("");
    setRiotId("");
    setRegion("");

    try {
      const response = await fetch("/api/riot/auth/ssid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: authInput.trim() }),
      });
      const data = (await response.json()) as {
        error?: string;
        authMode?: "cookie";
        account?: { riotId?: string; region?: string; isVerified?: boolean };
      };

      if (!response.ok) {
        setState("error");
        setMessage(data.error ?? "SSID 연동 테스트에 실패했습니다.");
        return;
      }

      setState("success");
      setRiotId(data.account?.riotId ?? "");
      setRegion(data.account?.region ?? "");
      setMessage("Cookie 저장과 토큰 자동 갱신 테스트가 완료되었습니다.");
      window.dispatchEvent(new Event("riot-accounts-updated"));
    } catch {
      setState("error");
      setMessage("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="val-card p-6">
        <div className="mb-1 text-xs font-black uppercase tracking-[0.24em] text-[#7fffe6]">Riot SSID Test</div>
        <h1 className="text-2xl font-black text-white">Riot 장기 연동 테스트</h1>
        <p className="mt-2 break-keep text-sm leading-relaxed text-[#9aa8b3]">
          기존 Riot 연동은 그대로 두고, 여기서만 Riot Cookie 기반 장기 연동과 자동 갱신을 테스트합니다.
          URL 방식은 단기 토큰이라 여기서는 사용하지 않습니다.
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="val-card p-5">
          <div className="mb-4 text-base font-black text-white">테스트 방법</div>
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
                <li>① 로그인된 탭에서 <span className="font-bold text-white">F12</span> 를 눌러 개발자 도구를 엽니다.</li>
                <li>② 상단 탭에서 <span className="font-bold text-white">Network</span> 를 클릭합니다.</li>
                <li>③ 페이지를 <span className="font-bold text-white">새로고침(F5)</span> 합니다.</li>
                <li>④ 왼쪽 요청 목록에서 <span className="font-bold text-white">check-session-iframe</span> 을 클릭합니다.</li>
                <li>⑤ 오른쪽 <span className="font-bold text-white">Headers → Request Headers → Cookie</span> 값 전체를 복사합니다.</li>
              </ol>
            </li>
            <li className="rounded border border-[#2a3540] bg-[#0f1923] p-4">
              <div className="text-xs font-black uppercase tracking-widest text-[#7fffe6]">Step 3</div>
              <div className="mt-1 font-bold text-white">복사한 값을 오른쪽 입력칸에 붙여넣고 테스트합니다.</div>
              <p className="mt-2 break-keep text-sm leading-relaxed text-[#9aa8b3]">
                성공하면 Riot 계정이 장기 연동됩니다. 이후 토큰은 만료될 때마다 자동으로 갱신되며 재연동 팝업이 뜨지 않습니다.
              </p>
            </li>
          </ol>
        </section>

        <section className="val-card p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-black text-white">Riot Cookie 값</label>
              <textarea
                value={authInput}
                onChange={(event) => {
                  setAuthInput(event.target.value);
                  if (state === "error") setState("idle");
                }}
                rows={8}
                required
                disabled={state === "loading"}
                placeholder="ssid=...; clid=...; csid=... 또는 Cookie: ssid=...; clid=...; csid=..."
                className="w-full resize-none rounded border border-[#2a3540] bg-[#0f1923] px-4 py-3 font-mono text-sm text-white placeholder:text-[#465766] focus:border-[#7fffe6] focus:outline-none"
              />
              <p className="mt-2 break-keep text-xs leading-relaxed text-[#7b8a96]">
                Cookie에는 로그인 세션이 들어 있습니다. 테스트 목적 외에 다른 곳에 공유하지 마세요.
              </p>
            </div>

            {message && (
              <div
                className={`rounded border px-4 py-3 text-sm font-bold ${
                  state === "success"
                    ? "border-[#00e7c2]/40 bg-[#00e7c2]/10 text-[#7fffe6]"
                    : "border-[#ff4655]/40 bg-[#ff4655]/10 text-[#ff8b95]"
                }`}
              >
                <div>{message}</div>
                {riotId && (
                  <div className="mt-2 text-white">
                    {region ? `${region} / ` : ""}
                    {riotId}
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={state === "loading" || !authInput.trim()}
              className="val-btn w-full bg-[#ff4655] py-3 text-sm font-black text-white hover:bg-[#cc3644] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state === "loading" ? <LoadingLabel /> : "SSID 연동 테스트"}
            </button>
          </form>
        </section>
      </div>

      <section className="val-card p-5">
        <div className="text-sm font-black text-white">테스트 기준</div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded border border-[#2a3540] bg-[#0f1923] p-4">
            <div className="text-xs font-black text-[#7fffe6]">성공</div>
            <p className="mt-2 text-sm leading-relaxed text-[#9aa8b3]">Riot 토큰 발급, 계정 조회, DB 저장까지 완료된 상태입니다.</p>
          </div>
          <div className="rounded border border-[#2a3540] bg-[#0f1923] p-4">
            <div className="text-xs font-black text-[#f6c945]">실패</div>
            <p className="mt-2 text-sm leading-relaxed text-[#9aa8b3]">SSID가 만료됐거나 쿠키 일부가 빠졌거나 Riot 보안 정책상 재발급이 막힌 상태입니다.</p>
          </div>
          <div className="rounded border border-[#2a3540] bg-[#0f1923] p-4">
            <div className="text-xs font-black text-[#ff8b95]">주의</div>
            <p className="mt-2 text-sm leading-relaxed text-[#9aa8b3]">이 기능은 테스트용입니다. 결과가 안정적이면 기존 연동 UX에 반영합니다.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
