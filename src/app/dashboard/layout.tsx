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
  { href: "/dashboard/market", label: "장터", icon: "▧" },
  { href: "/dashboard/highlight", label: "하이라이트", icon: "▸" },
  { href: "/dashboard/search", label: "전적 검색", icon: "⌕" },
  { href: "/dashboard/members", label: "멤버", icon: "●" },
];

const ADMIN_TAB = { href: "/dashboard/admin", label: "관리", icon: "!" };

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
      <div className="val-page-art" aria-hidden="true" />
      <div className="val-page-art-extra val-page-art-extra-left" aria-hidden="true" />
      <div className="val-page-art-extra val-page-art-extra-right" aria-hidden="true" />
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
    </div>
  );
}
