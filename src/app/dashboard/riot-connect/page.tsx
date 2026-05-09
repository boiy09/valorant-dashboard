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

function regionLabel(value: "KR" | "AP" | "") {
  if (value === "KR") return "한섭";
  if (value === "AP") return "아섭";
  return "";
}

function LoadingDots() {
  return (
    <span className="flex items-center justify-center gap-2">
      <span className="h-1 w-1 animate-bounce rounded-full bg-white" style={{ animationDelay: "0ms" }} />
      <span className="h-1 w-1 animate-bounce rounded-full bg-white" style={{ animationDelay: "150ms" }} />
      <span className="h-1 w-1 animate-bounce rounded-full bg-white" style={{ animationDelay: "300ms" }} />
      <span>연동 중...</span>
    </span>
  );
}

const faqItems = [
  {
    q: "404 페이지가 뜨는데 실패인가요?",
    a: "아닙니다. Riot 로그인 뒤 보이는 404 화면은 정상입니다. 중요한 값은 화면 내용이 아니라 브라우저 주소창의 URL 전체입니다.",
  },
  {
    q: "URL은 어느 부분까지 복사해야 하나요?",
    a: "주소창을 클릭한 뒤 Ctrl+A, Ctrl+C로 전체 주소를 복사하세요. access_token 값 일부만 복사하면 연동에 실패합니다.",
  },
  {
    q: "한섭과 아섭을 둘 다 등록할 수 있나요?",
    a: "가능합니다. 서버 선택을 KR/AP로 바꿔 각각 한 번씩 연동하면 디스코드 계정 1개에 한섭, 아섭 계정이 저장됩니다.",
  },
  {
    q: "비밀번호가 저장되나요?",
    a: "저장하지 않습니다. 비밀번호는 Riot 로그인 페이지에서만 입력하고, 대시보드는 Riot이 발급한 임시 인증 URL만 사용합니다.",
  },
];

export default function RiotConnectPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [urlState, setUrlState] = useState<FormState>("idle");
  const [urlError, setUrlError] = useState("");
  const [urlRegion, setUrlRegion] = useState<"KR" | "AP">("KR");
  const [riotId, setRiotId] = useState("");
  const [connectedRegion, setConnectedRegion] = useState<"KR" | "AP" | "">("");

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
      const data = (await res.json()) as { error?: string; account?: { riotId: string; region: "KR" | "AP" } };

      if (!res.ok) {
        setUrlError(data.error ?? "연동에 실패했습니다.");
        setUrlState("error");
        return;
      }

      setRiotId(data.account?.riotId ?? "");
      setConnectedRegion(data.account?.region ?? "");
      window.dispatchEvent(new Event("riot-accounts-updated"));
      setUrlState("success");
    } catch {
      setUrlError("네트워크 오류가 발생했습니다.");
      setUrlState("error");
    }
  }

  if (urlState === "success") {
    return (
      <div className="mx-auto max-w-lg">
        <div className="val-card p-8 text-center">
          <div className="mb-4 text-5xl">✅</div>
          <div className="mb-2 text-xl font-black text-white">연동 완료</div>
          <div className="mb-1 text-sm text-[#7b8a96]">성공적으로 연결된 계정</div>
          <div className="mb-2 text-lg font-black text-[#ff4655]">{riotId}</div>
          {connectedRegion ? (
            <div className="mb-6 text-xs font-bold text-green-400">
              {connectedRegion} · {regionLabel(connectedRegion)}
            </div>
          ) : null}
          <button
            onClick={() => router.push("/dashboard")}
            className="val-btn bg-[#ff4655] px-8 py-2.5 text-sm font-bold text-white"
          >
            대시보드로 이동
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="val-card p-5">
        <div className="mb-1 flex items-center gap-3">
          <div className="text-xs uppercase tracking-widest text-[#ff4655]">Riot Account Link</div>
          <div className="h-px flex-1 bg-[#2a3540]" />
        </div>
        <h1 className="text-2xl font-black text-white">라이엇 계정 연동</h1>
        <p className="mt-2 text-base leading-relaxed text-[#9aa8b3]">
          Riot 로그인 후 표시되는 404 페이지는 정상입니다. 주소창의 URL 전체를 복사해 붙여넣으면 계정이 연동됩니다.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <section className="space-y-5">
          <div className="val-card p-5">
            <div className="mb-5 text-base font-black uppercase tracking-widest text-[#ff4655]">연동 안내</div>
            <div className="space-y-0">
              <div className="flex gap-4">
                <div className="flex flex-shrink-0 flex-col items-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#ff4655] bg-[#ff4655]/10 text-sm font-bold text-[#ff4655]">
                    1
                  </div>
                  <div className="my-1 w-px flex-1 bg-[#2a3540]" style={{ minHeight: "24px" }} />
                </div>
                <div className="flex-1 pb-6">
                  <div className="mb-2 text-lg font-semibold text-white">Riot 로그인 페이지 열기</div>
                  <div className="text-base leading-relaxed text-[#9aa8b3]">
                    아래 버튼을 눌러 Riot 계정으로 로그인하세요. 이미 로그인되어 있으면 바로 다음 페이지로 이동할 수 있습니다.
                  </div>
                  <a
                    href={RIOT_LOGIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-2 rounded bg-[#ff4655] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#cc3644]"
                  >
                    Riot 로그인 페이지 열기
                  </a>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex flex-shrink-0 flex-col items-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#2a3540] bg-[#0f1923] text-sm font-bold text-[#7b8a96]">
                    2
                  </div>
                  <div className="my-1 w-px flex-1 bg-[#2a3540]" style={{ minHeight: "24px" }} />
                </div>
                <div className="flex-1 pb-6">
                  <div className="mb-2 text-lg font-semibold text-white">404 화면의 주소창 URL 전체 복사</div>
                  <div className="text-base leading-relaxed text-[#9aa8b3]">
                    로그인 후 playvalorant.com의 404 화면이 보이면 정상입니다. 주소창을 클릭하고{" "}
                    <span className="font-bold text-white">Ctrl+A → Ctrl+C</span>로 URL 전체를 복사하세요.
                  </div>
                  <div className="mt-2 rounded border border-[#ff4655]/25 bg-[#ff4655]/10 px-3 py-2 text-sm leading-relaxed text-[#ffb3ba]">
                    화면이 오류처럼 보여도 괜찮습니다. 이 단계에서는 주소창의 긴 인증 URL만 필요합니다.
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex flex-shrink-0 flex-col items-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#2a3540] bg-[#0f1923] text-sm font-bold text-[#7b8a96]">
                    3
                  </div>
                </div>
                <div className="flex-1">
                  <div className="mb-2 text-lg font-semibold text-white">아래 입력창에 붙여넣기</div>
                  <div className="text-base text-[#9aa8b3]">서버를 선택한 뒤 복사한 URL을 붙여넣고 연동 버튼을 누르세요.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="val-card p-5">
            <div className="mb-4 text-base font-black uppercase tracking-widest text-[#ff4655]">복사한 URL 붙여넣기</div>
            <form onSubmit={handleUrlSubmit} className="space-y-3">
              <div>
                <label className="mb-2 block text-base font-bold text-white">연동할 서버</label>
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
              </div>

              <div>
                <label className="mb-2 block text-base font-bold text-white">playvalorant.com URL</label>
                <textarea
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setUrlState("idle");
                  }}
                  placeholder="Riot 로그인 후 주소창 URL 전체를 붙여넣으세요."
                  rows={5}
                  className="w-full resize-none rounded border border-[#2a3540] bg-[#0f1923] px-4 py-3 font-mono text-sm text-white placeholder:text-[#3a4a55] focus:border-[#ff4655] focus:outline-none"
                  required
                  disabled={urlState === "loading"}
                />
              </div>

              {urlState === "error" ? (
                <div className="flex items-start gap-2 rounded border border-[#ff4655]/30 bg-[#ff4655]/10 px-3 py-2.5">
                  <span className="flex-shrink-0 text-sm text-[#ff4655]">⚠</span>
                  <div>
                    <div className="text-sm font-medium text-[#ff4655]">{urlError}</div>
                    <div className="mt-0.5 text-xs text-[#ff4655]/70">URL 전체를 복사했는지, 서버 선택이 맞는지 확인해 주세요.</div>
                  </div>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={urlState === "loading" || !url.trim()}
                className="val-btn w-full bg-[#ff4655] py-2.5 text-sm font-bold text-white hover:bg-[#cc3644] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {urlState === "loading" ? <LoadingDots /> : "라이엇 계정 연동하기"}
              </button>
            </form>
          </div>
        </section>

        <aside className="val-card p-5">
          <div className="mb-4 text-base font-black uppercase tracking-widest text-[#ff4655]">자주 묻는 질문</div>
          <div className="space-y-4">
            {faqItems.map(({ q, a }) => (
              <div key={q} className="border-b border-[#2a3540] pb-4 last:border-0 last:pb-0">
                <div className="mb-1.5 break-keep text-base font-bold leading-relaxed text-white">Q. {q}</div>
                <div className="break-keep text-sm leading-relaxed text-[#9aa8b3]">A. {a}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
