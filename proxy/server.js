'use strict';

const express = require('express');
const fetch = require('node-fetch');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-proxy-secret');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// 보안: PROXY_SECRET 검증
function checkSecret(req, res) {
  const secret = process.env.PROXY_SECRET;
  if (!secret) {
    res.status(500).json({ status: 'error', message: 'PROXY_SECRET 환경변수가 설정되지 않았습니다.' });
    return false;
  }
  if (req.headers['x-proxy-secret'] !== secret) {
    res.status(401).json({ status: 'error', message: '인증되지 않은 요청입니다.' });
    return false;
  }
  return true;
}

const AUTH_URL = 'https://auth.riotgames.com/api/v1/authorization';
const QR_AUTH_URL = 'https://authenticate.riotgames.com/api/v1/login';

const BASE_HEADERS = {
  'User-Agent': 'RiotClient/86.0.2.1441.2510 %s (Windows;10;;Professional, x64)',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

const AUTH_CLIENT_PAYLOAD = {
  client_id: 'play-valorant-web-prod',
  nonce: '1',
  redirect_uri: 'https://playvalorant.com/opt_in',
  response_type: 'token id_token',
  scope: 'account openid',
};

// node-fetch v2: headers.raw()['set-cookie'] 사용
function parseCookies(response) {
  const raw = response.headers.raw();
  const setCookie = raw['set-cookie'] || [];
  return setCookie
    .map(c => c.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

function parseTokensFromUri(uri) {
  try {
    const hashIndex = uri.indexOf('#');
    if (hashIndex === -1) return null;
    const params = new URLSearchParams(uri.slice(hashIndex + 1));
    const accessToken = params.get('access_token');
    const idToken = params.get('id_token');
    if (!accessToken || !idToken) return null;
    return { accessToken, idToken };
  } catch {
    return null;
  }
}

function mergeCookies(base, incoming) {
  const map = new Map();
  for (const part of (base + '; ' + incoming).split(';')) {
    const t = part.trim();
    if (!t) continue;
    const idx = t.indexOf('=');
    const key = idx === -1 ? t : t.slice(0, idx);
    map.set(key, t);
  }
  return Array.from(map.values()).join('; ');
}

// Step 1: 초기화 요청
async function step1Init() {
  const response = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(AUTH_CLIENT_PAYLOAD),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error(`[proxy] step1 실패 ${response.status}:`, text);
    throw new Error(`인증 서버 오류: ${response.status}`);
  }

  const cookies = parseCookies(response);
  return cookies;
}

// Step 2: 아이디/비밀번호 인증
async function step2Auth(cookies, username, password) {
  const response = await fetch(AUTH_URL, {
    method: 'PUT',
    headers: {
      ...BASE_HEADERS,
      'Content-Type': 'application/json',
      Cookie: cookies,
    },
    body: JSON.stringify({
      type: 'auth',
      username,
      password,
      remember: true,
      language: 'en_US',
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error(`[proxy] step2 실패 ${response.status}:`, text);
    throw new Error(`인증 서버 오류: ${response.status}`);
  }

  const newCookies = parseCookies(response);
  const mergedCookies = mergeCookies(cookies, newCookies);
  const data = await response.json();

  console.log(`[proxy] step2 응답 type:`, data.type);

  if (data.type === 'response') {
    const uri = data && data.response && data.response.parameters && data.response.parameters.uri;
    if (!uri) return { status: 'error', message: '토큰 URI를 찾을 수 없습니다.' };
    const tokens = parseTokensFromUri(uri);
    if (!tokens) return { status: 'error', message: '토큰 파싱에 실패했습니다.' };
    return { status: 'success', ...tokens, cookies: mergedCookies };
  }

  if (data.type === 'multifactor') {
    return { status: 'mfa', cookies: mergedCookies };
  }

  console.error(`[proxy] 인증 실패 전체 응답:`, JSON.stringify(data));
  return { status: 'error', message: '아이디 또는 비밀번호가 올바르지 않습니다.' };
}

// POST /auth - Riot 로그인 (아이디/비밀번호)
app.post('/auth', async (req, res) => {
  if (!checkSecret(req, res)) return;

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ status: 'error', message: 'username과 password가 필요합니다.' });
  }

  try {
    const cookies = await step1Init();
    const result = await step2Auth(cookies, username, password);
    return res.json(result);
  } catch (err) {
    console.error('[proxy] /auth 오류:', err);
    return res.status(500).json({ status: 'error', message: err.message || '서버 내부 오류' });
  }
});

// POST /auth/mfa - MFA 코드 제출
app.post('/auth/mfa', async (req, res) => {
  if (!checkSecret(req, res)) return;

  const { code, pendingCookies } = req.body || {};
  if (!code || !pendingCookies) {
    return res.status(400).json({ status: 'error', message: 'code와 pendingCookies가 필요합니다.' });
  }

  try {
    const response = await fetch(AUTH_URL, {
      method: 'PUT',
      headers: {
        ...BASE_HEADERS,
        'Content-Type': 'application/json',
        Cookie: pendingCookies,
      },
      body: JSON.stringify({
        type: 'multifactor',
        code,
        rememberDevice: true,
      }),
    });

    if (!response.ok) {
      return res.status(500).json({ status: 'error', message: `인증 서버 오류: ${response.status}` });
    }

    const newCookies = parseCookies(response);
    const mergedCookies = mergeCookies(pendingCookies, newCookies);
    const data = await response.json();

    if (data.type === 'response') {
      const uri = data && data.response && data.response.parameters && data.response.parameters.uri;
      if (!uri) return res.json({ status: 'error', message: '토큰 URI를 찾을 수 없습니다.' });
      const tokens = parseTokensFromUri(uri);
      if (!tokens) return res.json({ status: 'error', message: '토큰 파싱에 실패했습니다.' });
      return res.json({ status: 'success', ...tokens, cookies: mergedCookies });
    }

    return res.json({ status: 'error', message: '2단계 인증 코드가 올바르지 않습니다.' });
  } catch (err) {
    console.error('[proxy] /auth/mfa 오류:', err);
    return res.status(500).json({ status: 'error', message: err.message || '서버 내부 오류' });
  }
});

// ──────────────────────────────────────────────
// QR 로그인 (Riot Mobile)
// ──────────────────────────────────────────────

// POST /qr/init - QR 로그인 세션 시작
app.post('/qr/init', async (req, res) => {
  if (!checkSecret(req, res)) return;

  try {
    const deviceId = crypto.randomUUID();
    const nonce = crypto.randomBytes(16).toString('hex');
    console.log('[proxy] QR init, deviceId:', deviceId);

    const body = {
      acr_values: 'urn:riot:gold',
      claims: '',
      client_id: 'riot-client',
      nonce,
      redirect_uri: 'http://localhost/redirect',
      response_type: 'code',
      scope: 'openid link ban lol_region account',
      prompt: 'login',
    };

    const response = await fetch(QR_AUTH_URL, {
      method: 'POST',
      headers: {
        ...BASE_HEADERS,
        'Content-Type': 'application/json',
        'X-Riot-Device-Id': deviceId,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    console.log('[proxy] QR init 응답 status:', response.status);
    console.log('[proxy] QR init 응답 body:', text.substring(0, 500));

    if (!response.ok) {
      return res.status(500).json({ status: 'error', message: `QR 세션 생성 실패: ${response.status}`, raw: text });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({ status: 'error', message: 'QR 응답 파싱 실패', raw: text });
    }

    // loginToken 필드 추출 (응답 구조에 따라 다를 수 있음)
    const loginToken = data.loginToken || data.login_token || data.token;
    if (!loginToken) {
      return res.status(500).json({ status: 'error', message: 'loginToken을 찾을 수 없습니다.', raw: data });
    }

    console.log('[proxy] QR loginToken:', loginToken.substring(0, 20) + '...');
    return res.json({ status: 'ok', loginToken, deviceId, raw: data });
  } catch (err) {
    console.error('[proxy] /qr/init 오류:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /qr/poll?token=xxx&deviceId=yyy - 폴링: 사용자가 QR 스캔했는지 확인
app.get('/qr/poll', async (req, res) => {
  if (!checkSecret(req, res)) return;

  const { token, deviceId } = req.query;
  if (!token) {
    return res.status(400).json({ status: 'error', message: 'token이 필요합니다.' });
  }

  try {
    const pollUrl = `${QR_AUTH_URL}/${encodeURIComponent(token)}`;
    console.log('[proxy] QR poll URL:', pollUrl);

    const response = await fetch(pollUrl, {
      method: 'GET',
      headers: {
        ...BASE_HEADERS,
        ...(deviceId ? { 'X-Riot-Device-Id': deviceId } : {}),
      },
    });

    const text = await response.text();
    console.log('[proxy] QR poll 응답 status:', response.status);
    console.log('[proxy] QR poll 응답 body:', text.substring(0, 500));

    if (response.status === 404) {
      return res.json({ status: 'expired' });
    }

    if (!response.ok) {
      return res.status(500).json({ status: 'error', message: `폴링 실패: ${response.status}`, raw: text });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({ status: 'error', message: '폴링 응답 파싱 실패', raw: text });
    }

    // type: 'pending' | 'authenticated' | 'expired'
    console.log('[proxy] QR poll type:', data.type || data.status);

    if (data.type === 'authenticated' || data.status === 'authenticated') {
      // 인증됨 - 토큰 교환
      // 응답에 redirect_uri나 access_token이 있을 수 있음
      const uri = data?.response?.parameters?.uri
        || data?.redirect_uri
        || data?.uri;

      if (uri) {
        const tokens = parseTokensFromUri(uri);
        if (tokens) {
          const cookies = parseCookies(response);
          return res.json({ status: 'success', ...tokens, cookies });
        }
      }

      // access_token이 직접 포함된 경우
      const accessToken = data?.access_token || data?.accessToken;
      const idToken = data?.id_token || data?.idToken;
      if (accessToken) {
        return res.json({ status: 'success', accessToken, idToken: idToken || '', cookies: '' });
      }

      // 토큰이 없으면 raw 반환하여 디버깅
      return res.json({ status: 'authenticated_raw', raw: data });
    }

    if (data.type === 'expired' || data.status === 'expired') {
      return res.json({ status: 'expired' });
    }

    // pending
    return res.json({ status: 'pending' });
  } catch (err) {
    console.error('[proxy] /qr/poll 오류:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[proxy] Riot 인증 프록시 서버 실행 중 - 포트 ${PORT}`);
});
