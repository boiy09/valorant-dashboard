"use client";

import { useEffect, useRef, useCallback } from "react";

type RealtimeHandler = (data: Record<string, unknown>) => void;

const subscribers = new Map<string, Set<RealtimeHandler>>();
let lastEventId = 0;
let polling = false;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function dispatch(type: string, data: Record<string, unknown>) {
  const exact = subscribers.get(type);
  if (exact) exact.forEach((fn) => fn(data));

  const prefix = type.split(":")[0];
  if (prefix !== type) {
    const wild = subscribers.get(`${prefix}:*`);
    if (wild) wild.forEach((fn) => fn(data));
  }
}

async function startPolling() {
  if (polling) return;
  polling = true;

  while (subscribers.size > 0) {
    try {
      const res = await fetch(`/api/events?since=${lastEventId}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) { await sleep(1000); continue; }

      const data = (await res.json()) as { events?: Array<{ id: number; type: string; data: Record<string, unknown> }>; lastId?: number };
      const events = data.events ?? [];

      if (typeof data.lastId === "number") lastEventId = data.lastId;

      for (const event of events) {
        dispatch(event.type, event.data);
      }
    } catch {
      await sleep(1000);
    }
  }

  polling = false;
}

function subscribe(type: string, handler: RealtimeHandler) {
  if (!subscribers.has(type)) subscribers.set(type, new Set());
  subscribers.get(type)!.add(handler);
  startPolling();
}

function unsubscribe(type: string, handler: RealtimeHandler) {
  subscribers.get(type)?.delete(handler);
  if (subscribers.get(type)?.size === 0) subscribers.delete(type);
}

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
