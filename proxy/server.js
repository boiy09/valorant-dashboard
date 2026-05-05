'use strict';

const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// CORS - Vercel에서 호출하므로 모든 오리진 허용
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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

const BASE_HEADERS = {
  'User-Agent': 'RiotClient/86.0.2.1441.2510 %s (Windows;10;;Professional, x64)',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
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
  console.log(`[proxy] step1 쿠키 수: ${cookies.split(';').length}`);
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
      language: 'ko_KR',
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

  // type === 'auth' = 인증 실패
  console.error(`[proxy] 인증 실패:`, data.error, data);
  return { status: 'error', message: '아이디 또는 비밀번호가 올바르지 않습니다.' };
}

// POST /auth - Riot 로그인
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[proxy] Riot 인증 프록시 서버 실행 중 - 포트 ${PORT}`);
});
