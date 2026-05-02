"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import HeaderRiotLink from "./HeaderRiotLink";
import MemberSidebar from "./MemberSidebar";

const BASE_TABS = [
  { href: "/dashboard", label: "대시보드", icon: "D" },
  { href: "/dashboard/valorant", label: "전적", icon: "V" },
  { href: "/dashboard/stats", label: "통계 분석", icon: "S" },
  { href: "/dashboard/scrim", label: "내전", icon: "Q" },
  { href: "/dashboard/schedule", label: "일정", icon: "C" },
  { href: "/dashboard/announce", label: "공지", icon: "N" },
  { href: "/dashboard/vote", label: "투표", icon: "T" },
  { href: "/dashboard/points", label: "포인트", icon: "P" },
  { href: "/dashboard/market", label: "장터", icon: "M" },
  { href: "/dashboard/highlight", label: "하이라이트", icon: "H" },
  { href: "/dashboard/search", label: "전적 검색", icon: "F" },
  { href: "/dashboard/members", label: "멤버", icon: "U" },
];

const ADMIN_TAB = { href: "/dashboard/admin", label: "관리", icon: "A" };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    fetch("/api/me/roles")
      .then((response) => response.json())
      .then((data) => setIsAdmin(data.isAdmin ?? false))
      .catch(() => {});
  }, []);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-[#0f1923] flex items-center justify-center">
        <div className="w-1.5 h-1.5 rounded-full bg-[#ff4655] animate-pulse" />
      </div>
    );
  }

  const tabs = isAdmin ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS;
  const activeHref = [...tabs]
    .sort((a, b) => b.href.length - a.href.length)
    .find((tab) => pathname === tab.href || pathname.startsWith(tab.href + "/"))?.href;

  return (
    <div className="min-h-screen bg-[#0f1923] flex flex-col">
      <div className="h-[2px] w-full bg-gradient-to-r from-[#ff4655] via-[#ff4655]/50 to-transparent flex-shrink-0" />

      <header className="bg-[#111c24] border-b border-[#2a3540] flex-shrink-0">
        <div className="max-w-screen-2xl mx-auto px-4 h-11 flex items-center justify-between">
          <Link href="/dashboard" className="font-black text-sm tracking-[0.2em] text-white">
            VALO<span className="text-[#ff4655]">SEGI</span>
          </Link>

          <div className="flex items-center gap-3">
            <HeaderRiotLink />
            {session?.user?.image && (
              <img
                src={session.user.image}
                alt="avatar"
                className="w-7 h-7 rounded-full border border-[#2a3540]"
              />
            )}
            {session?.user?.name && (
              <span className="text-[#ece8e1] text-xs hidden sm:block">{session.user.name}</span>
            )}
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-[#7b8a96] hover:text-white text-xs transition-colors px-2 py-1 border border-[#2a3540] hover:border-[#7b8a96] rounded"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <nav className="bg-[#0d1821] border-b-2 border-[#1a242d] flex-shrink-0 overflow-x-auto">
        <div className="max-w-screen-2xl mx-auto px-2 flex items-stretch gap-0 min-w-max">
          {tabs.map((tab) => {
            const isActive = tab.href === activeHref;

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? "text-white bg-[#ff4655]/10 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#ff4655]"
                    : "text-[#7b8a96] hover:text-[#ece8e1] hover:bg-white/[0.03]"
                }`}
              >
                <span className="leading-none">{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="flex-1 max-w-screen-2xl w-full mx-auto px-4 py-6 flex gap-5 items-start">
        <main className="flex-1 min-w-0">{children}</main>
        <MemberSidebar />
      </div>
    </div>
  );
}
