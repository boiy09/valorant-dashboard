"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Browser = "chrome" | "firefox" | "edge";

const BROWSER_STEPS: Record<Browser, { label: string; steps: { title: string; desc: string; hint?: string }[] }> = {
  chrome: {
    label: "Chrome",
    steps: [
      {
        title: "auth.riotgames.com 방문 (필수!)",
        desc: "아래 버튼을 클릭해 auth.riotgames.com으로 이동하세요. 로그인이 안 된 경우 로그인하고, 이미 된 경우엔 자동으로 다른 페이지로 이동합니다. ssid 쿠키는 반드시 이 주소를 통해야 생성됩니다.",
        hint: "account.riotgames.com이 아닌 auth.riotgames.com이어야 합니다.",
      },
      {
        title: "개발자 도구 열기",
        desc: "키보드에서 F12 를 누르거나, 페이지 빈 곳에서 마우스 오른쪽 클릭 → '검사' 를 선택하세요.",
        hint: "화면 오른쪽 또는 하단에 개발자 도구 창이 열립니다.",
      },
      {
        title: "Application 탭 클릭",
        desc: "개발자 도구 상단 탭 메뉴에서 'Application' 탭을 클릭하세요.",
        hint: "탭이 보이지 않으면 탭 오른쪽 끝의 '>>' 버튼을 눌러 더 보기에서 찾으세요.",
      },
      {
        title: "Cookies 펼치기 → auth.riotgames.com 클릭",
        desc: "왼쪽 사이드바 'Storage' 섹션에서 'Cookies' 왼쪽의 ▶ 화살표를 클릭해 펼치면 'https://auth.riotgames.com' 이 나타납니다. 그것을 클릭하세요.",
        hint: "Cookies를 클릭하면 아무것도 안 나와요. 반드시 왼쪽 ▶ 화살표를 눌러야 합니다.",
      },
      {
        title: "ssid 쿠키 값 복사",
        desc: "쿠키 목록에서 'ssid' 항목을 찾아 'Value' 열의 값을 더블클릭해 전체 선택 후 Ctrl+C 로 복사하세요.",
        hint: "값이 매우 길어도 전체 복사해야 합니다.",
      },
    ],
  },
  edge: {
    label: "Edge",
    steps: [
      {
        title: "auth.riotgames.com 방문 (필수!)",
        desc: "아래 버튼을 클릭해 auth.riotgames.com으로 이동하세요. 로그인이 안 된 경우 로그인하고, 이미 된 경우엔 자동으로 다른 페이지로 이동합니다. ssid 쿠키는 반드시 이 주소를 통해야 생성됩니다.",
        hint: "account.riotgames.com이 아닌 auth.riotgames.com이어야 합니다.",
      },
      {
        title: "개발자 도구 열기",
        desc: "키보드에서 F12 를 누르세요. Edge는 Chrome과 동일한 개발자 도구를 사용합니다.",
      },
      {
        title: "Application 탭 클릭",
        desc: "상단 탭에서 'Application' 탭을 클릭하세요.",
        hint: "탭이 보이지 않으면 '>>' 버튼을 눌러 더 보기에서 찾으세요.",
      },
      {
        title: "Cookies 펼치기 → auth.riotgames.com 클릭",
        desc: "왼쪽 사이드바 'Cookies' 왼쪽의 ▶ 화살표를 클릭해 펼치면 'https://auth.riotgames.com' 이 나타납니다. 그것을 클릭하세요.",
        hint: "Cookies를 클릭하면 아무것도 안 나와요. 반드시 왼쪽 ▶ 화살표를 눌러야 합니다.",
      },
      {
        title: "ssid 쿠키 값 복사",
        desc: "목록에서 'ssid' 항목의 'Value' 값을 더블클릭 → 전체 선택 → Ctrl+C 로 복사하세요.",
        hint: "값이 매우 길어도 전체 복사해야 합니다.",
      },
    ],
  },
  firefox: {
    label: "Firefox",
    steps: [
      {
        title: "auth.riotgames.com 방문 (필수!)",
        desc: "아래 버튼을 클릭해 auth.riotgames.com으로 이동하세요. 로그인이 안 된 경우 로그인하고, 이미 된 경우엔 자동으로 다른 페이지로 이동합니다. ssid 쿠키는 반드시 이 주소를 통해야 생성됩니다.",
        hint: "account.riotgames.com이 아닌 auth.riotgames.com이어야 합니다.",
      },
      {
        title: "개발자 도구 열기",
        desc: "키보드에서 F12 를 누르세요.",
      },
      {
        title: "저장소 탭 클릭",
        desc: "개발자 도구 상단에서 '저장소 (Storage)' 탭을 클릭하세요.",
        hint: "영문 Firefox는 'Storage' 탭입니다.",
      },
      {
        title: "쿠키 펼치기 → https://auth.riotgames.com 클릭",
        desc: "왼쪽 사이드바에서 '쿠키 (Cookies)' 왼쪽의 ▶ 화살표를 클릭해 펼치면 'https://auth.riotgames.com' 이 나타납니다. 그것을 클릭하세요.",
        hint: "쿠키를 클릭하면 아무것도 안 나와요. 반드시 왼쪽 ▶ 화살표를 눌러야 합니다.",
      },
      {
        title: "ssid 쿠키 값 복사",
        desc: "목록에서 'ssid' 항목을 클릭하면 아래에 값이 표시됩니다. 값 전체를 드래그 → Ctrl+C 로 복사하세요.",
        hint: "값이 매우 길어도 전체 복사해야 합니다.",
      },
    ],
  },
};

export default function RiotConnectPage() {
  const router = useRouter();
  const [browser, setBrowser] = useState<Browser>("chrome");
  const [ssid, setSsid] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [riotId, setRiotId] = useState("");

  const selected = BROWSER_STEPS[browser];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/riot/auth/ssid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ssid: ssid.trim() }),
      });
      const data = await res.json() as { error?: string; account?: { riotId: string } };

      if (!res.ok) {
        setErrorMsg(data.error ?? "연동에 실패했습니다.");
        setState("error");
      } else {
        setRiotId(data.account?.riotId ?? "");
        setState("success");
      }
    } catch {
      setErrorMsg("네트워크 오류가 발생했습니다.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="max-w-lg mx-auto">
        <div className="val-card p-8 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <div className="text-white text-xl font-bold mb-2">연동 완료!</div>
          <div className="text-[#7b8a96] text-sm mb-1">성공적으로 연결된 계정:</div>
          <div className="text-[#ff4655] font-bold text-lg mb-6">{riotId}</div>
          <button
            onClick={() => router.push("/dashboard")}
            className="val-btn bg-[#ff4655] text-white font-bold px-8 py-2.5 text-sm"
          >
            대시보드로 이동
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* 헤더 */}
      <div className="val-card p-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="text-[#ff4655] text-xs tracking-widest uppercase">라이엇 계정 연동</div>
          <div className="flex-1 h-px bg-[#2a3540]" />
        </div>
        <h1 className="text-white text-xl font-bold">쿠키 방식으로 연동하기</h1>
        <p className="text-[#7b8a96] text-sm mt-1">
          비밀번호 없이 안전하게 연동할 수 있습니다. 아래 안내를 따라 ssid 쿠키를 복사해 붙여넣으세요.
        </p>
        <div className="mt-3 flex gap-4 text-xs text-[#7b8a96]">
          <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> 비밀번호 전송 없음</span>
          <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> 수개월간 유효</span>
          <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Riot 공식 세션 토큰</span>
        </div>
      </div>

      {/* 브라우저 선택 */}
      <div className="val-card p-5">
        <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">사용 중인 브라우저 선택</div>
        <div className="flex gap-2">
          {(["chrome", "edge", "firefox"] as Browser[]).map((b) => (
            <button
              key={b}
              onClick={() => setBrowser(b)}
              className={`px-4 py-2 text-sm rounded border transition-colors ${
                browser === b
                  ? "border-[#ff4655] bg-[#ff4655]/10 text-white font-bold"
                  : "border-[#2a3540] text-[#7b8a96] hover:border-[#7b8a96]"
              }`}
            >
              {BROWSER_STEPS[b].label}
            </button>
          ))}
        </div>
      </div>

      {/* 단계별 가이드 */}
      <div className="val-card p-5">
        <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-4">단계별 안내 ({selected.label})</div>

        <div className="space-y-0">
          {selected.steps.map((step, i) => (
            <div key={i} className="flex gap-4">
              {/* 스텝 번호 + 연결선 */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
                  i === 0 ? "border-[#ff4655] bg-[#ff4655]/10 text-[#ff4655]"
                  : "border-[#2a3540] bg-[#0f1923] text-[#7b8a96]"
                }`}>
                  {i + 1}
                </div>
                {i < selected.steps.length - 1 && (
                  <div className="w-px flex-1 bg-[#2a3540] my-1" style={{ minHeight: "24px" }} />
                )}
              </div>

              {/* 내용 */}
              <div className={`pb-6 flex-1 ${i === selected.steps.length - 1 ? "pb-0" : ""}`}>
                <div className="text-white font-semibold text-sm mb-1">{step.title}</div>
                <div className="text-[#7b8a96] text-sm leading-relaxed">{step.desc}</div>
                {step.hint && (
                  <div className="mt-1.5 text-xs text-[#ff4655]/70 bg-[#ff4655]/5 border border-[#ff4655]/20 rounded px-2.5 py-1.5">
                    💡 {step.hint}
                  </div>
                )}

                {/* Step 1 전용: Riot 로그인 버튼 */}
                {i === 0 && (
                  <a
                    href="https://auth.riotgames.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-[#ff4655] hover:bg-[#cc3644] text-white text-xs font-bold rounded transition-colors"
                  >
                    🔗 Riot 로그인 페이지 열기
                  </a>
                )}

                {/* Step 2 전용: 단축키 표시 */}
                {i === 1 && (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <span className="px-3 py-1 bg-[#0f1923] border border-[#2a3540] rounded text-white text-xs font-mono">F12</span>
                    <span className="text-[#7b8a96] text-xs self-center">또는</span>
                    <span className="px-3 py-1 bg-[#0f1923] border border-[#2a3540] rounded text-white text-xs font-mono">Ctrl + Shift + I</span>
                    {browser === "firefox" && (
                      <>
                        <span className="text-[#7b8a96] text-xs self-center">또는</span>
                        <span className="px-3 py-1 bg-[#0f1923] border border-[#2a3540] rounded text-white text-xs font-mono">Ctrl + Shift + E</span>
                      </>
                    )}
                  </div>
                )}

                {/* Step 3 전용: 탭 시각화 */}
                {i === 2 && (
                  <div className="mt-2 flex gap-1 overflow-x-auto">
                    {(browser === "firefox"
                      ? ["검사기", "콘솔", "디버거", "네트워크", "저장소 ◀", "접근성", "성능"]
                      : ["Elements", "Console", "Sources", "Network", browser === "chrome" || browser === "edge" ? "Application ◀" : "Application ◀", "Performance"]
                    ).map((tab) => (
                      <span
                        key={tab}
                        className={`px-2.5 py-1 text-xs rounded-t border whitespace-nowrap ${
                          tab.includes("◀")
                            ? "border-[#ff4655] bg-[#ff4655]/10 text-[#ff4655] font-bold"
                            : "border-[#2a3540] text-[#7b8a96]"
                        }`}
                      >
                        {tab.replace(" ◀", "")}
                        {tab.includes("◀") && <span className="ml-1 text-[#ff4655]">◀</span>}
                      </span>
                    ))}
                  </div>
                )}

                {/* Step 4 전용: 사이드바 시각화 (실제 Chrome DevTools 구조) */}
                {i === 3 && (
                  <div className="mt-2 bg-[#242424] border border-[#3a3a3a] rounded p-3 text-xs font-mono w-72 text-[#d4d4d4]">
                    <div className="text-[#9cdcfe] mb-1">Storage</div>
                    <div className="ml-2 text-[#9cdcfe]">▸ Local storage</div>
                    <div className="ml-2 text-[#9cdcfe]">▸ Session storage</div>
                    <div className="ml-2 text-[#9cdcfe]">▸ IndexedDB</div>
                    <div className="ml-2 flex items-center gap-1 text-[#9cdcfe] font-bold">
                      <span>▾ Cookies</span>
                      <span className="text-[#ff4655] text-[10px] ml-1">← 화살표 클릭</span>
                    </div>
                    <div className="ml-5 bg-[#ff4655]/20 border border-[#ff4655]/50 rounded px-2 py-0.5 text-[#ff4655] font-bold">
                      https://auth.riotgames.com ◀ 클릭!
                    </div>
                    <div className="ml-2 text-[#9cdcfe] mt-1">▸ Private state tokens</div>
                  </div>
                )}

                {/* Step 5 전용: 쿠키 테이블 시각화 */}
                {i === 4 && (
                  <div className="mt-2 bg-[#0f1923] border border-[#2a3540] rounded overflow-hidden text-xs font-mono">
                    <div className="grid grid-cols-3 bg-[#1a242d] text-[#7b8a96] px-3 py-1.5 border-b border-[#2a3540]">
                      <span>Name</span><span>Value</span><span>Domain</span>
                    </div>
                    <div className="grid grid-cols-3 px-3 py-1.5 text-[#7b8a96] border-b border-[#2a3540]">
                      <span>asid</span><span className="truncate">eyJ...</span><span>.riotgames.com</span>
                    </div>
                    <div className="grid grid-cols-3 px-3 py-1.5 bg-[#ff4655]/10 border border-[#ff4655]/30 text-white">
                      <span className="font-bold text-[#ff4655]">ssid</span>
                      <span className="truncate text-[#ff4655]">eyJh... ◀ 복사!</span>
                      <span>.riotgames.com</span>
                    </div>
                    <div className="grid grid-cols-3 px-3 py-1.5 text-[#7b8a96]">
                      <span>clid</span><span className="truncate">riot...</span><span>.riotgames.com</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ssid 입력 폼 */}
      <div className="val-card p-5">
        <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">복사한 ssid 붙여넣기</div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-white text-sm font-medium block mb-1.5">
              ssid 쿠키 값
            </label>
            <textarea
              value={ssid}
              onChange={(e) => { setSsid(e.target.value); setState("idle"); }}
              placeholder="복사한 ssid 값을 여기에 붙여넣으세요 (Ctrl+V)"
              rows={3}
              className="w-full px-3 py-2.5 text-xs text-white bg-[#0f1923] border border-[#2a3540] rounded focus:outline-none focus:border-[#ff4655] resize-none font-mono placeholder:text-[#3a4a55]"
              required
              disabled={state === "loading"}
            />
            <div className="mt-1 text-[#7b8a96] text-[11px]">
              값이 길어도 괜찮아요. eyJh... 로 시작하는 긴 문자열입니다.
            </div>
          </div>

          {state === "error" && (
            <div className="flex items-start gap-2 bg-[#ff4655]/10 border border-[#ff4655]/30 rounded px-3 py-2.5">
              <span className="text-[#ff4655] text-sm flex-shrink-0">⚠</span>
              <div>
                <div className="text-[#ff4655] text-sm font-medium">{errorMsg}</div>
                <div className="text-[#ff4655]/70 text-xs mt-0.5">
                  ssid 값이 만료됐을 수 있어요. Riot에 다시 로그인 후 새 ssid를 복사해 주세요.
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={state === "loading" || !ssid.trim()}
            className="w-full val-btn bg-[#ff4655] hover:bg-[#cc3644] text-white font-bold py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {state === "loading" ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-1 h-1 rounded-full bg-white animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1 h-1 rounded-full bg-white animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1 h-1 rounded-full bg-white animate-bounce" style={{ animationDelay: "300ms" }} />
                <span>연동 중...</span>
              </span>
            ) : "라이엇 계정 연동하기"}
          </button>
        </form>
      </div>

      {/* 자주 묻는 질문 */}
      <div className="val-card p-5">
        <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">자주 묻는 질문</div>
        <div className="space-y-3">
          {[
            {
              q: "비밀번호는 안전한가요?",
              a: "이 방식은 비밀번호를 전혀 사용하지 않습니다. ssid는 Riot이 발급한 세션 토큰으로, 비밀번호와는 다릅니다.",
            },
            {
              q: "Application 탭이 보이지 않아요.",
              a: "개발자 도구 상단 탭 오른쪽의 '>>' 버튼을 클릭하면 숨겨진 탭들이 나타납니다.",
            },
            {
              q: "ssid가 목록에 없어요.",
              a: "auth.riotgames.com 에서 로그인 후 1~2초 기다린 뒤 다시 확인해 보세요. 페이지를 새로고침하지 마세요.",
            },
            {
              q: "얼마나 자주 다시 연동해야 하나요?",
              a: "ssid는 수개월간 유효합니다. 만료되면 '인증 필요' 상태로 표시되며, 그때 다시 연동하면 됩니다.",
            },
          ].map(({ q, a }) => (
            <div key={q} className="border-b border-[#2a3540] pb-3 last:border-0 last:pb-0">
              <div className="text-white text-sm font-medium mb-1">Q. {q}</div>
              <div className="text-[#7b8a96] text-sm">A. {a}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
