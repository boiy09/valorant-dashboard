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

function regionLabel(region: RiotRegion) {
  return region === "KR" ? "한국 서버" : "아시아 서버";
}

function LoadingLabel() {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white" style={{ animationDelay: "0ms" }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white" style={{ animationDelay: "120ms" }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white" style={{ animationDelay: "240ms" }} />
      <span>연동 중</span>
    </span>
  );
}

export default function RiotConnectPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [region, setRegion] = useState<RiotRegion>("KR");
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState("");
  const [riotId, setRiotId] = useState("");
  const [connectedRegion, setConnectedRegion] = useState<RiotRegion | "">("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setState("loading");
    setError("");

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
        setError(data.error ?? "연동에 실패했습니다. 주소 전체를 다시 붙여넣어 주세요.");
        setState("error");
        return;
      }

      setRiotId(data.account?.riotId ?? "");
      setConnectedRegion(data.account?.region ?? "");
      window.dispatchEvent(new Event("riot-accounts-updated"));
      setState("success");
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="mx-auto max-w-lg">
        <div className="val-card p-8 text-center">
          <div className="mb-2 text-xs font-black uppercase tracking-[0.24em] text-[#ff4655]">Riot Connected</div>
          <h1 className="text-2xl font-black text-white">연동 완료</h1>
          <div className="mt-5 rounded border border-[#2a3540] bg-[#0f1923] px-4 py-3">
            <div className="text-sm text-[#8da0ad]">연결된 계정</div>
            <div className="mt-1 text-lg font-black text-[#ff4655]">{riotId}</div>
            {connectedRegion ? <div className="mt-1 text-xs font-bold text-green-400">{connectedRegion} / {regionLabel(connectedRegion)}</div> : null}
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
          Riot 공식 로그인 후 나오는 주소를 붙여넣으면 연동됩니다. 비밀번호는 이 대시보드에 입력하거나 저장하지 않습니다.
        </p>
      </div>

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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-black text-white">서버 선택</label>
              <div className="grid grid-cols-2 gap-2">
                {(["KR", "AP"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRegion(value)}
                    disabled={state === "loading"}
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
                  if (state === "error") setState("idle");
                }}
                rows={8}
                required
                disabled={state === "loading"}
                placeholder="https://playvalorant.com/opt_in#access_token=..."
                className="w-full resize-none rounded border border-[#2a3540] bg-[#0f1923] px-4 py-3 font-mono text-sm text-white placeholder:text-[#465766] focus:border-[#ff4655] focus:outline-none"
              />
              <p className="mt-2 break-keep text-xs leading-relaxed text-[#7b8a96]">
                예전 주소는 재사용할 수 없습니다. 토큰이 만료되면 Riot 로그인 페이지를 다시 열어 새 주소를 받아야 합니다.
              </p>
            </div>

            {state === "error" && (
              <div className="rounded border border-[#ff4655]/40 bg-[#ff4655]/10 px-4 py-3 text-sm font-bold text-[#ff8b95]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={state === "loading" || !url.trim()}
              className="val-btn w-full bg-[#ff4655] py-3 text-sm font-black text-white hover:bg-[#cc3644] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state === "loading" ? <LoadingLabel /> : "Riot 계정 연동하기"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
