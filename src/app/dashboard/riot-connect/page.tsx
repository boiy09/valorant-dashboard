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

const guideSteps = [
  {
    title: "대시보드에서 Riot 로그인 페이지 열기",
    desc: "라이엇 연동 탭에서 버튼을 누르면 Riot 공식 로그인 화면이 새 탭으로 열립니다.",
    image: "/guides/riot-link/step-01-open-link.jpg",
  },
  {
    title: "Riot 계정으로 로그인",
    desc: "아이디와 비밀번호는 Riot 공식 페이지에서만 입력합니다. 대시보드는 비밀번호를 받지 않습니다.",
    image: "/guides/riot-link/step-02-riot-login.jpg",
  },
  {
    title: "인증 코드가 나오면 그대로 진행",
    desc: "이메일 또는 보안 인증이 나오면 Riot 안내에 맞춰 인증을 완료합니다.",
    image: "/guides/riot-link/step-03-auth-check.jpg",
  },
  {
    title: "404 화면은 정상",
    desc: "로그인 후 404 페이지가 보여도 실패가 아닙니다. 이때 브라우저 주소창의 URL 전체가 필요합니다.",
    image: "/guides/riot-link/step-04-copy-url.jpg",
  },
  {
    title: "주소창 URL 전체 복사 후 붙여넣기",
    desc: "404 화면에서 주소창을 클릭하고 Ctrl+A, Ctrl+C로 전체 URL을 복사한 뒤 아래 입력칸에 붙여넣습니다.",
    image: "/guides/riot-link/step-05-paste-url.jpg",
  },
  {
    title: "연동 완료 확인",
    desc: "연동이 끝나면 한섭/KR 또는 아섭/AP 계정이 대시보드에 표시됩니다.",
    image: "/guides/riot-link/step-06-complete.jpg",
  },
];

const faqItems = [
  {
    q: "404 페이지가 뜨면 실패인가요?",
    a: "아닙니다. Riot 로그인 뒤 보이는 404 화면은 정상입니다. 중요한 값은 화면 내용이 아니라 브라우저 주소창의 URL 전체입니다.",
  },
  {
    q: "URL은 어느 부분까지 복사해야 하나요?",
    a: "주소창을 클릭한 뒤 Ctrl+A, Ctrl+C로 전체 주소를 복사하세요. access_token 일부만 복사하면 연동에 실패합니다.",
  },
  {
    q: "한섭과 아섭을 둘 다 등록할 수 있나요?",
    a: "가능합니다. 서버 선택을 KR/AP로 바꿔 각각 한 번씩 연동하면 디스코드 계정 1개에 두 지역 계정이 저장됩니다.",
  },
  {
    q: "비밀번호가 저장되나요?",
    a: "저장하지 않습니다. 비밀번호는 Riot 공식 로그인 페이지에서만 입력하고, 대시보드는 Riot이 발급한 임시 인증 URL만 사용합니다.",
  },
];

function regionLabel(value: RiotRegion | "") {
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

export default function RiotConnectPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [urlState, setUrlState] = useState<FormState>("idle");
  const [urlError, setUrlError] = useState("");
  const [urlRegion, setUrlRegion] = useState<RiotRegion>("KR");
  const [riotId, setRiotId] = useState("");
  const [connectedRegion, setConnectedRegion] = useState<RiotRegion | "">("");
  const [showLoginConfirm, setShowLoginConfirm] = useState(false);

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
      const data = (await res.json()) as { error?: string; account?: { riotId: string; region: RiotRegion } };

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
            onClick={() => router.push("/dashboard?profile=1")}
            className="val-btn bg-[#ff4655] px-8 py-2.5 text-sm font-bold text-white"
          >
            내 프로필로 이동
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="val-card p-5">
        <div className="mb-1 flex items-center gap-3">
          <div className="text-xs uppercase tracking-widest text-[#ff4655]">Riot Account Link</div>
          <div className="h-px flex-1 bg-[#2a3540]" />
        </div>
        <h1 className="text-2xl font-black text-white">라이엇 계정 연동</h1>
        <p className="mt-2 break-keep text-base leading-relaxed text-[#9aa8b3]">
          Riot 로그인 후 표시되는 404 페이지는 정상입니다. 주소창의 URL 전체를 복사해 붙여넣으면 계정이 연동됩니다.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
        <section className="space-y-5">
          <div className="val-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-base font-black uppercase tracking-widest text-[#ff4655]">연동 안내</div>
                <div className="mt-1 text-sm text-[#7b8a96]">영상 내용을 단계별 이미지로 정리했습니다.</div>
              </div>
              <button
                type="button"
                onClick={() => setShowLoginConfirm(true)}
                className="val-btn animate-pulse bg-[#ff4655] px-6 py-3 text-sm font-black text-white shadow-[0_0_28px_rgba(255,70,85,0.45)] hover:bg-[#cc3644]"
              >
                Riot 로그인 페이지 열기
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {guideSteps.map((step, index) => (
                <article key={step.image} className="overflow-hidden rounded border border-[#263746] bg-[#0f1923]">
                  <div className="relative aspect-[16/9] overflow-hidden border-b border-[#263746] bg-black/30">
                    <img src={step.image} alt={step.title} className="h-full w-full object-cover" loading="lazy" />
                    <div className="absolute left-3 top-3 rounded bg-[#ff4655] px-2 py-1 text-xs font-black text-white">
                      STEP {index + 1}
                    </div>
                  </div>
                  <div className="p-4">
                    <h2 className="break-keep text-base font-black text-white">{step.title}</h2>
                    <p className="mt-2 break-keep text-sm leading-relaxed text-[#9aa8b3]">{step.desc}</p>
                  </div>
                </article>
              ))}
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
                  placeholder="Riot 로그인 후 404 화면의 주소창 URL 전체를 붙여넣으세요."
                  rows={5}
                  className="w-full resize-none rounded border border-[#2a3540] bg-[#0f1923] px-4 py-3 font-mono text-sm text-white placeholder:text-[#3a4a55] focus:border-[#ff4655] focus:outline-none"
                  required
                  disabled={urlState === "loading"}
                />
              </div>

              {urlState === "error" ? (
                <div className="flex items-start gap-2 rounded border border-[#ff4655]/30 bg-[#ff4655]/10 px-3 py-2.5">
                  <span className="flex-shrink-0 text-sm text-[#ff4655]">!</span>
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

        <aside className="space-y-5">
          <div className="val-card p-5">
            <div className="mb-4 text-base font-black uppercase tracking-widest text-[#ff4655]">핵심 요약</div>
            <ol className="space-y-3 text-sm leading-relaxed text-[#9aa8b3]">
              <li className="break-keep">
                <span className="font-black text-white">1.</span> Riot 공식 로그인 페이지에서 로그인합니다.
              </li>
              <li className="break-keep">
                <span className="font-black text-white">2.</span> 404 화면이 뜨면 정상입니다. 그 상태에서 주소창 URL 전체를 복사합니다.
              </li>
              <li className="break-keep">
                <span className="font-black text-white">3.</span> 아래 입력칸에 붙여넣고 KR/AP 서버를 선택해 연동합니다.
              </li>
            </ol>
          </div>

          <div className="val-card p-5">
            <div className="mb-4 text-base font-black uppercase tracking-widest text-[#ff4655]">자주 묻는 질문</div>
            <div className="space-y-4">
              {faqItems.map(({ q, a }) => (
                <div key={q} className="border-b border-[#2a3540] pb-4 last:border-0 last:pb-0">
                  <div className="mb-1.5 break-keep text-base font-bold leading-relaxed text-white">Q. {q}</div>
                  <div className="break-keep text-sm leading-relaxed text-[#9aa8b3]">A. {a}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {showLoginConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="val-card w-full max-w-md p-6 text-center shadow-2xl">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-[#ff4655]">확인 필요</div>
            <h2 className="mt-2 text-xl font-black text-white">연동 안내를 먼저 읽었나요?</h2>
            <p className="mt-3 break-keep text-sm leading-relaxed text-[#9aa8b3]">
              Riot 로그인 후 404 화면이 나와도 정상입니다. 그 화면의 주소창 URL 전체를 복사해서 아래 입력칸에 붙여넣어야 합니다.
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setShowLoginConfirm(false)} className="val-mini-button flex-1 py-2 text-sm">
                다시 읽기
              </button>
              <a
                href={RIOT_LOGIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowLoginConfirm(false)}
                className="val-btn flex-1 bg-[#ff4655] py-2 text-sm font-black text-white"
              >
                열기
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
