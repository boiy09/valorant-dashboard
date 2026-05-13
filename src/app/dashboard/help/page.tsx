"use client";

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">도움말</h1>
        
        <div className="space-y-8">
          {/* 데이터 수집 방식 */}
          <section className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
            <h2 className="text-2xl font-bold mb-4 text-yellow-400">📊 데이터 수집 방식</h2>
            <p className="mb-3">우리 사이트는 다음과 같은 방식으로 전적 데이터를 수집합니다:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li><strong>Tracker.gg 연동:</strong> 사용자의 브라우저를 통해 Tracker.gg의 공개 데이터를 가져옵니다.</li>
              <li><strong>실시간 업데이트:</strong> 대시보드 접속 시 백그라운드에서 자동으로 최신 전적을 갱신합니다.</li>
              <li><strong>무제한 동기화:</strong> Riot API의 횟수 제한 없이 최신 데이터를 언제든 확인할 수 있습니다.</li>
            </ul>
          </section>

          {/* 랭킹 산정 기준 */}
          <section className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
            <h2 className="text-2xl font-bold mb-4 text-yellow-400">🏆 KD 랭킹 산정 기준</h2>
            <p className="mb-3">KD(Kill/Death) 랭킹은 다음과 같이 계산됩니다:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li><strong>KD 비율:</strong> 전체 킬 수 ÷ 전체 데스 수</li>
              <li><strong>최소 경기 수:</strong> 정확한 랭킹을 위해 최소 5경기 이상 필요합니다.</li>
              <li><strong>실시간 반영:</strong> 새로운 경기가 추가되면 즉시 랭킹이 업데이트됩니다.</li>
            </ul>
          </section>

          {/* 내전 기능 */}
          <section className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
            <h2 className="text-2xl font-bold mb-4 text-yellow-400">⚔️ 내전 관리 기능</h2>
            <p className="mb-3">내전 기능을 통해 팀 경기를 효율적으로 관리할 수 있습니다:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li><strong>내전 생성:</strong> 새로운 내전을 만들고 참가자를 추가합니다.</li>
              <li><strong>경기 기록:</strong> 각 경기의 킬, 데스, 어시스트를 입력합니다.</li>
              <li><strong>자동 동기화:</strong> 내전이 종료되면 자동으로 개인 전적에 반영됩니다.</li>
            </ul>
          </section>

          {/* FAQ */}
          <section className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
            <h2 className="text-2xl font-bold mb-4 text-yellow-400">❓ 자주 묻는 질문</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-lg mb-2">Q: 데이터가 업데이트되지 않습니다.</h3>
                <p className="text-gray-300">A: 브라우저를 새로고침하고 잠시 기다려 주세요. 백그라운드에서 자동으로 최신 데이터를 가져옵니다. (약 5~10초 소요)</p>
              </div>
              <div>
                <h3 className="font-bold text-lg mb-2">Q: 내 전적이 다르게 표시됩니다.</h3>
                <p className="text-gray-300">A: Tracker.gg의 데이터를 기반으로 하므로, 해당 사이트의 업데이트 시간에 따라 약간의 지연이 있을 수 있습니다.</p>
              </div>
              <div>
                <h3 className="font-bold text-lg mb-2">Q: 계정을 여러 개 연동할 수 있나요?</h3>
                <p className="text-gray-300">A: 네, 계정 연동 페이지에서 여러 Riot 계정을 추가할 수 있습니다.</p>
              </div>
            </div>
          </section>

          {/* 문의 */}
          <section className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
            <h2 className="text-2xl font-bold mb-4 text-yellow-400">📧 문의</h2>
            <p className="text-gray-300">추가 질문이나 버그 신고는 Discord 또는 이메일로 연락 주시기 바랍니다.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
