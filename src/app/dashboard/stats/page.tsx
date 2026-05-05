"use client";

import { useEffect, useState } from "react";

type RiotRegion = "KR" | "AP";

interface AgentStats {
  agent: string;
  games: number;
  winRate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgKDA: number;
}

interface FormStats {
  game: string;
  result: string;
  score: string;
  kda: number;
}

interface ServerStats {
  totalPlayers: number;
  totalMatches: number;
  serverWinRate: number;
  avgKDA: string;
  topRanks: { name: string; count: number }[];
  region: RiotRegion;
}

const REGIONS: RiotRegion[] = ["KR", "AP"];

export default function StatsPage() {
  const [serverStats, setServerStats] = useState<ServerStats | null>(null);
  const [agentStats, setAgentStats] = useState<AgentStats[]>([]);
  const [formStats, setFormStats] = useState<FormStats[]>([]);
  const [region, setRegion] = useState<RiotRegion>("KR");
  const [accountMessage, setAccountMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [serverRes, agentRes, formRes] = await Promise.all([
          fetch(`/api/stats?type=server&region=${region}`),
          fetch(`/api/stats?type=agents&region=${region}`),
          fetch(`/api/stats?type=form&region=${region}`),
        ]);

        const serverData = await serverRes.json();
        const agentData = await agentRes.json();
        const formData = await formRes.json();

        setServerStats(serverData);
        setAgentStats(agentData.data ?? []);
        setFormStats(formData.data ?? []);
        setAccountMessage(agentData.message ?? formData.message ?? "");
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setLoading(false);
      }
    }

    setLoading(true);
    fetchStats();
  }, [region]);

  if (loading) {
    return (
      <div className="text-[#7b8a96] text-sm flex items-center justify-center min-h-[40vh]">
        통계 데이터를 불러오는 중입니다...
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">TEAM ANALYTICS</div>
          <h1 className="text-2xl font-black text-white">통계 분석</h1>
          <p className="text-[#7b8a96] text-sm mt-0.5">서버 전체 흐름과 개인 전적 흐름을 지역별로 확인할 수 있습니다.</p>
        </div>
        <div className="val-card p-1 flex gap-1 self-start">
          {REGIONS.map((item) => (
            <button
              key={item}
              onClick={() => setRegion(item)}
              className={`px-3 py-1.5 rounded text-xs font-bold transition ${
                region === item ? "bg-[#ff4655] text-white" : "text-[#7b8a96] hover:text-white"
              }`}
            >
              {item} · {item === "KR" ? "한섭" : "아섭"}
            </button>
          ))}
        </div>
      </div>

      {accountMessage && (
        <div className="val-card p-4 mb-6 text-sm text-[#7b8a96]">
          {accountMessage}
        </div>
      )}

      {serverStats && (
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <div className="val-card p-6">
            <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-2">활성 플레이어</div>
            <div className="text-3xl font-black text-white">{serverStats.totalPlayers}</div>
          </div>
          <div className="val-card p-6">
            <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-2">총 매치 수</div>
            <div className="text-3xl font-black text-white">{serverStats.totalMatches}</div>
          </div>
          <div className="val-card p-6">
            <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-2">서버 평균 승률</div>
            <div className="text-3xl font-black text-[#ff4655]">{serverStats.serverWinRate}%</div>
          </div>
          <div className="val-card p-6">
            <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-2">평균 KDA</div>
            <div className="text-3xl font-black text-white">{serverStats.avgKDA}</div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="val-card p-6">
          <h2 className="text-lg font-bold text-white mb-4">요원별 통계</h2>
          <div className="space-y-3">
            {agentStats.length > 0 ? (
              agentStats.map((agent) => (
                <div key={agent.agent} className="bg-[#0f1923] p-4 rounded border border-[#2a3540]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white">{agent.agent}</span>
                    <span className="text-[#ff4655] text-sm">{agent.winRate}% 승률</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <div>
                      <div className="text-[#7b8a96] text-xs">게임 수</div>
                      <div className="text-white">{agent.games}</div>
                    </div>
                    <div>
                      <div className="text-[#7b8a96] text-xs">평균 킬</div>
                      <div className="text-white">{agent.avgKills}</div>
                    </div>
                    <div>
                      <div className="text-[#7b8a96] text-xs">평균 데스</div>
                      <div className="text-white">{agent.avgDeaths}</div>
                    </div>
                    <div>
                      <div className="text-[#7b8a96] text-xs">평균 KDA</div>
                      <div className="text-white">{agent.avgKDA}</div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[#7b8a96] text-sm">표시할 요원 통계가 아직 없습니다.</div>
            )}
          </div>
        </div>

        <div className="val-card p-6">
          <h2 className="text-lg font-bold text-white mb-4">최근 경기 폼</h2>
          <div className="space-y-3">
            {formStats.length > 0 ? (
              formStats.map((match) => (
                <div
                  key={match.game}
                  className="bg-[#0f1923] p-4 rounded border border-[#2a3540] flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-white">{match.game}</div>
                    <div className="text-[#7b8a96] text-sm">{match.score}</div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`font-bold ${
                        match.result === "승리" ? "text-green-400" : match.result === "패배" ? "text-[#ff4655]" : "text-zinc-400"
                      }`}
                    >
                      {match.result}
                    </div>
                    <div className="text-[#7b8a96] text-sm">KDA {match.kda}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[#7b8a96] text-sm">표시할 최근 경기 데이터가 아직 없습니다.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
