"use client";

import { useEffect, useRef, useState } from "react";
import type { StoreData, WalletData } from "@/lib/riotPrivateApi";

interface RiotAccountItem {
  id: string;
  region: "KR" | "AP";
  riotId: string;
  isVerified: boolean;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "만료됨";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

function VpIcon() {
  return (
    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#0ac8b9] text-[8px] font-black text-[#0f1923] mr-1 flex-shrink-0">
      VP
    </span>
  );
}

function SkinCard({ offer }: { offer: StoreData["offers"][number] }) {
  return (
    <div className="bg-[#111c24] border border-[#2a3540] rounded-lg overflow-hidden flex flex-col">
      <div className="bg-[#0d1821] flex items-center justify-center h-32 relative">
        {offer.displayIcon ? (
          <img
            src={offer.displayIcon}
            alt={offer.name}
            className="max-h-28 max-w-full object-contain p-2"
          />
        ) : (
          <div className="text-[#7b8a96] text-xs">이미지 없음</div>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1 flex-1 justify-between">
        <div className="text-white text-sm font-semibold leading-tight">{offer.name}</div>
        <div className="flex items-center justify-between mt-1">
          {offer.cost > 0 ? (
            <div className="flex items-center text-[#0ac8b9] text-xs font-bold">
              <VpIcon />
              {offer.cost.toLocaleString()}
            </div>
          ) : (
            <div className="text-[#7b8a96] text-[10px]">가격 정보 없음</div>
          )}
          <div className="text-[#7b8a96] text-[10px]">
            {formatDuration(offer.remainingSeconds)} 남음
          </div>
        </div>
      </div>
    </div>
  );
}

function BundleCard({ bundle }: { bundle: NonNullable<StoreData["bundle"]> }) {
  return (
    <div className="bg-[#111c24] border border-[#ff4655]/30 rounded-lg overflow-hidden">
      <div className="bg-[#0d1821] flex items-center justify-center h-40 relative">
        {bundle.displayIcon ? (
          <img
            src={bundle.displayIcon}
            alt={bundle.name}
            className="max-h-36 max-w-full object-contain p-2"
          />
        ) : (
          <div className="text-[#7b8a96] text-xs">이미지 없음</div>
        )}
        <div className="absolute top-2 left-2 bg-[#ff4655] text-white text-[10px] font-bold px-2 py-0.5 rounded">
          번들
        </div>
      </div>
      <div className="p-3 flex items-center justify-between">
        <div>
          <div className="text-white text-sm font-semibold">{bundle.name}</div>
          <div className="text-[#7b8a96] text-[10px] mt-0.5">
            {formatDuration(bundle.remainingSeconds)} 남음
          </div>
        </div>
        {bundle.cost > 0 && (
          <div className="flex items-center text-[#0ac8b9] text-sm font-bold">
            <VpIcon />
            {bundle.cost.toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

interface QuickRefreshProps {
  accountId: string;
  onSuccess: () => void;
}

const RIOT_AUTH_URL =
  "https://auth.riotgames.com/authorize?redirect_uri=https%3A%2F%2Fplayvalorant.com%2Fopt_in&client_id=play-valorant-web-prod&response_type=token+id_token&scope=account+openid&nonce=1";

function QuickRefresh({ accountId, onSuccess }: QuickRefreshProps) {
  const [cookies, setCookies] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function handleRefresh() {
    const val = cookies.trim();
    if (!val) return;
    setLoading(true);
    setErr("");

    try {
      const res = await fetch("/api/riot/auth/ssid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ssid: val }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setErr(data.error ?? "갱신 실패");
        return;
      }
      onSuccess();
    } catch {
      setErr("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-[#0d1821] border border-[#ff4655]/20 rounded-lg p-4 flex flex-col gap-3">
      <div className="text-white text-xs font-bold tracking-widest uppercase">토큰 갱신</div>
      <ol className="text-[#7b8a96] text-xs space-y-2 list-decimal list-inside leading-relaxed">
        <li>F12 열기 → Network 탭 → 필터에 <span className="text-white font-mono">auth.riotgames.com</span> 입력</li>
        <li>
          <a href={RIOT_AUTH_URL} target="_blank" rel="noopener noreferrer" className="text-[#0ac8b9] underline">
            여기를 클릭
          </a>
          {" "}→ Riot 로그인 후 playvalorant.com으로 리다이렉트될 때까지 대기
        </li>
        <li>Network 목록에서 <span className="text-white font-mono">authorize</span> 요청 클릭</li>
        <li>Request Headers 탭 → <span className="text-white font-mono">Cookie:</span> 값 전체 복사</li>
        <li>아래에 붙여넣기 후 갱신</li>
      </ol>
      <textarea
        ref={inputRef}
        value={cookies}
        onChange={(e) => setCookies(e.target.value)}
        placeholder="ssid=eyJ...; sub=afafa29f...; tdid=eyJ...; csid=..."
        rows={3}
        className="bg-[#111c24] border border-[#2a3540] rounded text-[#cdd6f4] text-xs p-2 resize-none focus:outline-none focus:border-[#0ac8b9] font-mono"
      />
      {err && <div className="text-[#ff4655] text-xs">{err}</div>}
      <button
        onClick={handleRefresh}
        disabled={loading || !cookies.trim()}
        className="self-start bg-[#0ac8b9] text-[#0f1923] text-xs font-bold px-5 py-2 rounded disabled:opacity-50 hover:bg-[#0ac8b9]/80 transition-colors"
      >
        {loading ? "갱신 중..." : "토큰 갱신 후 상점 열기"}
      </button>
    </div>
  );
}

export default function StorePage() {
  const [accounts, setAccounts] = useState<RiotAccountItem[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [store, setStore] = useState<StoreData | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [storeLoading, setStoreLoading] = useState(false);
  const [error, setError] = useState("");
  const [showRefresh, setShowRefresh] = useState(false);
  const [accountsLoaded, setAccountsLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/user/riot")
      .then((r) => (r.ok ? r.json() : { accounts: [] }))
      .then((data: { accounts?: RiotAccountItem[] }) => {
        const accs = data.accounts ?? [];
        setAccounts(accs);
        const verified = accs.find((a) => a.isVerified);
        if (verified) setSelectedAccountId(verified.id);
        setAccountsLoaded(true);
      })
      .catch(() => setAccountsLoaded(true));
  }, []);

  async function loadStore() {
    if (!selectedAccountId) return;
    setStoreLoading(true);
    setError("");
    setShowRefresh(false);
    setStore(null);
    setWallet(null);

    try {
      const [storeRes, walletRes] = await Promise.all([
        fetch(`/api/riot/store?accountId=${selectedAccountId}`),
        fetch(`/api/riot/wallet?accountId=${selectedAccountId}`),
      ]);

      if (!storeRes.ok) {
        const data = await storeRes.json() as { error?: string };
        const msg = data.error ?? "상점 조회 실패";
        if (storeRes.status === 403) setShowRefresh(true);
        throw new Error(msg);
      }
      if (!walletRes.ok) {
        const data = await walletRes.json() as { error?: string };
        throw new Error(data.error ?? "지갑 조회 실패");
      }

      const storeData = await storeRes.json() as StoreData;
      const walletData = await walletRes.json() as WalletData;

      setStore(storeData);
      setWallet(walletData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "알 수 없는 오류";
      setError(message);
    } finally {
      setStoreLoading(false);
    }
  }

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  if (!accountsLoaded) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-1.5 h-1.5 rounded-full bg-[#ff4655] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-white font-black text-2xl tracking-wide">
          발로란트 <span className="text-[#ff4655]">상점</span>
        </h1>
        <p className="text-[#7b8a96] text-sm mt-1">오늘의 스킨 상점을 확인하세요.</p>
      </div>

      {/* 계정 선택 */}
      <div className="bg-[#111c24] border border-[#2a3540] rounded-lg p-4">
        <div className="text-[#7b8a96] text-xs mb-3 tracking-widest uppercase">계정 선택</div>

        {accounts.length === 0 ? (
          <div className="text-[#7b8a96] text-sm">
            연결된 라이엇 계정이 없습니다. 우측 상단의 라이엇 연동에서 계정을 추가해 주세요.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 flex-wrap">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => {
                    setSelectedAccountId(account.id);
                    setStore(null);
                    setWallet(null);
                    setError("");
                    setShowRefresh(false);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded border text-sm transition-colors ${
                    selectedAccountId === account.id
                      ? "border-[#ff4655] bg-[#ff4655]/10 text-white"
                      : "border-[#2a3540] text-[#7b8a96] hover:border-[#7b8a96]"
                  }`}
                >
                  <span className="font-bold">{account.region}</span>
                  <span>{account.riotId}</span>
                  {account.isVerified ? (
                    <span className="text-green-400 text-[10px]">인증됨</span>
                  ) : (
                    <span className="text-[#ff4655] text-[10px]">인증 필요</span>
                  )}
                </button>
              ))}
            </div>

            {selectedAccount && !selectedAccount.isVerified ? (
              <div className="text-[#ff4655] text-sm">
                이 계정은 인증되지 않았습니다. 라이엇 아이디/비밀번호로 다시 연동해 주세요.
              </div>
            ) : selectedAccount ? (
              <button
                onClick={loadStore}
                disabled={storeLoading}
                className="self-start bg-[#ff4655] text-white text-sm font-bold px-6 py-2 rounded disabled:opacity-50 hover:bg-[#ff4655]/80 transition-colors"
              >
                {storeLoading ? "불러오는 중..." : "상점 불러오기"}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* 오류 */}
      {error && (
        <div className="bg-[#ff4655]/10 border border-[#ff4655]/30 rounded-lg p-4 text-[#ff4655] text-sm">
          {error}
        </div>
      )}

      {/* 인라인 토큰 갱신 */}
      {showRefresh && selectedAccountId && (
        <QuickRefresh
          accountId={selectedAccountId}
          onSuccess={() => {
            setShowRefresh(false);
            setError("");
            loadStore();
          }}
        />
      )}

      {/* 지갑 */}
      {wallet && (
        <div className="bg-[#111c24] border border-[#2a3540] rounded-lg p-4">
          <div className="text-[#7b8a96] text-xs mb-3 tracking-widest uppercase">잔액</div>
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <VpIcon />
              <span className="text-white font-bold text-lg">{wallet.vp.toLocaleString()}</span>
              <span className="text-[#7b8a96] text-xs">VP</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#ff7f50] text-[8px] font-black text-white flex-shrink-0">
                R
              </span>
              <span className="text-white font-bold text-lg">{wallet.radianite.toLocaleString()}</span>
              <span className="text-[#7b8a96] text-xs">라디아나이트</span>
            </div>
          </div>
        </div>
      )}

      {/* 번들 */}
      {store?.bundle && (
        <div>
          <div className="text-[#7b8a96] text-xs mb-3 tracking-widest uppercase">주목 번들</div>
          <BundleCard bundle={store.bundle} />
        </div>
      )}

      {/* 일일 스킨 */}
      {store && store.offers.length > 0 && (
        <div>
          <div className="text-[#7b8a96] text-xs mb-3 tracking-widest uppercase">
            일일 상점 ({store.offers.length}개)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {store.offers.map((offer) => (
              <SkinCard key={offer.uuid} offer={offer} />
            ))}
          </div>
        </div>
      )}

      {store && store.offers.length === 0 && !store.bundle && (
        <div className="text-[#7b8a96] text-sm text-center py-8">
          상점 데이터가 없습니다.
        </div>
      )}
    </div>
  );
}
