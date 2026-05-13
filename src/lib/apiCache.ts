/**
 * 서버사이드 인메모리 TTL 캐시
 * Vercel 서버리스 환경에서 같은 인스턴스 내 중복 호출을 방지합니다.
 */

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

class ApiCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  get<T>(key: string, ttlMs: number): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > ttlMs) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  getStale<T>(key: string): { data: T; ageMs: number } | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    return { data: entry.data, ageMs: Date.now() - entry.cachedAt };
  }

  set<T>(key: string, data: T): void {
    this.store.set(key, { data, cachedAt: Date.now() });
  }

  cacheAge(key: string): number {
    const entry = this.store.get(key);
    return entry ? Date.now() - entry.cachedAt : -1;
  }

  /** TTL 캐시 + 동시 중복 요청 방지 */
  async getOrFetch<T>(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>
  ): Promise<{ data: T; cached: boolean; ageMs: number }> {
    const cached = this.get<T>(key, ttlMs);
    if (cached !== null) {
      return { data: cached, cached: true, ageMs: this.cacheAge(key) };
    }

    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) {
      const data = await existing;
      return { data, cached: true, ageMs: 0 };
    }

    const promise = fetcher();
    this.inflight.set(key, promise as Promise<unknown>);

    try {
      const data = await promise;
      this.set(key, data);
      return { data, cached: false, ageMs: 0 };
    } finally {
      this.inflight.delete(key);
    }
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  size(): number {
    return this.store.size;
  }
}

export const apiCache = new ApiCache();

// TTL 상수 (ms)
export const TTL = {
  SHORT: 3 * 60 * 1000,      // 3분 - 실시간성 높은 데이터
  MEDIUM: 10 * 60 * 1000,    // 10분 - 전적/랭크
  LONG: 30 * 60 * 1000,      // 30분 - VCT 일정 등
  VERY_LONG: 60 * 60 * 1000, // 1시간 - 게임 콘텐츠(에이전트/맵)
} as const;
