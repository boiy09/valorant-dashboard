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

type Method = "url" | "ssid";
type FormState = "idle" | "loading" | "success" | "error";

function regionLabel(value: "KR" | "AP" | "") {
  if (value === "KR") return "한국 서버";
  if (value === "AP") return "아시아 서버";
  return "";
}

function LoadingDots() {
  return (
    <span className="flex items-center justify-center gap-2">
      <span className="w-1 h-1 rounded-full bg-white animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="w-1 h-1 rounded-full bg-white animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="w-1 h-1 rounded-full bg-white animate-bounce" style={{ animationDelay: "300ms" }} />
      <span>연동 중...</span>
    </span>
  );
}

export default function RiotConnectPage() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("url");

  // URL 방식 상태
  const [url, setUrl] = useState("");
  const [urlState, setUrlState] = useState<FormState>("idle");
  const [urlError, setUrlError] = useState("");
  const [urlRegion, setUrlRegion] = useState<"KR" | "AP">("KR");

  // ssid 방식 상태
  const [ssid, setSsid] = useState("");
  const [ssidState, setSsidState] = useState<FormState>("idle");
  const [ssidError, setSsidError] = useState("");

  // 공통 성공 상태
  const [riotId, setRiotId] = useState("");
  const [connectedRegion, setConnectedRegion] = useState<"KR" | "AP" | "">("");

  const isSuccess = urlState === "success" || ssidState === "success";

  async function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    setUrlState("loading");
    setUrlError("");
    try {
      const res = await fetch("/api/riot/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), region: urlRegion }),
      });
      const data = await res.json() as { error?: string; account?: { riotId: string; region: "KR" | "AP" } };
      if (!res.ok) {
        setUrlError(data.error ?? "연동에 실패했습니다.");
        setUrlState("error");
      } else {
        setRiotId(data.account?.riotId ?? "");
        setConnectedRegion(data.account?.region ?? "");
        window.dispatchEvent(new Event("riot-accounts-updated"));
        setUrlState("success");
      }
    } catch {
      setUrlError("네트워크 오류가 발생했습니다.");
      setUrlState("error");
    }
  }

  async function handleSsidSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSsidState("loading");
    setSsidError("");
    try {
      const res = await fetch("/api/riot/auth/ssid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ssid: ssid.trim() }),
      });
      const data = await res.json() as { error?: string; account?: { riotId: string; region: "KR" | "AP" } };
      if (!res.ok) {
        setSsidError(data.error ?? "연동에 실패했습니다.");
        setSsidState("error");
      } else {
        setRiotId(data.account?.riotId ?? "");
        setConnectedRegion(data.account?.region ?? "");
        window.dispatchEvent(new Event("riot-accounts-updated"));
        setSsidState("success");
      }
    } catch {
      setSsidError("네트워크 오류가 발생했습니다.");
      setSsidState("error");
    }
  }

  if (isSuccess) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="val-card p-8 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <div className="text-white text-xl font-bold mb-2">연동 완료!</div>
          <div className="text-[#7b8a96] text-sm mb-1">성공적으로 연결된 계정:</div>
          <div className="text-[#ff4655] font-bold text-lg mb-2">{riotId}</div>
          {connectedRegion && (
            <div className="text-green-400 text-xs font-bold mb-2">
              {connectedRegion} · {regionLabel(connectedRegion)}
            </div>
          )}
          {ssidState === "success" && (
            <div className="mb-6 text-xs text-green-400 bg-green-400/10 border border-green-400/20 rounded px-3 py-2">
              ssid 저장 완료 — 토큰이 만료돼도 자동으로 갱신됩니다.
            </div>
          )}
          {urlState === "success" && (
            <div className="mb-6 text-xs text-[#7b8a96] bg-[#1a2530] border border-[#2a3540] rounded px-3 py-2">
              URL 방식으로 연동됐습니다. 약 55분 후 만료 시 다시 연동이 필요합니다.<br />
              자동 갱신을 원하면 <button onClick={() => { setUrlState("idle"); setMethod("ssid"); }} className="text-[#ff4655] underline">ssid 방식으로 추가 설정</button>하세요.
            </div>
          )}
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
    <div className="max-w-3xl mx-auto space-y-5">
      {/* 헤더 */}
      <div className="val-card p-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="text-[#ff4655] text-xs tracking-widest uppercase">라이엇 계정 연동</div>
          <div className="flex-1 h-px bg-[#2a3540]" />
        </div>
        <h1 className="text-white text-xl font-bold">비밀번호 없이 연동하기</h1>
        <p className="text-[#9aa8b3] text-base mt-2 leading-relaxed">
          Riot 로그인 후 보이는 404 페이지는 오류가 아닙니다. 주소창 URL을 복사해 붙여넣으면 연동됩니다.
        </p>

        {/* 방식 탭 */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => setMethod("url")}
            className={`rounded border px-4 py-3 text-left transition-colors ${
              method === "url"
                ? "border-[#ff4655] bg-[#ff4655]/10"
                : "border-[#2a3540] hover:border-[#ff4655]/40"
            }`}
          >
            <div className={`text-sm font-bold ${method === "url" ? "text-white" : "text-[#7b8a96]"}`}>
              URL 방식
            </div>
            <div className="text-[10px] text-[#7b8a96] mt-0.5">간단 · 개발자 도구 불필요</div>
            <div className="text-[10px] text-[#ff4655]/70 mt-0.5">55분 후 만료, 재연동 필요</div>
          </button>
          <button
            onClick={() => setMethod("ssid")}
            className={`relative rounded border px-4 py-3 text-left opacity-55 grayscale transition-colors ${
              method === "ssid"
                ? "border-[#0ac8b9] bg-[#0ac8b9]/10"
                : "border-[#2a3540] hover:border-[#0ac8b9]/40"
            }`}
          >
            <span className="absolute right-3 top-3 rounded bg-[#ffb84d]/15 px-2 py-0.5 text-[10px] font-black text-[#ffb84d]">
              개발중
            </span>
            <div className={`text-sm font-bold ${method === "ssid" ? "text-white" : "text-[#7b8a96]"}`}>
              ssid 방식
            </div>
            <div className="text-[10px] text-[#7b8a96] mt-0.5">개발자 도구 필요</div>
            <div className="text-[10px] text-green-400 mt-0.5">자동 갱신 · 몇 주~몇 달 유효</div>
          </button>
        </div>
      </div>

      {/* URL 방식 */}
      {method === "url" && (
        <>
          <div className="val-card p-5">
            <div className="text-[#ff4655] text-base font-black tracking-widest uppercase mb-5">단계별 안내</div>
            <div className="space-y-0">
              <div className="flex gap-4">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 border-[#ff4655] bg-[#ff4655]/10 text-[#ff4655]">1</div>
                  <div className="w-px flex-1 bg-[#2a3540] my-1" style={{ minHeight: "24px" }} />
                </div>
                <div className="pb-6 flex-1">
                  <div className="text-white font-semibold text-lg mb-2">아래 버튼을 클릭해 로그인</div>
                  <div className="text-[#9aa8b3] text-base leading-relaxed">
                    버튼을 클릭하면 Riot 로그인 페이지가 열립니다. 연동할 서버의 Riot 계정으로 로그인하세요.
                  </div>
                  <div className="mt-2 text-sm text-[#ff8a94] bg-[#ff4655]/5 border border-[#ff4655]/20 rounded px-3 py-2">
                    💡 이미 다른 Riot 계정으로 로그인되어 있으면 바로 404 페이지로 이동될 수 있습니다. 그 경우 Riot에서 로그아웃하거나 시크릿 창에서 다시 진행하세요.
                  </div>
                  <a
                    href={RIOT_LOGIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-[#ff4655] hover:bg-[#cc3644] text-white text-xs font-bold rounded transition-colors"
                  >
                    🔗 Riot 로그인 페이지 열기
                  </a>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 border-[#2a3540] bg-[#0f1923] text-[#7b8a96]">2</div>
                  <div className="w-px flex-1 bg-[#2a3540] my-1" style={{ minHeight: "24px" }} />
                </div>
                <div className="pb-6 flex-1">
                  <div className="text-white font-semibold text-lg mb-2">이동된 페이지 주소 전체 복사</div>
                  <div className="text-[#9aa8b3] text-base leading-relaxed">
                    로그인 후 <span className="text-white font-medium">playvalorant.com</span> 페이지로 이동됩니다 (404 오류 화면이 뜨는 게 정상입니다). 브라우저 주소창의 URL 전체를 <span className="text-white font-medium">Ctrl+A → Ctrl+C</span> 로 복사하세요.
                  </div>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 border-[#2a3540] bg-[#0f1923] text-[#7b8a96]">3</div>
                </div>
                <div className="flex-1">
                  <div className="text-white font-semibold text-lg mb-2">아래 입력창에 붙여넣기</div>
                  <div className="text-[#9aa8b3] text-base">복사한 URL을 붙여넣고 연동하기 버튼을 클릭하세요.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="val-card p-5">
            <div className="text-[#ff4655] text-base font-black tracking-widest uppercase mb-4">복사한 URL 붙여넣기</div>
            <form onSubmit={handleUrlSubmit} className="space-y-3">
              <div>
                <label className="text-white text-base font-bold block mb-2">연동할 서버</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["KR", "AP"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setUrlRegion(value)}
                      disabled={urlState === "loading"}
                      className={`rounded border px-3 py-2 text-xs font-bold transition-colors ${
                        urlRegion === value
                          ? "border-[#ff4655] bg-[#ff4655]/10 text-white"
                          : "border-[#2a3540] text-[#7b8a96] hover:border-[#ff4655]/60 hover:text-white"
                      }`}
                    >
                      {value} · {regionLabel(value)}
                    </button>
                  ))}
                </div>
                <div className="mt-1 text-[#7b8a96] text-[11px]">자동 감지가 막히는 경우 선택한 서버로 저장됩니다.</div>
              </div>
              <div>
                <label className="text-white text-base font-bold block mb-2">playvalorant.com URL</label>
                <textarea
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setUrlState("idle"); }}
                  placeholder="https://playvalorant.com/ko-kr/opt_in/#access_token=eyJ... 를 여기에 붙여넣으세요"
                  rows={4}
                  className="w-full px-4 py-3 text-sm text-white bg-[#0f1923] border border-[#2a3540] rounded focus:outline-none focus:border-[#ff4655] resize-none font-mono placeholder:text-[#3a4a55]"
                  required
                  disabled={urlState === "loading"}
                />
              </div>
              {urlState === "error" && (
                <div className="flex items-start gap-2 bg-[#ff4655]/10 border border-[#ff4655]/30 rounded px-3 py-2.5">
                  <span className="text-[#ff4655] text-sm flex-shrink-0">⚠</span>
                  <div>
                    <div className="text-[#ff4655] text-sm font-medium">{urlError}</div>
                    <div className="text-[#ff4655]/70 text-xs mt-0.5">URL 전체를 복사했는지, 서버 선택이 맞는지 확인해 주세요.</div>
                  </div>
                </div>
              )}
              <button
                type="submit"
                disabled={urlState === "loading" || !url.trim()}
                className="w-full val-btn bg-[#ff4655] hover:bg-[#cc3644] text-white font-bold py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {urlState === "loading" ? <LoadingDots /> : "라이엇 계정 연동하기"}
              </button>
            </form>
          </div>
        </>
      )}

      {/* ssid 방식 */}
      {method === "ssid" && (
        <>
          <div className="val-card p-5">
            <div className="mb-4 rounded border border-[#ffb84d]/25 bg-[#ffb84d]/10 px-4 py-3 text-sm font-bold text-[#ffb84d]">
              SSID 방식은 개발중입니다. 내부 테스트를 위해 입력 기능은 유지되어 있습니다.
            </div>
            <div className="text-[#7b8a96] text-sm tracking-widest uppercase mb-4">단계별 안내</div>
            <div className="space-y-0">
              <div className="flex gap-4">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 border-[#0ac8b9] bg-[#0ac8b9]/10 text-[#0ac8b9]">1</div>
                  <div className="w-px flex-1 bg-[#2a3540] my-1" style={{ minHeight: "24px" }} />
                </div>
                <div className="pb-6 flex-1">
                  <div className="text-white font-semibold text-sm mb-1">Riot 로그인 페이지에서 로그인</div>
                  <div className="text-[#7b8a96] text-sm leading-relaxed">
                    아래 버튼을 클릭해 Riot 계정으로 로그인하세요. 로그인 후 ssid 쿠키가 브라우저에 저장됩니다.
                  </div>
                  <a
                    href={RIOT_LOGIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-[#0ac8b9] hover:bg-[#0ac8b9]/80 text-[#0f1923] text-xs font-bold rounded transition-colors"
                  >
                    🔗 Riot 로그인 페이지 열기
                  </a>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 border-[#2a3540] bg-[#0f1923] text-[#7b8a96]">2</div>
                  <div className="w-px flex-1 bg-[#2a3540] my-1" style={{ minHeight: "24px" }} />
                </div>
                <div className="pb-6 flex-1">
                  <div className="text-white font-semibold text-sm mb-1">개발자 도구 Network 탭에서 쿠키 전체 복사</div>
                  <div className="text-[#7b8a96] text-sm leading-relaxed mb-2">
                    로그인 후 <span className="text-white font-medium">auth.riotgames.com</span> 요청의 Cookie 헤더를 복사해야 합니다.
                  </div>
                  <ol className="text-[#7b8a96] text-xs space-y-1.5 list-none">
                    <li className="flex gap-2"><span className="text-[#0ac8b9] font-bold flex-shrink-0">1.</span><span><span className="text-white font-bold">F12</span>으로 개발자 도구 열기 → <span className="text-white font-bold">Network</span> 탭 클릭</span></li>
                    <li className="flex gap-2"><span className="text-[#0ac8b9] font-bold flex-shrink-0">2.</span><span>필터 입력창에 <span className="text-white font-bold">auth.riotgames.com</span> 입력</span></li>
                    <li className="flex gap-2"><span className="text-[#0ac8b9] font-bold flex-shrink-0">3.</span><span>Riot 로그인 페이지를 새로고침하거나 로그인 재시도</span></li>
                    <li className="flex gap-2"><span className="text-[#0ac8b9] font-bold flex-shrink-0">4.</span><span>목록에서 <span className="text-white font-bold">auth.riotgames.com</span> 요청 하나 클릭</span></li>
                    <li className="flex gap-2"><span className="text-[#0ac8b9] font-bold flex-shrink-0">5.</span><span><span className="text-white font-bold">Request Headers</span> → <span className="text-[#0ac8b9] font-bold">Cookie:</span> 항목 찾기</span></li>
                    <li className="flex gap-2"><span className="text-[#0ac8b9] font-bold flex-shrink-0">6.</span><span>Cookie 값 전체를 <span className="text-white font-bold">우클릭 → Copy value</span> 또는 드래그 후 복사</span></li>
                  </ol>
                  <div className="mt-3 bg-[#0f1923] border border-[#2a3540] rounded px-3 py-2 text-[11px] font-mono overflow-hidden">
                    <span className="text-[#7b8a96]">Cookie: </span>
                    <span className="text-[#0ac8b9] font-bold">ssid=eyJ...; sub=afafa...; tdid=eyJ...; csid=OrSpr...</span>
                  </div>
                  <div className="mt-2 text-[10px] text-[#7b8a96] bg-[#0ac8b9]/5 border border-[#0ac8b9]/20 rounded px-2.5 py-1.5">
                    💡 ssid 하나만으론 안 됩니다. Cookie 헤더의 <span className="text-white">전체 문자열</span>을 복사해야 자동 갱신이 가능합니다.
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 border-[#2a3540] bg-[#0f1923] text-[#7b8a96]">3</div>
                </div>
                <div className="flex-1">
                  <div className="text-white font-semibold text-sm mb-1">아래 입력창에 붙여넣기</div>
                  <div className="text-[#7b8a96] text-sm">복사한 ssid 값을 붙여넣고 연동하기 버튼을 클릭하세요.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="val-card p-5">
            <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">ssid 쿠키 붙여넣기</div>
            <form onSubmit={handleSsidSubmit} className="space-y-3">
              <div>
                <label className="text-white text-sm font-medium block mb-1.5">Cookie 헤더 전체 값</label>
                <textarea
                  value={ssid}
                  onChange={(e) => { setSsid(e.target.value); setSsidState("idle"); }}
                  placeholder="ssid=eyJ...; sub=afafa29f...; tdid=eyJ...; csid=OrSpr..."
                  rows={3}
                  className="w-full px-3 py-2.5 text-xs text-white bg-[#0f1923] border border-[#2a3540] rounded focus:outline-none focus:border-[#0ac8b9] resize-none font-mono placeholder:text-[#3a4a55]"
                  required
                  disabled={ssidState === "loading"}
                />
                <div className="mt-1 text-[#7b8a96] text-[11px]">
                  Network 탭 Request Headers의 <span className="text-[#0ac8b9]">Cookie:</span> 값 전체를 붙여넣으세요. ssid 하나만 붙여넣으면 작동하지 않습니다.
                </div>
              </div>
              {ssidState === "error" && (
                <div className="flex items-start gap-2 bg-[#ff4655]/10 border border-[#ff4655]/30 rounded px-3 py-2.5">
                  <span className="text-[#ff4655] text-sm flex-shrink-0">⚠</span>
                  <div>
                    <div className="text-[#ff4655] text-sm font-medium">{ssidError}</div>
                    <div className="text-[#ff4655]/70 text-xs mt-0.5">ssid 값이 올바른지, auth.riotgames.com 쿠키에서 복사했는지 확인해 주세요.</div>
                  </div>
                </div>
              )}
              <button
                type="submit"
                disabled={ssidState === "loading" || !ssid.trim()}
                className="w-full val-btn bg-[#0ac8b9] hover:bg-[#0ac8b9]/80 text-[#0f1923] font-bold py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {ssidState === "loading" ? <LoadingDots /> : "라이엇 계정 연동하기 (자동 갱신)"}
              </button>
            </form>
          </div>
        </>
      )}

      {/* 자주 묻는 질문 */}
      <div className="val-card p-5">
        <div className="text-[#ff4655] text-base font-black tracking-widest uppercase mb-4">자주 묻는 질문</div>
        <div className="space-y-3">
          {[
            {
              q: "URL 방식과 ssid 방식의 차이는?",
              a: "URL 방식은 개발자 도구 없이 간단하게 연동할 수 있지만 약 55분 후 토큰이 만료돼 재연동이 필요합니다. ssid 방식은 개발자 도구가 필요하지만 ssid 쿠키가 저장되어 만료 시 자동으로 갱신됩니다 (몇 주~몇 달 유효).",
            },
            {
              q: "한섭 연동 후 아섭을 연동하려는데 바로 404 페이지가 떠요.",
              a: "브라우저에 한섭 Riot 로그인 세션이 남아 있어서 그렇습니다. Riot 계정에서 로그아웃한 뒤 다시 열거나, 시크릿 창에서 이 페이지를 열고 AP · 아시아 서버를 선택해 진행하세요.",
            },
            {
              q: "404 오류 페이지가 뜨는데 맞나요?",
              a: "네, 정상입니다! playvalorant.com/opt_in 페이지는 원래 없는 페이지입니다. 중요한 건 주소창에 있는 URL입니다.",
            },
            {
              q: "비밀번호는 안전한가요?",
              a: "이 방식은 비밀번호를 저장하거나 전송하지 않습니다. URL에 포함된 임시 인증 토큰 또는 ssid 쿠키만 사용합니다.",
            },
            {
              q: "ssid 쿠키가 Application 탭에 안 보여요.",
              a: "로그인 후 auth.riotgames.com 탭이 열려 있는 상태에서 개발자 도구를 열어야 합니다. 또는 로그인 페이지를 한 번 더 열고 시도해 보세요.",
            },
          ].map(({ q, a }) => (
            <div key={q} className="border-b border-[#2a3540] pb-3 last:border-0 last:pb-0">
              <div className="text-white text-base font-bold mb-1.5">Q. {q}</div>
              <div className="text-[#9aa8b3] text-base leading-relaxed">A. {a}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
