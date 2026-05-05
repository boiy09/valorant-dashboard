'use strict';

const express = require('express');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { chromium } = require('playwright');

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
  client_id: 'riot-client',
  nonce: '1',
  redirect_uri: 'http://localhost/redirect',
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

// ──────────────────────────────────────────────
// Playwright 브라우저 기반 로그인
// ──────────────────────────────────────────────

const RIOT_AUTH_URL =
  'https://auth.riotgames.com/authorize' +
  '?client_id=play-valorant-web-prod' +
  '&redirect_uri=https://playvalorant.com/opt_in' +
  '&response_type=token+id_token' +
  '&scope=account+openid' +
  '&nonce=1';

// MFA 대기 중인 브라우저 세션 보관
const browserSessions = new Map();

function scheduleSessionCleanup(sessionId, browser) {
  setTimeout(async () => {
    if (browserSessions.has(sessionId)) {
      browserSessions.delete(sessionId);
      await browser.close().catch(() => {});
      console.log(`[browser] 세션 만료 정리: ${sessionId}`);
    }
  }, 5 * 60 * 1000); // 5분
}

function parseHashTokens(hash) {
  try {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const accessToken = params.get('access_token');
    const idToken = params.get('id_token');
    if (!accessToken) return null;
    return { accessToken, idToken: idToken || '' };
  } catch {
    return null;
  }
}

async function doLogin(page, username, password) {
  console.log('[browser] Riot 로그인 페이지 이동...');
  await page.goto(RIOT_AUTH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 페이지 제목/URL 확인
  console.log('[browser] 현재 URL:', page.url());

  // 사용자 이름 입력
  await page.waitForSelector('input[name="username"]', { timeout: 15000 });
  await page.fill('input[name="username"]', username);
  console.log('[browser] 아이디 입력 완료');

  // Enter로 제출 (버튼 타입에 무관하게 동작)
  await page.press('input[name="username"]', 'Enter');
  await page.waitForTimeout(2000);
  console.log('[browser] 아이디 제출 후 URL:', page.url());

  // 비밀번호 입력
  const pwSelector = 'input[name="password"], input[type="password"]';
  try {
    await page.waitForSelector(pwSelector, { timeout: 8000 });
    await page.fill(pwSelector, password);
    console.log('[browser] 비밀번호 입력 완료');
    await page.press(pwSelector, 'Enter');
  } catch (e) {
    console.error('[browser] 비밀번호 필드 없음:', e.message);
  }
}

// POST /auth/browser - Playwright 브라우저로 로그인
app.post('/auth/browser', async (req, res) => {
  if (!checkSecret(req, res)) return;

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ status: 'error', message: 'username과 password가 필요합니다.' });
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'ko-KR',
    });
    const page = await context.newPage();

    // 토큰 캡처용
    let capturedTokens = null;
    page.on('framenavigated', async (frame) => {
      if (frame === page.mainFrame()) {
        const url = frame.url();
        if (url.includes('playvalorant.com/opt_in')) {
          try {
            const hash = await page.evaluate(() => window.location.hash).catch(() => '');
            if (hash) capturedTokens = parseHashTokens(hash);
            console.log('[browser] 토큰 캡처:', capturedTokens ? '성공' : '해시 없음', url.substring(0, 80));
          } catch (e) {
            console.error('[browser] 토큰 캡처 오류:', e.message);
          }
        }
      }
    });

    await doLogin(page, username, password);
    console.log('[browser] 로그인 제출 완료, 결과 대기...');

    // 결과 판단: 리다이렉트 or MFA or 오류
    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    console.log('[browser] 현재 URL:', currentUrl.substring(0, 100));

    // 성공: playvalorant.com으로 리다이렉트됨
    if (currentUrl.includes('playvalorant.com') || capturedTokens) {
      if (!capturedTokens) {
        const hash = await page.evaluate(() => window.location.hash).catch(() => '');
        capturedTokens = parseHashTokens(hash);
      }
      const cookies = await context.cookies('https://auth.riotgames.com');
      const ssidCookie = cookies.find(c => c.name === 'ssid');
      const ssid = ssidCookie ? `ssid=${ssidCookie.value}` : '';
      await browser.close();

      if (!capturedTokens) {
        return res.json({ status: 'error', message: '토큰을 추출하지 못했습니다.' });
      }
      console.log('[browser] 로그인 성공!');
      return res.json({ status: 'success', ...capturedTokens, cookies: ssid });
    }

    // MFA 확인
    const mfaInput = await page.$('input[name="code"], input[id="code"], input[aria-label*="code" i], input[placeholder*="code" i]');
    if (mfaInput) {
      const sessionId = crypto.randomUUID();
      browserSessions.set(sessionId, { browser, page, context });
      scheduleSessionCleanup(sessionId, browser);
      console.log('[browser] MFA 필요, sessionId:', sessionId);
      return res.json({ status: 'mfa', sessionId });
    }

    // 오류 메시지 확인
    const errorText = await page.$eval(
      '[class*="error"], [class*="Error"], [role="alert"]',
      el => el.textContent?.trim()
    ).catch(() => null);

    await browser.close();
    console.error('[browser] 로그인 실패. URL:', currentUrl, '오류:', errorText);
    return res.json({ status: 'error', message: errorText || '아이디 또는 비밀번호가 올바르지 않습니다.' });

  } catch (err) {
    await browser?.close().catch(() => {});
    console.error('[browser] /auth/browser 오류:', err.message);
    return res.status(500).json({ status: 'error', message: err.message || '브라우저 로그인 오류' });
  }
});

// POST /auth/browser/mfa - MFA 코드 입력
app.post('/auth/browser/mfa', async (req, res) => {
  if (!checkSecret(req, res)) return;

  const { sessionId, code } = req.body || {};
  if (!sessionId || !code) {
    return res.status(400).json({ status: 'error', message: 'sessionId와 code가 필요합니다.' });
  }

  const session = browserSessions.get(sessionId);
  if (!session) {
    return res.status(400).json({ status: 'error', message: 'MFA 세션이 만료되었습니다. 다시 로그인해 주세요.' });
  }

  browserSessions.delete(sessionId);
  const { browser, page, context } = session;

  try {
    let capturedTokens = null;
    page.on('framenavigated', async (frame) => {
      if (frame === page.mainFrame()) {
        const url = frame.url();
        if (url.includes('playvalorant.com/opt_in')) {
          const hash = await page.evaluate(() => window.location.hash).catch(() => '');
          if (hash) capturedTokens = parseHashTokens(hash);
        }
      }
    });

    // MFA 코드 입력
    const mfaInput = await page.$('input[name="code"], input[id="code"], input[aria-label*="code" i], input[placeholder*="code" i]');
    if (!mfaInput) {
      await browser.close();
      return res.json({ status: 'error', message: 'MFA 입력창을 찾을 수 없습니다.' });
    }
    await mfaInput.fill(code);
    await page.click('button[type="submit"]');

    await page.waitForTimeout(4000);
    const currentUrl = page.url();

    if (currentUrl.includes('playvalorant.com') || capturedTokens) {
      if (!capturedTokens) {
        const hash = await page.evaluate(() => window.location.hash).catch(() => '');
        capturedTokens = parseHashTokens(hash);
      }
      const cookies = await context.cookies('https://auth.riotgames.com');
      const ssidCookie = cookies.find(c => c.name === 'ssid');
      const ssid = ssidCookie ? `ssid=${ssidCookie.value}` : '';
      await browser.close();

      if (!capturedTokens) {
        return res.json({ status: 'error', message: '토큰을 추출하지 못했습니다.' });
      }
      console.log('[browser] MFA 로그인 성공!');
      return res.json({ status: 'success', ...capturedTokens, cookies: ssid });
    }

    await browser.close();
    return res.json({ status: 'error', message: '2단계 인증 코드가 올바르지 않습니다.' });

  } catch (err) {
    await browser?.close().catch(() => {});
    console.error('[browser] /auth/browser/mfa 오류:', err.message);
    return res.status(500).json({ status: 'error', message: err.message || 'MFA 처리 오류' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[proxy] Riot 인증 프록시 서버 실행 중 - 포트 ${PORT}`);
});
