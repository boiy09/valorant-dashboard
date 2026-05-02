"use client";

import { useState } from "react";

function QrCard({ src, alt, title, desc }: { src: string; alt: string; title: string; desc: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="val-card p-6 flex flex-col items-center gap-4">
      <div className="bg-[#5865f2]/20 border border-[#5865f2]/30 text-[#a5b4fc] text-sm font-bold px-4 py-1.5 rounded-full">
        {title}
      </div>
      <div className="w-44 h-44 bg-white rounded-2xl overflow-hidden flex items-center justify-center p-2 shadow-lg">
        {!failed ? (
          <img src={src} alt={alt} className="w-full h-full object-contain" onError={() => setFailed(true)} />
        ) : (
          <div className="w-full h-full bg-[#f0f0f0] rounded-xl flex flex-col items-center justify-center gap-2 p-3">
            <div className="grid grid-cols-3 gap-0.5 opacity-20">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className={`w-4 h-4 rounded-sm ${[0,2,6,8,4].includes(i) ? "bg-black" : "bg-transparent"}`} />
              ))}
            </div>
            <span className="text-[10px] text-gray-500 text-center leading-tight mt-1">
              {src} 파일을<br />public/ 폴더에 넣어주세요
            </span>
          </div>
        )}
      </div>
      <div className="text-center">
        <div className="text-[#7b8a96] text-xs mt-0.5">{desc}</div>
      </div>
    </div>
  );
}

export default function QrSection() {
  return (
    <section className="max-w-5xl mx-auto px-4 pb-20 w-full">
      <div className="text-center mb-10">
        <div className="text-[#ff4655] text-xs tracking-widest uppercase mb-2">서버 참가</div>
        <h2 className="text-2xl font-black text-white">QR 코드로 바로 참가</h2>
        <p className="text-[#7b8a96] text-sm mt-2">스마트폰 카메라로 스캔하세요</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
        <QrCard
          src="/qr-discord.png"
          alt="디스코드 입장 QR"
          title="디스코드 입장 QR"
          desc="발로세끼 Discord 서버 참가"
        />
        <QrCard
          src="/qr-kakaotalk.png"
          alt="오픈채팅 입장 QR"
          title="오픈채팅 입장 QR"
          desc="카카오톡 오픈채팅 참가"
        />
      </div>
    </section>
  );
}
