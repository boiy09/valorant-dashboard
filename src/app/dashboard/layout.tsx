"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import HeaderRiotLink from "./HeaderRiotLink";
import MemberSidebar from "./MemberSidebar";
import ProfileModal, { type ProfileAccount } from "./ProfileModal";

const BASE_TABS = [
  { href: "/dashboard", label: "대시보드", icon: "⌂" },
  { href: "/dashboard/riot-connect", label: "라이엇 연동", icon: "⛓" },
  { href: "/dashboard/riot-ssid-test", label: "테스트", icon: "T" },
  { href: "/dashboard/valorant", label: "전적", icon: "◎" },
  { href: "/dashboard/scrim", label: "내전", icon: "⚔" },
  { href: "/dashboard/schedule", label: "일정", icon: "▤" },
  { href: "/dashboard/announce", label: "공지", icon: "▰" },
  { href: "/dashboard/highlight", label: "하이라이트", icon: "▸" },
  { href: "/dashboard/members", label: "멤버", icon: "●" },
  { href: "/dashboard/help", label: "도움말", icon: "?" },
];

const ADMIN_TAB = { href: "/dashboard/admin", label: "관리", icon: "!" };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isAdmin, setIsAdmin] = useState(false);
  const [riotLinked, setRiotLinked] = useState<boolean | null>(null);
  const [showRiotRequired, setShowRiotRequired] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [showMyProfile, setShowMyProfile] = useState(false);
  const [myRiotAccounts, setMyRiotAccounts] = useState<ProfileAccount[]>([]);
  const [myProfileBio, setMyProfileBio] = useState("");
  const [myValorantRole, setMyValorantRole] = useState<string | null>(null);
  const [myFavoriteAgents, setMyFavoriteAgents] = useState<string[]>([]);
  const [serverNickname, setServerNickname] = useState<string | null>(null);
  const prevPathname = useRef(pathname);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname;
      setNavigating(false);
    }
  }, [pathname]);

  useEffect(() => {
    fetch("/api/me/roles")
      .then((response) => response.json())
      .then((data) => setIsAdmin(data.isAdmin ?? false))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    async function refreshRiotLinked() {
      try {
        const response = await fetch("/api/user/riot", { cache: "no-store" });
        const data = response.ok ? await response.json() : { linked: false };
        if (!cancelled) setRiotLinked(Boolean(data.linked));
      } catch {
        if (!cancelled) setRiotLinked(false);
      }
    }

    refreshRiotLinked();
    window.addEventListener("riot-accounts-updated", refreshRiotLinked);

    return () => {
      cancelled = true;
      window.removeEventListener("riot-accounts-updated", refreshRiotLinked);
    };
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    async function loadMyAccounts() {
      try {
        const response = await fetch("/api/user/riot", { cache: "no-store" });
        const data = response.ok ? await response.json() : { accounts: [] };
        if (!cancelled) setMyRiotAccounts(data.accounts ?? []);
      } catch {
        if (!cancelled) setMyRiotAccounts([]);
      }
    }

    loadMyAccounts();
    window.addEventListener("riot-accounts-updated", loadMyAccounts);

    return () => {
      cancelled = true;
      window.removeEventListener("riot-accounts-updated", loadMyAccounts);
    };
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("profile") === "1") {
      setShowMyProfile(true);
      router.replace("/dashboard");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;

    let cancelled = false;

    async function loadServerNickname() {
      try {
        const response = await fetch("/api/members", { cache: "no-store" });
        const data = response.ok ? await response.json() : { members: [] };
        const me = (data.members ?? []).find(
          (member: { discordId?: string; name?: string | null }) => member.discordId === session?.user?.id
        );
        if (!cancelled) setServerNickname(me?.name ?? null);
      } catch {
        if (!cancelled) setServerNickname(null);
      }
    }

    loadServerNickname();
    window.addEventListener("profile-updated", loadServerNickname);

    return () => {
      cancelled = true;
      window.removeEventListener("profile-updated", loadServerNickname);
    };
  }, [status, session?.user?.id]);

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    fetch("/api/user/profile", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { favoriteAgents: [] }))
      .then((data) => {
        if (cancelled) return;
        setMyProfileBio(data.profileBio ?? "");
        setMyValorantRole(data.valorantRole ?? null);
        setMyFavoriteAgents(data.favoriteAgents ?? []);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (riotLinked !== false) return;
    if (pathname === "/dashboard/riot-connect" || pathname.startsWith("/dashboard/riot-connect/")) return;
    if (pathname === "/dashboard/riot-ssid-test" || pathname.startsWith("/dashboard/riot-ssid-test/")) return;

    setShowRiotRequired(true);
    router.replace("/dashboard/riot-connect");
  }, [riotLinked, pathname, router]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="val-splash">
        <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
          <div className="val-splash-ring-inner" />
          <div className="val-splash-ring" />
          <img src="/valosegi-logo.webp" alt="발로세끼" className="val-splash-logo" style={{ width: 90 }} />
        </div>
        <div className="val-splash-bar" style={{ marginTop: -4 }}>
          <div className="val-splash-bar-fill" />
        </div>
        <span className="val-splash-label">LOADING</span>
      </div>
    );
  }

  const tabs = isAdmin ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS;
  const activeHref = [...tabs]
    .sort((left, right) => right.href.length - left.href.length)
    .find((tab) => pathname === tab.href || pathname.startsWith(tab.href + "/"))?.href;
  const displayName = serverNickname ?? session?.user?.name ?? "";

  return (
    <div className="val-shell min-h-screen flex flex-col">
      <div className="val-agent-squad val-agent-squad-left" aria-hidden="true">
        <span className="val-agent-pawn agent-reyna" />
        <span className="val-agent-pawn agent-raze" />
        <span className="val-agent-pawn agent-phoenix" />
        <span className="val-agent-pawn agent-omen" />
        <span className="val-agent-pawn agent-viper" />
      </div>
      <div className="val-agent-squad val-agent-squad-right" aria-hidden="true">
        <span className="val-agent-pawn agent-jett" />
        <span className="val-agent-pawn agent-sage" />
        <span className="val-agent-pawn agent-killjoy" />
        <span className="val-agent-pawn agent-sova" />
        <span className="val-agent-pawn agent-chamber" />
      </div>
      <div className="val-top-scan" aria-hidden="true" />

      <div className="val-sticky-header flex-shrink-0">
      <header className="val-topbar flex-shrink-0">
        <div className="max-w-screen-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="group flex items-center">
              <img
                src="/valosegi-header-logo.webp"
                alt="발로세끼"
                className="h-12 w-auto max-w-[180px] object-contain"
              />
            </Link>
            <Link
              href="/promo"
              className="val-mini-button text-[11px] font-black tracking-widest"
              style={{ letterSpacing: "0.12em" }}
            >
              ▸ 홍보 페이지
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <HeaderRiotLink />
            <button
              type="button"
              onClick={() => setShowMyProfile(true)}
              className="flex items-center gap-2 rounded border border-[#2a3540]/75 bg-[#0f1923]/70 px-2.5 py-1.5 text-left transition-all hover:border-[#ff4655]/55 hover:bg-[#ff4655]/[0.07] focus:outline-none focus:ring-2 focus:ring-[#ff4655]/55"
              aria-label="내 프로필 열기"
            >
              {session?.user?.image ? (
                <img
                  src={session.user.image}
                  alt="avatar"
                  className="h-7 w-7 rounded-full border border-[#ff4655]/40 object-cover shadow-[0_0_18px_rgba(255,70,85,0.18)]"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2a3540] text-[10px] font-black text-[#7b8a96]">
                  {(session?.user?.name ?? "?").charAt(0)}
                </span>
              )}
              {displayName && (
                <span className="hidden max-w-32 truncate text-xs font-bold text-[#ece8e1] sm:block">{displayName}</span>
              )}
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="val-mini-button"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <nav className="val-nav flex-shrink-0 overflow-x-auto">
        <div className="max-w-screen-2xl mx-auto px-2 flex items-stretch gap-1 min-w-max">
          {tabs.map((tab) => {
            const isActive = tab.href === activeHref;

            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={(event) => {
                  const isRiotSetupTab =
                    tab.href === "/dashboard/riot-connect" ||
                    tab.href === "/dashboard/riot-ssid-test";
                  if (riotLinked === false && !isRiotSetupTab) {
                    event.preventDefault();
                    setShowRiotRequired(true);
                    router.replace("/dashboard/riot-connect");
                    return;
                  }
                  if (tab.href !== activeHref) {
                    setNavigating(true);
                  }
                }}
                className={`val-nav-link ${isActive ? "is-active" : ""}`}
              >
                <span className="val-nav-icon" aria-hidden="true">
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      </div>

      <div className="val-dashboard-frame relative z-10 flex-1 w-full mx-auto px-4 py-6 flex gap-5 items-start">
        <main className="flex-1 min-w-0">{children}</main>
        <MemberSidebar />
      </div>

      {navigating && (
        <div className="val-nav-loading">
          <div className="relative flex items-center justify-center" style={{ width: 80, height: 80 }}>
            <div className="val-splash-ring-inner" style={{ width: 80, height: 80 }} />
            <div className="val-splash-ring" style={{ width: 80, height: 80 }} />
            <img src="/valosegi-icon.png" alt="" style={{ width: 36, height: 36, objectFit: "contain", opacity: 0.9 }} />
          </div>
        </div>
      )}

      {showRiotRequired && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4">
          <div className="val-card max-w-md p-6 text-center shadow-2xl">
            <div className="mb-3 text-4xl">⛓</div>
            <h2 className="text-xl font-black text-white">라이엇 계정 연동이 필요합니다</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#9aa8b3]">
              전적, 내전, 멤버 정보 기능을 정상적으로 사용하려면 먼저 라이엇 계정을 1개 이상 연동해야 합니다.
            </p>
            <button
              onClick={() => setShowRiotRequired(false)}
              className="val-btn mt-5 bg-[#ff4655] px-6 py-2 text-sm font-bold text-white"
            >
              연동하러 가기
            </button>
          </div>
        </div>
      )}

      {showMyProfile && (
        <ProfileModal
          title="내 프로필"
          profile={{
            name: (displayName || session?.user?.name) ?? null,
            image: session?.user?.image ?? null,
            profileBio: myProfileBio,
            discordId: session?.user?.id ?? undefined,
            riotAccounts: myRiotAccounts,
            valorantRole: myValorantRole,
            favoriteAgents: myFavoriteAgents,
          }}
          editable
          requirePreferences={myRiotAccounts.length > 0 && (!myValorantRole || myFavoriteAgents.length < 3)}
          onProfileSaved={(data) => {
            setMyProfileBio(data.profileBio ?? "");
            setMyValorantRole(data.valorantRole ?? null);
            setMyFavoriteAgents(data.favoriteAgents ?? []);
          }}
          onClose={() => setShowMyProfile(false)}
        />
      )}
    </div>
  );
}
