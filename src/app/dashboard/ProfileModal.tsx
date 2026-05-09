"use client";

export interface ProfileAccount {
  region: string;
  riotId: string;
  level?: number | null;
  card?: string | null;
  tier?: string | null;
  rankIcon?: string | null;
  isVerified?: boolean;
}

export interface ProfileData {
  name: string | null;
  image: string | null;
  email?: string | null;
  discordId?: string | null;
  roles?: string[];
  riotId?: string | null;
  riotAccounts?: ProfileAccount[];
  isOnline?: boolean;
}

interface ProfileModalProps {
  title?: string;
  profile: ProfileData | null;
  onClose: () => void;
}

function getInitial(name?: string | null) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

function regionLabel(region: string) {
  return region.toUpperCase() === "AP" ? "AP · 아섭" : "KR · 한섭";
}

export default function ProfileModal({ title = "프로필", profile, onClose }: ProfileModalProps) {
  if (!profile) return null;

  const displayName = profile.name || "이름 없음";
  const accounts = profile.riotAccounts ?? [];

  return (
    <div
      className="fixed inset-0 z-[180] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="val-card w-full max-w-lg overflow-hidden p-5 shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4 border-b border-[#2a3540] pb-4">
          <div className="flex min-w-0 items-center gap-3">
            {profile.image ? (
              <img
                src={profile.image}
                alt={displayName}
                className="h-14 w-14 rounded-full border border-[#ff4655]/45 object-cover shadow-[0_0_22px_rgba(255,70,85,0.22)]"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#2a3540] bg-[#1a242d] text-xl font-black text-[#7b8a96]">
                {getInitial(displayName)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#ff4655]">{title}</p>
              <h2 className="truncate text-xl font-black text-white">{displayName}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#7b8a96]">
                {typeof profile.isOnline === "boolean" && (
                  <span className="inline-flex items-center gap-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${profile.isOnline ? "bg-green-400" : "bg-[#4a5a68]"}`} />
                    {profile.isOnline ? "온라인" : "오프라인"}
                  </span>
                )}
                {profile.discordId && <span>Discord ID {profile.discordId}</span>}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="val-mini-button flex-shrink-0 px-3 py-1 text-xs"
            aria-label="프로필 닫기"
          >
            닫기
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {profile.email && (
            <InfoBlock label="이메일" value={profile.email} />
          )}

          {profile.roles && profile.roles.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">역할</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.roles.map((role) => (
                  <span
                    key={role}
                    className="rounded border border-[#ff4655]/25 bg-[#ff4655]/10 px-2 py-1 text-[10px] font-bold text-[#ff8a95]"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">라이엇 계정</p>
            {accounts.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {accounts.map((account) => (
                  <div key={`${account.region}-${account.riotId}`} className="rounded border border-[#2a3540] bg-[#0f1923]/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black text-[#ff4655]">{regionLabel(account.region)}</span>
                      {typeof account.isVerified === "boolean" && (
                        <span className="text-[10px] text-[#7b8a96]">{account.isVerified ? "인증됨" : "미인증"}</span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {account.card ? (
                        <img src={account.card} alt="" className="h-9 w-9 rounded object-cover" />
                      ) : (
                        <div className="h-9 w-9 rounded bg-[#1a242d]" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-white">{account.riotId}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#9aa8b3]">
                          {account.rankIcon && <img src={account.rankIcon} alt="" className="h-4 w-4 object-contain" />}
                          <span className="truncate">{account.tier || "티어 정보 없음"}</span>
                          {account.level !== null && account.level !== undefined && <span>Lv. {account.level}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded border border-dashed border-[#2a3540] bg-[#0f1923]/45 px-3 py-4 text-center text-xs text-[#7b8a96]">
                연동된 라이엇 계정이 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">{label}</p>
      <div className="rounded border border-[#2a3540] bg-[#0f1923]/70 px-3 py-2 text-sm font-bold text-[#ece8e1]">
        {value}
      </div>
    </div>
  );
}
