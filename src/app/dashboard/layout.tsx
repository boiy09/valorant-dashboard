"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import HeaderRiotLink from "./HeaderRiotLink";
import MemberSidebar from "./MemberSidebar";

const BASE_TABS = [
  { href: "/dashboard", label: "대시보드", icon: "⌂" },
  { href: "/dashboard/riot-connect", label: "라이엇 연동", icon: "⛓" },
  { href: "/dashboard/valorant", label: "전적", icon: "◎" },
  { href: "/dashboard/scrim", label: "내전", icon: "⚔" },
  { href: "/dashboard/schedule", label: "일정", icon: "▤" },
  { href: "/dashboard/announce", label: "공지", icon: "▰" },
  { href: "/dashboard/highlight", label: "하이라이트", icon: "▸" },
  { href: "/dashboard/members", label: "멤버", icon: "●" },
];

const ADMIN_TAB = { href: "/dashboard/admin", label: "관리", icon: "!" };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isAdmin, setIsAdmin] = useState(false);
  const [riotLinked, setRiotLinked] = useState<boolean | null>(null);
  const [showRiotRequired, setShowRiotRequired] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

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
    if (riotLinked !== false) return;
    if (pathname === "/dashboard/riot-connect" || pathname.startsWith("/dashboard/riot-connect/")) return;

    setShowRiotRequired(true);
    router.replace("/dashboard/riot-connect");
  }, [riotLinked, pathname, router]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-[#0f1923] flex items-center justify-center">
        <div className="val-loader" />
      </div>
    );
  }

  const tabs = isAdmin ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS;
  const activeHref = [...tabs]
    .sort((left, right) => right.href.length - left.href.length)
    .find((tab) => pathname === tab.href || pathname.startsWith(tab.href + "/"))?.href;

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

      <header className="val-topbar flex-shrink-0">
        <div className="max-w-screen-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="group flex items-center">
            <img
              src="/valosegi-header-logo.webp"
              alt="발로세끼"
              className="h-12 w-auto max-w-[180px] object-contain"
            />
          </Link>

          <div className="flex items-center gap-3">
            <HeaderRiotLink />
            {session?.user?.image && (
              <img
                src={session.user.image}
                alt="avatar"
                className="w-8 h-8 rounded-full border border-[#ff4655]/40 shadow-[0_0_18px_rgba(255,70,85,0.18)]"
              />
            )}
            {session?.user?.name && (
              <span className="text-[#ece8e1] text-xs font-bold hidden sm:block">{session.user.name}</span>
            )}
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
                  if (riotLinked === false && tab.href !== "/dashboard/riot-connect") {
                    event.preventDefault();
                    setShowRiotRequired(true);
                    router.replace("/dashboard/riot-connect");
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

      <div className="val-dashboard-frame relative z-10 flex-1 w-full mx-auto px-4 py-6 flex gap-5 items-start">
        <main className="flex-1 min-w-0">{children}</main>
        <MemberSidebar />
      </div>

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
    </div>
  );
}
