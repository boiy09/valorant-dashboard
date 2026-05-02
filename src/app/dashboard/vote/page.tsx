"use client";

import { useState, useEffect } from "react";

interface VoteOption {
  id: string;
  label: string;
  _count: { responses: number };
}

interface Vote {
  id: string;
  question: string;
  isMultiple: boolean;
  endsAt: string | null;
  createdAt: string;
  options: VoteOption[];
  author: { name: string | null; image: string | null } | null;
}

export default function VotePage() {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/vote")
      .then(r => r.json())
      .then(d => setVotes(d.votes ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-6">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">VALORANT DASHBOARD</div>
        <h1 className="text-2xl font-black text-white">투표</h1>
        <p className="text-[#7b8a96] text-sm mt-0.5">Discord에서 <code className="bg-[#111c24] px-1 rounded">/투표 만들기</code> 로 투표를 만들 수 있어요</p>
      </div>

      {loading ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">로딩 중...</div>
      ) : votes.length === 0 ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">진행 중인 투표가 없어요</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {votes.map(v => <VoteCard key={v.id} vote={v} />)}
        </div>
      )}
    </div>
  );
}

function VoteCard({ vote }: { vote: Vote }) {
  const total = vote.options.reduce((s, o) => s + o._count.responses, 0);
  const isExpired = vote.endsAt ? new Date(vote.endsAt) < new Date() : false;

  return (
    <div className="val-card p-5">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex-1">
          <div className="text-white font-bold mb-1">{vote.question}</div>
          <div className="flex items-center gap-2">
            {vote.author?.image && <img src={vote.author.image} alt="" className="w-4 h-4 rounded-full" />}
            <span className="text-[#7b8a96] text-xs">{vote.author?.name}</span>
            {vote.isMultiple && (
              <span className="text-xs text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">복수 선택</span>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          {isExpired ? (
            <span className="text-xs text-[#7b8a96] bg-[#1a242d] px-2 py-0.5 rounded">종료됨</span>
          ) : vote.endsAt ? (
            <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded">진행 중</span>
          ) : (
            <span className="text-xs text-[#ff4655] bg-[#ff4655]/10 px-2 py-0.5 rounded">상시</span>
          )}
          <div className="text-[#7b8a96] text-xs mt-1">{total}표</div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {vote.options.map(opt => {
          const pct = total > 0 ? Math.round(opt._count.responses / total * 100) : 0;
          const isTop = opt._count.responses === Math.max(...vote.options.map(o => o._count.responses)) && opt._count.responses > 0;
          return (
            <div key={opt.id}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm ${isTop ? "text-white font-bold" : "text-[#7b8a96]"}`}>{opt.label}</span>
                <span className={`text-xs font-bold ${isTop ? "text-[#ff4655]" : "text-[#7b8a96]"}`}>{pct}% ({opt._count.responses})</span>
              </div>
              <div className="h-1.5 bg-[#111c24] rounded-full">
                <div className="h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: isTop ? "#ff4655" : "#2a3540" }} />
              </div>
            </div>
          );
        })}
      </div>

      {vote.endsAt && (
        <div className="mt-3 text-[#7b8a96] text-xs">
          {isExpired ? "종료: " : "마감: "}
          {new Date(vote.endsAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
}
