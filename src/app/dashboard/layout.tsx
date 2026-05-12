"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import HeaderRiotLink from "./HeaderRiotLink";
import MemberSidebar from "./MemberSidebar";
import ProfileModal from "./ProfileModal";

// --- StatSync 로직 통합 ---
function StatSyncBackground({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user) return;

    const syncStats = async () => {
      const lastSync = localStorage.getItem("last_stat_sync");
      const now = Date.now();
      if (lastSync && now - parseInt(lastSync) < 1000 * 60 * 60 * 1) return;

      try {
        const response = await fetch("/api/user/me");
        const userData = await response.json();
        
        if (!userData.riotAccounts || userData.riotAccounts.length === 0) return;

        for (const account of userData.riotAccounts) {
          const { name, tag, id: riotAccountId } = account;
          const trackerRes = await fetch(`/api/proxy/tracker?name=\${name}&tag=\${tag}`);
          const stats = await trackerRes.json();

          if (stats.success) {
            await fetch("/api/user/sync-stats", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tier: stats.tier,
                kd: stats.kd,
                winRate: stats.winRate,
                riotAccountId
              })
            });
          }
        }
        localStorage.setItem("last_stat_sync", now.toString());
      } catch (error) {
        console.error("Stat sync failed:", error);
      }
    };

    if (window.requestIdleCallback) {
      window.requestIdleCallback(() => syncStats());
    } else {
      setTimeout(syncStats, 5000);
    }
  }, [session]);

  return <>{children}</>;
}
// ------------------------

const BASE_TABS = [
  { href: "/dashboard", label: "내전 현황", icon: "🏠" },
  { href: "/dashboard/ranking", label: "KD 랭킹", icon: "🏆" },
  { href: "/dashboard/members", label: "멤버", icon: "●" },
  { href: "/dashboard/help", label: "도움말", icon: "❓" },
  { href: "/dashboard/riot-connect", label: "계정 연동", icon: "🔗" },
];

const ADMIN_TAB = { href: "/dashboard/admin", label: "관리", icon: "⚙️" };

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [navigating, setNavigating] = useState(false);
  const [showRiotRequired, setShowRiotRequired] = useState(false);
  const [showMyProfile, setShowMyProfile] = useState(false);
  const [myProfileBio, setMyProfileBio] = useState("");
  const [myValorantRole, setMyValorantRole] = useState<string | null>(null);
  const [myFavoriteAgents, setMyFavoriteAgents] = useState<string[]>([]);
  const [myRiotAccounts, setMyRiotAccounts] = useState<any[]>([]);
  const [serverNickname, setServerNickname] = useState<string | null>(null);

  const isAdmin = (session?.user as any)?.role === "ADMIN" || (session?.user as any)?.role === "VALONEKKI";

  useEffect(() => {
    setNavigating(false);
  }, [pathname]);

  const tabs = isAdmin ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS;
  const activeHref = [...tabs]
    .sort((left, right) => right.href.length - left.href.length)
    .find((tab) => pathname === tab.href || pathname.startsWith(tab.href + "/"))?.href;

  const displayName = serverNickname ?? session?.user?.name ?? "";

  return (
    <StatSyncBackground>
      <div className="val-shell min-h-screen flex flex-col">
        <header className="val-header flex-shrink-0">
          <div className="max-w-screen-2xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <img
                src="/valosegi-logo.png"
                alt="Logo"
                className="h-8 w-auto object-contain transition-transform group-hover:scale-105"
              />
            </Link>
            <div className="flex items-center gap-3">
              <HeaderRiotLink />
              <button
                onClick={() => setShowMyProfile(true)}
                className="val-mini-button flex items-center gap-2"
              >
                {session?.user?.image ? (
                  <img src={session.user.image} className="h-5 w-5 rounded-full" alt="" />
                ) : (
                  <span className="w-5 h-5 bg-[#2a3540] rounded-full flex items-center justify-center text-[10px]">?</span>
                )}
                <span className="hidden sm:inline">{displayName}</span>
              </button>
              <button onClick={() => signOut({ callbackUrl: "/" })} className="val-mini-button">로그아웃</button>
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
                  className={`val-nav-link ${isActive ? "is-active" : ""}`}
                >
                  <span className="val-nav-icon">{tab.icon}</span>
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
      </div>
    </StatSyncBackground>
  );
}
// REBUILD_TRIGGER: Mon May 11 23:55:23 EDT 2026
