"use client";

import { useEffect, useState } from "react";
import type { StoreOffer, StoreBundle, StoreData, WalletData, BattlepassData } from "@/lib/riotPrivateApi";

type RiotRegion = "KR" | "AP";

interface AccountStore {
  region: RiotRegion;
  riotId: string;
  error: string | null;
  walletError?: string | null;
  battlepassError?: string | null;
  store: StoreData | null;
  wallet: WalletData | null;
  battlepass: BattlepassData | null;
}

interface StoreResponse {
  accounts?: AccountStore[];
  error?: string;
}

const REGION_LABELS: Record<RiotRegion, string> = { KR: "한섭", AP: "아섭" };

function regionPriority(region: string) {
  const normalized = region.toUpperCase();
  if (normalized === "KR") return 0;
  if (normalized === "AP") return 1;
  return 2;
}

function formatCountdown(seconds: number) {
  if (seconds <= 0) return "갱신됨";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return h > 0 ? `${d}일 ${h}시간` : `${d}일`;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

function VpIcon() {
  return (
    <svg className="inline-block h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <polygon points="12,2 22,8 22,16 12,22 2,16 2,8" fill="#0bc4b4" stroke="#0bc4b4" strokeWidth="1.5" />
      <polygon points="12,6 18,10 18,14 12,18 6,14 6,10" fill="#0f1923" />
      <polygon points="12,9 16,11.5 16,14 12,16.5 8,14 8,11.5" fill="#0bc4b4" />
    </svg>
  );
}

function SkinCard({ offer }: { offer: StoreOffer }) {
  const bgColor = offer.tierColor ?? "#0a1520";
  const bgStyle = offer.tierColor
    ? { background: `linear-gradient(135deg, ${bgColor}33 0%, #0a1520 60%)` }
    : { background: "#0a1520" };

  return (
    <div className="val-card overflow-hidden">
      {offer.tierColor && (
        <div
          className="h-0.5 w-full"
          style={{ backgroundColor: offer.tierColor }}
        />
      )}
      <div
        className="relative flex h-36 items-center justify-center"
        style={bgStyle}
      >
        {offer.displayIcon ? (
          <img
            src={offer.displayIcon}
            alt={offer.name}
            className="h-full w-full object-contain p-4 drop-shadow-lg"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[#2a3540] text-4xl">?</div>
        )}
      </div>
      <div className="px-3 py-2.5">
        <div className="truncate text-sm font-black text-white">{offer.name || "스킨 정보 없음"}</div>
        <div className="mt-1 flex items-center gap-1.5">
          <VpIcon />
          <span className="text-sm font-bold text-[#0bc4b4]">{offer.cost.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

function BundleCard({ bundle }: { bundle: StoreBundle }) {
  return (
    <div className="val-card overflow-hidden">
      <div className="relative flex h-44 items-center justify-center bg-[#0a1520]">
        {bundle.displayIcon ? (
          <img
            src={bundle.displayIcon}
            alt={bundle.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[#2a3540] text-5xl">▣</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 p-3">
          <div className="text-sm font-black text-white leading-snug">{bundle.name}</div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <div className="flex items-center gap-1">
              <VpIcon />
              <span className="font-bold text-[#0bc4b4] text-sm">{bundle.cost.toLocaleString()}</span>
            </div>
            {bundle.remainingSeconds > 0 && (
              <span className="text-[10px] text-[#7b8a96]">
                {formatCountdown(bundle.remainingSeconds)} 남음
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BattlepassBar({ bp }: { bp: BattlepassData }) {
  return (
    <div className="val-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-[#7b8a96]">배틀패스</div>
        <div className="text-sm font-black text-white">레벨 {bp.totalLevelsCompleted}</div>
      </div>

      {/* 현재 레벨 진행도 */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-[#7b8a96]">
          <span>현재 레벨 진행도</span>
          <span className="font-bold text-[#ece8e1]">{bp.progressionTowardsObjective.toLocaleString()} XP</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1a2d3e]">
          <div
            className="h-full rounded-full bg-[#ff4655] transition-all"
            style={{ width: `${Math.min(100, (bp.progressionTowardsObjective / 2000) * 100)}%` }}
          />
        </div>
      </div>

      {/* 시즌 누적 XP */}
      <div className="border-t border-[#1a2d3e] pt-3 flex items-center justify-between text-[11px] text-[#7b8a96]">
        <span>이번 시즌 누적 XP</span>
        <span className="font-bold text-white">{bp.progressionEarnedThisAct.toLocaleString()} XP</span>
      </div>
    </div>
  );
}

function WalletDisplay({ wallet }: { wallet: WalletData }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-1.5 rounded border border-[#2a3540] bg-[#0f1923] px-3 py-1.5">
        <VpIcon />
        <span className="text-sm font-black text-white">{wallet.vp.toLocaleString()}</span>
        <span className="text-[11px] text-[#7b8a96]">VP</span>
      </div>
      <div className="flex items-center gap-1.5 rounded border border-[#2a3540] bg-[#0f1923] px-3 py-1.5">
        <span className="text-[#e05500] text-sm">◈</span>
        <span className="text-sm font-black text-white">{wallet.radianite.toLocaleString()}</span>
        <span className="text-[11px] text-[#7b8a96]">RP</span>
      </div>
    </div>
  );
}

function StoreSkeleton() {
  return (
    <section className="animate-pulse rounded-xl border border-[#2a3540] bg-[#0a1520] p-5">
      <div className="mb-4 flex items-center gap-3 border-b border-[#2a3540] pb-3">
        <div className="h-8 w-1 rounded-full bg-[#2a3540]" />
        <div className="space-y-1.5">
          <div className="h-2 w-16 rounded bg-[#2a3540]" />
          <div className="h-5 w-40 rounded bg-[#2a3540]" />
        </div>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-[#2a3540]">
            <div className="h-36 bg-[#0f1923]" />
            <div className="p-3 space-y-2">
              <div className="h-3 w-3/4 rounded bg-[#2a3540]" />
              <div className="h-3 w-1/2 rounded bg-[#2a3540]" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AccountStoreSection({ data }: { data: AccountStore }) {
  const [tick, setTick] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const remainingSeconds = data.store?.offers?.[0]?.remainingSeconds ?? 0;

  async function shareToDiscord() {
    if (!data.store?.offers?.length) return;
    setSharing(true);
    setShareMsg(null);
    try {
      const items = data.store.offers.map((o) => ({ name: o.name, price: o.cost, icon: o.displayIcon ?? null }));
      const res = await fetch("/api/valorant/store/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, riotId: data.riotId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "전송 실패");
      setShareMsg("Discord에 공유했습니다.");
    } catch (e) {
      setShareMsg(e instanceof Error ? e.message : "전송 중 오류가 발생했습니다.");
    } finally {
      setSharing(false);
      setTimeout(() => setShareMsg(null), 4000);
    }
  }

  return (
    <section className="rounded-xl border border-[#2a3540] bg-[#0a1520] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#2a3540] pb-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 flex-shrink-0 rounded-full bg-[#ff4655]" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#ff4655]">
              {data.region} · {REGION_LABELS[data.region]}
            </div>
            <h2 className="text-lg font-black text-white">{data.riotId}</h2>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {data.wallet && <WalletDisplay wallet={data.wallet} />}
          {remainingSeconds > 0 && (
            <div className="text-xs text-[#7b8a96]">
              갱신까지 <span className="font-bold text-white">{formatCountdown(remainingSeconds - tick * 60)}</span>
            </div>
          )}
          {data.store?.offers?.length ? (
            <button
              type="button"
              onClick={shareToDiscord}
              disabled={sharing}
              className="rounded border border-[#5865f2]/40 bg-[#5865f2]/10 px-3 py-1.5 text-xs font-black text-[#7b8aff] transition-colors hover:border-[#5865f2] hover:bg-[#5865f2]/20 disabled:opacity-50"
            >
              {sharing ? "공유 중..." : "Discord 공유"}
            </button>
          ) : null}
        </div>
      </div>
      {shareMsg && (
        <div className="mb-3 rounded border border-[#5865f2]/30 bg-[#5865f2]/10 px-3 py-2 text-xs text-[#7b8aff]">
          {shareMsg}
        </div>
      )}

      {(data.error || data.walletError || data.battlepassError) && (
        <div className="mb-4 space-y-2">
          {data.error && (
            <div className="rounded-lg border border-[#ff4655]/30 bg-[#140b10] p-4 text-sm text-[#c8d3db]">
              {data.error}
            </div>
          )}
          {data.walletError && (
            <div className="rounded-lg border border-[#ff4655]/20 bg-[#140b10] p-3 text-xs text-[#9aa8b3]">
              지갑: {data.walletError}
            </div>
          )}
          {data.battlepassError && (
            <div className="rounded-lg border border-[#ff4655]/20 bg-[#140b10] p-3 text-xs text-[#9aa8b3]">
              배틀패스: {data.battlepassError}
            </div>
          )}
        </div>
      )}
      {!data.error && (
        <>
          {/* 오늘의 스킨 */}
          <div className="mb-5">
            <div className="mb-3 text-xs uppercase tracking-widest text-[#7b8a96]">오늘의 스킨</div>
            {data.store?.offers?.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {data.store.offers.map((offer) => (
                  <SkinCard key={offer.uuid} offer={offer} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-[#2a3540] bg-[#0f1923] p-4 text-sm text-[#7b8a96]">
                스킨 정보를 불러올 수 없습니다.
              </div>
            )}
          </div>

          {/* 추천 번들 */}
          {(data.store?.bundles?.length ?? 0) > 0 && (
            <div className="mb-5">
              <div className="mb-3 text-xs uppercase tracking-widest text-[#7b8a96]">
                추천 번들 <span className="text-[#4a5a68] normal-case tracking-normal">({data.store!.bundles.length}개)</span>
              </div>
              <div className={`grid gap-3 ${data.store!.bundles.length === 1 ? "grid-cols-1" : data.store!.bundles.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
                {data.store!.bundles.map((bundle, i) => (
                  <BundleCard key={i} bundle={bundle} />
                ))}
              </div>
            </div>
          )}

          {/* 배틀패스 */}
          {data.battlepass && <BattlepassBar bp={data.battlepass} />}
        </>
      )}
    </section>
  );
}

export default function StorePage() {
  const [data, setData] = useState<{ accounts: AccountStore[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/valorant/store", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: StoreResponse) => {
        if (d.error) setError(d.error);
        else setData({ accounts: d.accounts ?? [] });
      })
      .catch(() => setError("상점 정보를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="mb-1">
          <h1 className="text-2xl font-black text-white">상점</h1>
          <p className="mt-1 text-sm text-[#7b8a96]">오늘의 스킨, 번들, 지갑 잔액을 확인합니다.</p>
        </div>
        <StoreSkeleton />
        <StoreSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5">
        <div className="mb-1">
          <h1 className="text-2xl font-black text-white">상점</h1>
        </div>
        <div className="rounded-xl border border-[#ff4655]/30 bg-[#140b10] p-6 text-sm text-[#c8d3db]">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="mb-1">
        <h1 className="text-2xl font-black text-white">상점</h1>
        <p className="mt-1 text-sm text-[#7b8a96]">오늘의 스킨, 번들, 지갑 잔액을 확인합니다.</p>
      </div>

      {data?.accounts?.length === 0 ? (
        <div className="rounded-xl border border-[#2a3540] bg-[#0a1520] p-6 text-sm text-[#7b8a96]">
          연동된 라이엇 계정이 없습니다. 라이엇 연동 탭에서 계정을 연결해 주세요.
        </div>
      ) : (
        [...(data?.accounts ?? [])].sort((a, b) => regionPriority(a.region) - regionPriority(b.region)).map((account) => (
          <AccountStoreSection key={`${account.region}-${account.riotId}`} data={account} />
        ))
      )}
    </div>
  );
}
