"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RiotConnectPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [riotId, setRiotId] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/riot/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
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
        <h1 className="text-white text-xl font-bold">비밀번호 없이 연동하기</h1>
        <p className="text-[#7b8a96] text-sm mt-1">
          아래 버튼을 클릭해 로그인한 뒤, 이동된 페이지 주소(URL)를 복사해서 붙여넣으면 끝입니다.
        </p>
        <div className="mt-3 flex gap-4 text-xs text-[#7b8a96]">
          <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> 비밀번호 전송 없음</span>
          <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> 개발자 도구 불필요</span>
          <span className="flex items-center gap-1.5"><span className="text-green-400">✓</span> 3단계로 완료</span>
        </div>
      </div>

      {/* 단계별 가이드 */}
      <div className="val-card p-5">
        <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-4">단계별 안내</div>

        <div className="space-y-0">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 border-[#ff4655] bg-[#ff4655]/10 text-[#ff4655]">1</div>
              <div className="w-px flex-1 bg-[#2a3540] my-1" style={{ minHeight: "24px" }} />
            </div>
            <div className="pb-6 flex-1">
              <div className="text-white font-semibold text-sm mb-1">아래 버튼을 클릭해 로그인</div>
              <div className="text-[#7b8a96] text-sm leading-relaxed">
                버튼을 클릭하면 Riot 로그인 페이지가 열립니다. 아이디와 비밀번호를 입력해 로그인하세요.
              </div>
              <div className="mt-1.5 text-xs text-[#ff4655]/70 bg-[#ff4655]/5 border border-[#ff4655]/20 rounded px-2.5 py-1.5">
                💡 이미 로그인된 경우 자동으로 다음 페이지로 이동됩니다.
              </div>
              <a
                href="https://auth.riotgames.com/authorize?client_id=play-valorant-web-prod&redirect_uri=https://playvalorant.com/opt_in&response_type=token+id_token&scope=account+openid&nonce=1"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-[#ff4655] hover:bg-[#cc3644] text-white text-xs font-bold rounded transition-colors"
              >
                🔗 Riot 로그인 페이지 열기
              </a>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 border-[#2a3540] bg-[#0f1923] text-[#7b8a96]">2</div>
              <div className="w-px flex-1 bg-[#2a3540] my-1" style={{ minHeight: "24px" }} />
            </div>
            <div className="pb-6 flex-1">
              <div className="text-white font-semibold text-sm mb-1">이동된 페이지 주소 전체 복사</div>
              <div className="text-[#7b8a96] text-sm leading-relaxed">
                로그인 후 <span className="text-white font-medium">playvalorant.com</span> 페이지로 이동됩니다 (404 오류 화면이 뜨는 게 정상입니다). 브라우저 주소창의 URL 전체를 클릭 후 <span className="text-white font-medium">Ctrl+A → Ctrl+C</span> 로 복사하세요.
              </div>
              <div className="mt-1.5 text-xs text-[#ff4655]/70 bg-[#ff4655]/5 border border-[#ff4655]/20 rounded px-2.5 py-1.5">
                💡 404 오류가 뜨는 게 정상입니다! URL이 매우 길어도 전체 복사해야 합니다.
              </div>
              {/* URL 시각화 */}
              <div className="mt-3 bg-[#0f1923] border border-[#2a3540] rounded px-3 py-2 text-[11px] font-mono text-[#7b8a96] overflow-hidden">
                <span className="text-[#7b8a96]">https://playvalorant.com/ko-kr/opt_in/</span>
                <span className="text-[#ff4655] font-bold">#access_token=eyJ...</span>
                <span className="text-[#7b8a96]">&id_token=eyJ...</span>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 border-[#2a3540] bg-[#0f1923] text-[#7b8a96]">3</div>
            </div>
            <div className="pb-0 flex-1">
              <div className="text-white font-semibold text-sm mb-1">아래 입력창에 붙여넣기</div>
              <div className="text-[#7b8a96] text-sm leading-relaxed">
                복사한 URL을 아래 입력창에 붙여넣고 <span className="text-white font-medium">'연동하기'</span> 버튼을 클릭하세요.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* URL 입력 폼 */}
      <div className="val-card p-5">
        <div className="text-[#7b8a96] text-xs tracking-widests uppercase mb-3">복사한 URL 붙여넣기</div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-white text-sm font-medium block mb-1.5">
              playvalorant.com URL
            </label>
            <textarea
              value={url}
              onChange={(e) => { setUrl(e.target.value); setState("idle"); }}
              placeholder="https://playvalorant.com/ko-kr/opt_in/#access_token=eyJ... 를 여기에 붙여넣으세요"
              rows={4}
              className="w-full px-3 py-2.5 text-xs text-white bg-[#0f1923] border border-[#2a3540] rounded focus:outline-none focus:border-[#ff4655] resize-none font-mono placeholder:text-[#3a4a55]"
              required
              disabled={state === "loading"}
            />
            <div className="mt-1 text-[#7b8a96] text-[11px]">
              URL이 매우 길어도 괜찮습니다. 주소창의 내용 전체를 복사해 주세요.
            </div>
          </div>

          {state === "error" && (
            <div className="flex items-start gap-2 bg-[#ff4655]/10 border border-[#ff4655]/30 rounded px-3 py-2.5">
              <span className="text-[#ff4655] text-sm flex-shrink-0">⚠</span>
              <div>
                <div className="text-[#ff4655] text-sm font-medium">{errorMsg}</div>
                <div className="text-[#ff4655]/70 text-xs mt-0.5">
                  주소창의 URL 전체를 복사했는지 확인해 주세요. <strong>https://playvalorant.com</strong>으로 시작해야 합니다.
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={state === "loading" || !url.trim()}
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
              q: "404 오류 페이지가 뜨는데 맞나요?",
              a: "네, 정상입니다! playvalorant.com/opt_in 페이지는 원래 없는 페이지입니다. 중요한 건 주소창에 있는 URL입니다.",
            },
            {
              q: "비밀번호는 안전한가요?",
              a: "이 방식은 비밀번호를 저장하거나 전송하지 않습니다. URL에 포함된 임시 인증 토큰만 사용합니다.",
            },
            {
              q: "URL 전체를 복사하는 방법은?",
              a: "주소창을 클릭해 전체 선택(Ctrl+A)한 뒤 복사(Ctrl+C)하세요. URL이 매우 길어도 전체 복사해야 합니다.",
            },
            {
              q: "얼마나 자주 다시 연동해야 하나요?",
              a: "토큰이 만료되면 '인증 필요' 상태로 표시됩니다. 그때 다시 연동 과정을 반복하면 됩니다.",
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
