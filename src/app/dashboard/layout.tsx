'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import HeaderRiotLink from './HeaderRiotLink';
import MemberSidebar from './MemberSidebar';
import ProfileModal from './ProfileModal';

function StatSyncBackground({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  useEffect(() => {
    if (!session?.user) return;
    const syncStats = async () => {
      const lastSync = localStorage.getItem('last_stat_sync');
      const now = Date.now();
      if (lastSync && now - parseInt(lastSync) < 3600000) return;
      try {
        const response = await fetch('/api/user/me');
        const userData = await response.json();
        if (!userData.riotAccounts || userData.riotAccounts.length === 0) return;
        for (const account of userData.riotAccounts) {
          const { name, tag, id: riotAccountId } = account;
          const trackerRes = await fetch(`/api/proxy/tracker?name=${encodeURIComponent(name)}&tag=${encodeURIComponent(tag)}`);
          const stats = await trackerRes.json();
          if (stats.success) {
            await fetch('/api/user/sync-stats', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tier: stats.tier, kd: stats.kd, winRate: stats.winRate, riotAccountId })
            });
          }
        }
        localStorage.setItem('last_stat_sync', now.toString());
      } catch (error) { console.error('Stat sync failed:', error); }
    };
    if (window.requestIdleCallback) { window.requestIdleCallback(() => syncStats()); }
    else { setTimeout(syncStats, 5000); }
  }, [session]);
  return <>{children}</>;
}

const BASE_TABS = [
  { href: '/dashboard', label: '대시보드', icon: '⌂' },
  { href: '/dashboard/riot-connect', label: '라이엇 연동', icon: '⛓' },
  { href: '/dashboard/valorant', label: '전적', icon: '◎' },
  { href: '/dashboard/scrim', label: '내전', icon: '⚔' },
  { href: '/dashboard/schedule', label: '일정', icon: '▤' },
  { href: '/dashboard/announce', label: '공지', icon: '▰' },
  { href: '/dashboard/highlight', label: '하이라이트', icon: '▸' },
  { href: '/dashboard/members', label: '멤버', icon: '●' },
  { href: '/dashboard/help', label: '도움말', icon: '❓' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [navigating, setNavigating] = useState(false);
  const [showMyProfile, setShowMyProfile] = useState(false);
  const [userData, setUserData] = useState<any>(null);

  useEffect(() => { setNavigating(false); }, [pathname]);
  useEffect(() => {
    if (session?.user) {
      fetch('/api/user/me').then(res => res.json()).then(data => setUserData(data));
    }
  }, [session]);

  const isAdmin = (session?.user as any)?.role === 'ADMIN' || (session?.user as any)?.role === 'VALONEKKI';
  const tabs = isAdmin ? [...BASE_TABS, { href: '/dashboard/admin', label: '관리', icon: '!' }] : BASE_TABS;
  const activeHref = [...tabs].sort((a, b) => b.href.length - a.href.length).find(t => pathname.startsWith(t.href))?.href;
  const displayName = userData?.serverNickname ?? session?.user?.name ?? '';

  return (
    <StatSyncBackground>
      <div className="val-shell min-h-screen flex flex-col relative">
        <div className="fixed inset-0 z-0 pointer-events-none opacity-30 bg-cover bg-center" style={{ backgroundImage: "url('/val-bg-agents.png')" }} />
        <div className="fixed inset-0 z-0 pointer-events-none bg-gradient-to-b from-[#0f1923] via-transparent to-[#0f1923]" />
        <header className="val-header flex-shrink-0 relative z-20">
          <div className="max-w-screen-2xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/dashboard"><img src="/valosegi-logo.png" alt="Logo" className="h-10 w-auto" /></Link>
            <div className="flex items-center gap-3">
              <HeaderRiotLink />
              <button onClick={() => setShowMyProfile(true)} className="flex items-center gap-2 rounded border border-[#2a3540]/75 bg-[#0f1923]/70 px-2.5 py-1.5">
                {session?.user?.image ? <img src={session.user.image} className="h-7 w-7 rounded-full" /> : <span className="h-7 w-7 rounded-full bg-[#2a3540]" />}
                <span className="hidden sm:block text-xs font-bold text-[#ece8e1]">{displayName}</span>
              </button>
              <button onClick={() => signOut({ callbackUrl: '/' })} className="val-mini-button">로그아웃</button>
            </div>
          </div>
        </header>
        <nav className="val-nav flex-shrink-0 overflow-x-auto relative z-20">
          <div className="max-w-screen-2xl mx-auto px-2 flex items-stretch gap-1 min-w-max">
            {tabs.map(tab => (
              <Link key={tab.href} href={tab.href} className={`val-nav-link ${tab.href === activeHref ? 'is-active' : ''}`}>
                <span className="val-nav-icon">{tab.icon}</span><span>{tab.label}</span>
              </Link>
            ))}
          </div>
        </nav>
        <div className="val-dashboard-frame relative z-10 flex-1 w-full mx-auto px-4 py-6 flex gap-5 items-start">
          <main className="flex-1 min-w-0 relative z-20">{children}</main>
          <MemberSidebar />
        </div>
        {navigating && <div className="val-nav-loading z-[100]">Loading...</div>}
        {showMyProfile && <ProfileModal title="내 프로필" profile={{ ...userData, name: displayName, image: session?.user?.image }} editable onClose={() => setShowMyProfile(false)} />}
      </div>
    </StatSyncBackground>
  );
}
// FORCE_REBUILD: Mon May 11 23:59:19 EDT 2026
