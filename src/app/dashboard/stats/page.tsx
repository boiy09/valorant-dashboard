"use client";

import { useState, useEffect } from "react";

interface AgentStat { agent: string; games: number; winRate: number; avgKills: string; kd: string; }

export default function StatsPage() {
  const [view, setView] = useState<"agents" | "form" | "server">("agents");
  const [agents, setAgents] = useState<AgentStat[]>([]);
  const [form, setForm] = useState<any>(null);
  const [server, setServer] = useState<any>(null);

  const [agentError, setAgentError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stats?type=agents")
      .then(r => r.json())
      .then(d => {
        if (d.error) setAgentError(d.error);
        else setAgents(d.agents ?? []);
      })
      .catch(() => setAgentError("데이터를 불러오지 못했어요."));
    fetch("/api/stats?type=server")
      .then(r => r.ok ? r.json() : Promise.resolve(null))
      .then(d => setServer(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (view === "form" && !form) {
      fetch("/api/stats?type=form")
        .then(r => r.ok ? r.json() : Promise.resolve({}))
        .then(setForm)
        .catch(() => {});
    }
  }, [view]);

  return (
    <div>
      <div className="mb-6">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">VALORANT DASHBOARD</div>
        <h1 className="text-2xl font-black text-white">전적 분석</h1>
        <p className="text-[#7b8a96] text-sm mt-0.5">에이전트별 통계, 최근 폼, 서버 전체 현황</p>
      </div>

      <div className="flex gap-2 mb-6">
        {([["agents", "에이전트별"], ["form", "폼 분석"], ["server", "서버 통계"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setView(v)}
            className={`val-btn px-5 py-2 text-sm font-medium ${view === v ? "bg-[#ff4655] text-white" : "bg-[#1a242d] text-[#7b8a96] hover:text-white"}`}>
            {l}
          </button>
        ))}
      </div>

      {view === "agents" && (
        agentError
          ? <div className="val-card p-12 text-center text-[#ff4655] text-sm">{agentError}</div>
          : agents.length === 0
          ? <div className="val-card p-12 text-center text-[#7b8a96]">라이엇 계정을 연동하면 에이전트 통계가 표시돼요</div>
          : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {agents.map(a => (
                <div key={a.agent} className="val-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-white font-bold">{a.agent}</span>
                    <span className="text-xs text-[#7b8a96]">{a.games}판</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center mb-3">
                    <div>
                      <div className={`font-black text-lg ${a.winRate >= 50 ? "text-green-400" : "text-[#ff4655]"}`}>{a.winRate}%</div>
                      <div className="text-[#7b8a96] text-xs">승률</div>
                    </div>
                    <div>
                      <div className="text-white font-black text-lg">{a.kd}</div>
                      <div className="text-[#7b8a96] text-xs">KD</div>
                    </div>
                    <div>
                      <div className="text-white font-black text-lg">{a.avgKills}</div>
                      <div className="text-[#7b8a96] text-xs">평킬</div>
                    </div>
                  </div>
                  <div className="h-1 bg-[#111c24] rounded-full">
                    <div className="h-1 rounded-full transition-all" style={{ width: `${a.winRate}%`, background: a.winRate >= 50 ? "#4ade80" : "#ff4655" }} />
                  </div>
                </div>
              ))}
            </div>
      )}

      {view === "form" && (
        !form ? <div className="val-card p-8 text-center text-[#7b8a96]">로딩 중...</div> :
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="val-card p-5">
            <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-4">구간별 폼</div>
            <div className="flex flex-col gap-4">
              {form.form?.map((chunk: any, i: number) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-white text-sm font-medium">{chunk.label}</span>
                    <span className={`text-sm font-bold ${chunk.wins / chunk.games >= 0.5 ? "text-green-400" : "text-[#ff4655]"}`}>
                      {chunk.wins}승 {chunk.games - chunk.wins}패 ({Math.round(chunk.wins / chunk.games * 100)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-[#111c24] rounded-full">
                    <div className="h-2 rounded-full transition-all"
                      style={{ width: `${Math.round(chunk.wins / chunk.games * 100)}%`, background: chunk.wins / chunk.games >= 0.5 ? "#4ade80" : "#ff4655" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="val-card p-5">
            <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-4">최근 10경기 흐름</div>
            <div className="flex gap-1.5 flex-wrap">
              {form.matches?.map((m: any, i: number) => (
                <div key={i} title={`${m.agent} ${m.map} — ${m.kills}/${m.deaths}/${m.assists}`}
                  className={`w-10 h-10 rounded flex flex-col items-center justify-center text-xs font-bold cursor-default
                    ${m.result === "승리" ? "bg-green-400/20 border border-green-400/30 text-green-400" : "bg-[#ff4655]/20 border border-[#ff4655]/30 text-[#ff4655]"}`}>
                  <span>{m.result === "승리" ? "W" : "L"}</span>
                  <span className="text-[10px] opacity-70">{m.kills}k</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === "server" && (
        !server ? <div className="val-card p-8 text-center text-[#7b8a96]">로딩 중...</div> :
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "분석된 매치", value: server.totalMatches },
              { label: "연동 유저",   value: server.totalUsers  },
              { label: "평균 킬",     value: server.avgKills    },
              { label: "평균 데스",   value: server.avgDeaths   },
            ].map(s => (
              <div key={s.label} className="val-card p-4">
                <div className="text-[#7b8a96] text-xs mb-1">{s.label}</div>
                <div className="text-white font-black text-2xl">{s.value}</div>
              </div>
            ))}
          </div>
          <div className="lg:col-span-2 val-card p-5">
            <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-4">서버 인기 에이전트 TOP 10</div>
            <div className="flex flex-col gap-2.5">
              {server.topAgents?.map((a: any, i: number) => (
                <div key={a.agent} className="flex items-center gap-3">
                  <span className="text-[#7b8a96] text-xs w-5 text-right">{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white text-sm">{a.agent}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[#7b8a96] text-xs">{a.games}판</span>
                        <span className={`text-xs font-bold ${a.winRate >= 50 ? "text-green-400" : "text-[#ff4655]"}`}>{a.winRate}%</span>
                      </div>
                    </div>
                    <div className="h-1 bg-[#111c24] rounded-full">
                      <div className="h-1 rounded-full" style={{ width: `${a.winRate}%`, background: a.winRate >= 50 ? "#4ade80" : "#ff4655" }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
