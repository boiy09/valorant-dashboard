/**
 * Riot 비공식 인증 흐름 (unofficial auth)
 * 비밀번호는 절대 저장하지 않으며 인증에만 사용됩니다.
 */

const AUTH_URL = "https://auth.riotgames.com/api/v1/authorization";
const ENTITLEMENTS_URL = "https://entitlements.auth.riotgames.com/api/token/v1";
const USERINFO_URL = "https://auth.riotgames.com/userinfo";
const GEO_URL = "https://riot-geo.pas.si.riotgames.com/pas/v1/product/valorant";

// Riot 클라이언트로 위장하는 헤더
const USER_AGENT = "RiotClient/86.0.2.1441.2510 %s (Windows;10;;Professional, x64)";

const BASE_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
};

const AUTH_CLIENT_PAYLOAD = {
  client_id: "play-valorant-web-prod",
  nonce: "1",
  redirect_uri: "https://playvalorant.com/opt_in",
  response_type: "token id_token",
  scope: "account openid",
};

export type AuthResult =
  | { status: "success"; accessToken: string; idToken: string; cookies: string }
  | { status: "mfa"; cookies: string }
  | { status: "error"; message: string };

export interface AuthTokens {
  accessToken: string;
  entitlementsToken: string;
  puuid: string;
  gameName: string;
  tagLine: string;
  region: string;
  ssid: string;
}

function parseCookies(response: Response): string {
  // getSetCookie()는 Node.js 19+에서 사용 가능
  // 구버전 호환을 위해 raw headers도 처리
  const setCookieHeaders: string[] =
    typeof (response.headers as any).getSetCookie === "function"
      ? (response.headers as any).getSetCookie()
      : (() => {
          const raw = response.headers.get("set-cookie");
          return raw ? raw.split(/,(?=[^;]+=[^;]*)/) : [];
        })();

  return setCookieHeaders
    .map((cookie: string) => cookie.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

function extractSsid(cookies: string): string {
  const match = cookies.match(/(?:^|;\s*)(ssid=[^;]+)/);
  return match?.[1] ?? "";
}

function parseTokensFromUri(uri: string): { accessToken: string; idToken: string } | null {
  try {
    const hashIndex = uri.indexOf("#");
    if (hashIndex === -1) return null;
    const params = new URLSearchParams(uri.slice(hashIndex + 1));
    const accessToken = params.get("access_token");
    const idToken = params.get("id_token");
    if (!accessToken || !idToken) return null;
    return { accessToken, idToken };
  } catch {
    return null;
  }
}

async function step1Init(): Promise<{ cookies: string } | { error: string }> {
  try {
    const response = await fetch(AUTH_URL, {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(AUTH_CLIENT_PAYLOAD),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(`[riotAuth] step1 실패 ${response.status}:`, text);
      return { error: `인증 서버 오류: ${response.status}` };
    }

    const cookies = parseCookies(response);
    console.log(`[riotAuth] step1 쿠키 수: ${cookies.split(";").length}`);
    return { cookies };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: `네트워크 오류: ${message}` };
  }
}

async function step2Auth(
  cookies: string,
  username: string,
  password: string
): Promise<AuthResult> {
  try {
    const response = await fetch(AUTH_URL, {
      method: "PUT",
      headers: {
        ...BASE_HEADERS,
        "Content-Type": "application/json",
        Cookie: cookies,
      },
      body: JSON.stringify({
        type: "auth",
        username,
        password,
        remember: true,
        language: "ko_KR",
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(`[riotAuth] step2 실패 ${response.status}:`, text);
      return { status: "error", message: `인증 서버 오류: ${response.status}` };
    }

    const newCookies = parseCookies(response);
    const mergedCookies = mergeCookies(cookies, newCookies);

    const data = await response.json() as Record<string, unknown>;
    console.log(`[riotAuth] step2 응답 type:`, data.type);

    if (data.type === "response") {
      const uri = (data as any)?.response?.parameters?.uri as string | undefined;
      if (!uri) return { status: "error", message: "토큰 URI를 찾을 수 없습니다." };
      const tokens = parseTokensFromUri(uri);
      if (!tokens) return { status: "error", message: "토큰 파싱에 실패했습니다." };
      return { status: "success", ...tokens, cookies: mergedCookies };
    }

    if (data.type === "multifactor") {
      return { status: "mfa", cookies: mergedCookies };
    }

    // data.type === "auth" = 인증 실패
    const error = (data as any)?.error as string | undefined;
    console.error(`[riotAuth] 인증 실패:`, error, data);
    return { status: "error", message: "아이디 또는 비밀번호가 올바르지 않습니다." };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { status: "error", message: `네트워크 오류: ${message}` };
  }
}

function mergeCookies(base: string, incoming: string): string {
  if (!incoming) return base;
  const map = new Map<string, string>();
  for (const part of base.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    const key = eqIdx === -1 ? trimmed : trimmed.slice(0, eqIdx);
    map.set(key, trimmed);
  }
  for (const part of incoming.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    const key = eqIdx === -1 ? trimmed : trimmed.slice(0, eqIdx);
    map.set(key, trimmed);
  }
  return Array.from(map.values()).join("; ");
}

export async function initRiotAuth(username: string, password: string): Promise<AuthResult> {
  const init = await step1Init();
  if ("error" in init) return { status: "error", message: init.error };
  return step2Auth(init.cookies, username, password);
}

export async function submitMfa(cookies: string, code: string): Promise<AuthResult> {
  try {
    const response = await fetch(AUTH_URL, {
      method: "PUT",
      headers: {
        ...BASE_HEADERS,
        "Content-Type": "application/json",
        Cookie: cookies,
      },
      cache: "no-store",
      body: JSON.stringify({
        type: "multifactor",
        code,
        rememberDevice: true,
      }),
    });

    if (!response.ok) {
      return { status: "error", message: `인증 서버 오류: ${response.status}` };
    }

    const newCookies = parseCookies(response);
    const mergedCookies = mergeCookies(cookies, newCookies);
    const data = await response.json() as Record<string, unknown>;

    if (data.type === "response") {
      const uri = (data as any)?.response?.parameters?.uri as string | undefined;
      if (!uri) return { status: "error", message: "토큰 URI를 찾을 수 없습니다." };
      const tokens = parseTokensFromUri(uri);
      if (!tokens) return { status: "error", message: "토큰 파싱에 실패했습니다." };
      return { status: "success", ...tokens, cookies: mergedCookies };
    }

    return { status: "error", message: "2단계 인증 코드가 올바르지 않습니다." };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { status: "error", message: `네트워크 오류: ${message}` };
  }
}

export async function getAuthTokens(
  accessToken: string,
  idToken: string,
  cookies: string
): Promise<AuthTokens> {
  // Step 4: entitlements token
  const entResponse = await fetch(ENTITLEMENTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({}),
  });

  if (!entResponse.ok) {
    throw new Error(`Entitlements 오류: ${entResponse.status}`);
  }

  const entData = await entResponse.json() as { entitlements_token: string };
  const entitlementsToken = entData.entitlements_token;

  // Step 5: userinfo
  const userResponse = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userResponse.ok) {
    throw new Error(`Userinfo 오류: ${userResponse.status}`);
  }

  const userData = await userResponse.json() as {
    sub: string;
    acct: { game_name: string; tag_line: string };
  };

  const puuid = userData.sub;
  const gameName = userData.acct?.game_name ?? "";
  const tagLine = userData.acct?.tag_line ?? "";

  // Step 6: region
  const geoResponse = await fetch(GEO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ id_token: idToken }),
  });

  let region = "kr";
  if (geoResponse.ok) {
    const geoData = await geoResponse.json() as { affinities?: { live?: string } };
    region = geoData.affinities?.live ?? "kr";
  }

  const ssid = extractSsid(cookies);

  return {
    accessToken,
    entitlementsToken,
    puuid,
    gameName,
    tagLine,
    region,
    ssid,
  };
}

export async function refreshTokens(ssid: string): Promise<AuthResult> {
  // Step 1: 새 쿠키 초기화
  const init = await step1Init();
  if ("error" in init) return { status: "error", message: init.error };

  // ssid 쿠키를 병합해서 Step 2 시도 (re-auth without password)
  const cookiesWithSsid = mergeCookies(init.cookies, ssid);

  try {
    // ssid로 무인증 토큰 재발급 시도
    const response = await fetch(AUTH_URL, {
      method: "GET",
      headers: {
        ...BASE_HEADERS,
        Cookie: cookiesWithSsid,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return { status: "error", message: `토큰 갱신 실패: ${response.status}` };
    }

    const newCookies = parseCookies(response);
    const mergedCookies = mergeCookies(cookiesWithSsid, newCookies);
    const data = await response.json() as Record<string, unknown>;

    if (data.type === "response") {
      const uri = (data as any)?.response?.parameters?.uri as string | undefined;
      if (!uri) return { status: "error", message: "토큰 URI를 찾을 수 없습니다." };
      const tokens = parseTokensFromUri(uri);
      if (!tokens) return { status: "error", message: "토큰 파싱에 실패했습니다." };
      return { status: "success", ...tokens, cookies: mergedCookies };
    }

    return { status: "error", message: "세션이 만료되었습니다. 재로그인이 필요합니다." };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { status: "error", message: `네트워크 오류: ${message}` };
  }
}
