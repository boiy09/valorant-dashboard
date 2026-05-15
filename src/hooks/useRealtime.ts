"use client";

import { useEffect, useRef, useCallback } from "react";

type RealtimeHandler = (data: Record<string, unknown>) => void;

const WS_URL = process.env.NEXT_PUBLIC_WS_URL;
const RECONNECT_DELAY_MS = 3000;

// 전역 싱글톤 WebSocket (탭마다 따로 연결하지 않음)
let globalWs: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const subscribers = new Map<string, Set<RealtimeHandler>>();

function getWs(): WebSocket | null {
  if (!WS_URL) return null;
  if (globalWs && (globalWs.readyState === WebSocket.OPEN || globalWs.readyState === WebSocket.CONNECTING)) {
    return globalWs;
  }
  return connect();
}

function connect(): WebSocket | null {
  if (!WS_URL) return null;
  try {
    const ws = new WebSocket(WS_URL);
    globalWs = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string; data: Record<string, unknown> };
        if (!msg.type || msg.type === "connected") return;

        // 정확한 타입 구독자에게 전달
        const exact = subscribers.get(msg.type);
        if (exact) exact.forEach((fn) => fn(msg.data));

        // 와일드카드 구독자에게 전달 (예: "scrim" → "scrim:123" 이벤트도 수신)
        const prefix = msg.type.split(":")[0];
        if (prefix !== msg.type) {
          const wild = subscribers.get(prefix + ":*");
          if (wild) wild.forEach((fn) => fn(msg.data));
        }
      } catch {
        // 무시
      }
    };

    ws.onclose = () => {
      globalWs = null;
      if (subscribers.size > 0) {
        reconnectTimer = setTimeout(() => connect(), RECONNECT_DELAY_MS);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    return ws;
  } catch {
    return null;
  }
}

function subscribe(type: string, handler: RealtimeHandler) {
  if (!subscribers.has(type)) subscribers.set(type, new Set());
  subscribers.get(type)!.add(handler);
  getWs();
}

function unsubscribe(type: string, handler: RealtimeHandler) {
  subscribers.get(type)?.delete(handler);
  if (subscribers.get(type)?.size === 0) subscribers.delete(type);
  if (subscribers.size === 0 && reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/**
 * 실시간 이벤트 구독 훅
 * @param type 이벤트 타입 (예: "scrim", "scrim:abc123", "schedule", "announce", "highlight", "members", "admin")
 * @param handler 이벤트 수신 시 호출할 함수
 */
export function useRealtime(type: string | string[], handler: RealtimeHandler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const stableHandler = useCallback((data: Record<string, unknown>) => {
    handlerRef.current(data);
  }, []);

  useEffect(() => {
    const types = Array.isArray(type) ? type : [type];
    types.forEach((t) => subscribe(t, stableHandler));
    return () => {
      types.forEach((t) => unsubscribe(t, stableHandler));
    };
  }, [type, stableHandler]);
}
