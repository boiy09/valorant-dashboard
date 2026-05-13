'use strict';

const express = require('express');
const fetch = require('node-fetch');
const crypto = require('crypto');

// playwright-extra + stealth: headless 브라우저 탐지 우회
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

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

    console.log('[proxy] QR poll type:', data.type || data.status);

    if (data.type === 'authenticated' || data.status === 'authenticated') {
      const uri = data?.response?.parameters?.uri || data?.redirect_uri || data?.uri;
      if (uri) {
        const tokens = parseTokensFromUri(uri);
        if (tokens) {
          const cookies = parseCookies(response);
          return res.json({ status: 'success', ...tokens, cookies });
        }
      }

      const accessToken = data?.access_token || data?.accessToken;
      const idToken = data?.id_token || data?.idToken;
      if (accessToken) {
        return res.json({ status: 'success', accessToken, idToken: idToken || '', cookies: '' });
      }

      return res.json({ status: 'authenticated_raw', raw: data });
    }

    if (data.type === 'expired' || data.status === 'expired') {
      return res.json({ status: 'expired' });
    }

    return res.json({ status: 'pending' });
  } catch (err) {
    console.error('[proxy] /qr/poll 오류:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// ──────────────────────────────────────────────
// Playwright 브라우저 기반 로그인 (stealth 적용)
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

async function launchBrowser() {
  return chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-dev-shm-usage',
      '--lang=ko-KR,ko',
    ],
  });
}

async function createContext(browser) {
  return browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    viewport: { width: 1280, height: 800 },
    // 실제 브라우저처럼 accept-language 헤더 설정
    extraHTTPHeaders: {
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });
}

// Riot 로그인 페이지 셀렉터 (여러 가능한 형태 대응)
const USERNAME_SELECTORS = [
  'input[name="username"]',
  'input[type="text"][data-testid]',
  'input[autocomplete="username"]',
  'input[type="text"]',
];

const PASSWORD_SELECTORS = [
  'input[name="password"]',
  'input[type="password"]',
  'input[autocomplete="current-password"]',
];

const MFA_SELECTORS = [
  'input[name="code"]',
  'input[id="code"]',
  'input[aria-label*="code" i]',
  'input[aria-label*="verification" i]',
  'input[placeholder*="code" i]',
  'input[data-testid*="code" i]',
];

async function findSelector(page, selectors, timeout = 5000) {
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout });
      return sel;
    } catch {
      // 다음 셀렉터 시도
    }
  }
  return null;
}

async function doLogin(page, username, password) {
  console.log('[browser] Riot 로그인 페이지 이동...');
  await page.goto(RIOT_AUTH_URL, { waitUntil: 'networkidle', timeout: 30000 });

  const currentUrl = page.url();
  console.log('[browser] 현재 URL:', currentUrl);

  // 사용자 이름 입력
  const usernameSel = await findSelector(page, USERNAME_SELECTORS, 15000);
  if (!usernameSel) {
    const pageContent = await page.content().catch(() => '');
    console.error('[browser] 사용자 이름 필드 없음. 페이지:', pageContent.substring(0, 500));
    throw new Error('로그인 페이지를 로드할 수 없습니다. 사용자 이름 입력 필드를 찾지 못했습니다.');
  }

  await page.fill(usernameSel, username);
  console.log('[browser] 아이디 입력 완료');

  // Enter로 제출 (비밀번호 화면으로 넘어감)
  await page.press(usernameSel, 'Enter');

  // 비밀번호 필드 대기 (최대 10초)
  const passwordSel = await findSelector(page, PASSWORD_SELECTORS, 10000);
  if (!passwordSel) {
    // 이미 비밀번호가 같은 화면에 있을 수 있음 (아이디+비밀번호 동시 표시)
    console.log('[browser] Enter 후 비밀번호 필드 없음. 초기 화면에서 비밀번호 찾기 시도...');
    const pwSel2 = await findSelector(page, PASSWORD_SELECTORS, 3000);
    if (!pwSel2) {
      throw new Error('비밀번호 입력 필드를 찾지 못했습니다.');
    }
  }

  const finalPwSel = passwordSel || 'input[type="password"]';
  await page.fill(finalPwSel, password);
  console.log('[browser] 비밀번호 입력 완료');

  // 로그인 제출
  await page.press(finalPwSel, 'Enter');
  console.log('[browser] 로그인 제출 완료');
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
    browser = await launchBrowser();
    const context = await createContext(browser);
    const page = await context.newPage();

    // 토큰 캡처용 - playvalorant.com으로 리다이렉트되면 URL에서 해시 파싱
    let capturedTokens = null;
    const tokenCapturePromise = new Promise((resolve) => {
      page.on('framenavigated', (frame) => {
        if (frame !== page.mainFrame()) return;
        const url = frame.url();
        console.log('[browser] 네비게이션:', url.substring(0, 200));

        if (url.includes('playvalorant.com')) {
          // URL에서 직접 해시 파싱
          const hashIdx = url.indexOf('#');
          if (hashIdx !== -1) {
            capturedTokens = parseHashTokens(url.slice(hashIdx));
            console.log('[browser] URL 해시에서 토큰:', capturedTokens ? '성공' : '파싱 실패');
          }
          if (capturedTokens) resolve(capturedTokens);
        }
      });

      // 20초 후 타임아웃
      setTimeout(() => resolve(null), 20000);
    });

    await doLogin(page, username, password);

    // MFA 여부 확인 (3초 대기)
    await page.waitForTimeout(3000);

    const mfaSel = await findSelector(page, MFA_SELECTORS, 2000);
    if (mfaSel) {
      const sessionId = crypto.randomUUID();
      browserSessions.set(sessionId, { browser, page, context, tokenCapturePromise });
      scheduleSessionCleanup(sessionId, browser);
      console.log('[browser] MFA 필요, sessionId:', sessionId);
      return res.json({ status: 'mfa', sessionId });
    }

    // 토큰 대기 (최대 20초)
    capturedTokens = await tokenCapturePromise;
    const finalUrl = page.url();
    console.log('[browser] 최종 URL:', finalUrl.substring(0, 200));

    // JS에서 hash 한 번 더 시도 (리다이렉트 이후 이미 도착한 경우)
    if (!capturedTokens && finalUrl.includes('playvalorant.com')) {
      const hash = await page.evaluate(() => window.location.hash).catch(() => '');
      console.log('[browser] JS hash 폴백:', hash.substring(0, 100));
      if (hash) capturedTokens = parseHashTokens(hash);
    }

    if (capturedTokens) {
      const cookies = await context.cookies('https://auth.riotgames.com');
      const ssidCookie = cookies.find(c => c.name === 'ssid');
      const ssid = ssidCookie ? `ssid=${ssidCookie.value}` : '';
      await browser.close();
      console.log('[browser] 로그인 성공!');
      return res.json({ status: 'success', ...capturedTokens, cookies: ssid });
    }

    // 실패 - 오류 메시지 수집
    const errorSelectors = [
      '[class*="error" i]',
      '[class*="Error" i]',
      '[role="alert"]',
      '[data-testid*="error" i]',
      'p[class*="hint" i]',
    ];
    let errorText = null;
    for (const sel of errorSelectors) {
      errorText = await page.$eval(sel, el => el.textContent?.trim()).catch(() => null);
      if (errorText) break;
    }

    // 스크린샷 (디버깅용)
    await page.screenshot({ path: '/tmp/riot_login_fail.png' }).catch(() => {});

    await browser.close();
    console.error('[browser] 로그인 실패. URL:', finalUrl, '오류:', errorText);
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
  const { browser, page, context, tokenCapturePromise } = session;

  try {
    // MFA 완료 후 토큰 캡처용 리스너 추가 (이미 tokenCapturePromise가 있음)
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return;
      const url = frame.url();
      if (url.includes('playvalorant.com/opt_in')) {
        const hashIdx = url.indexOf('#');
        if (hashIdx !== -1) {
          const tokens = parseHashTokens(url.slice(hashIdx));
          if (tokens) {
            console.log('[browser] MFA 후 토큰 캡처 성공');
          }
        }
      }
    });

    // MFA 코드 입력
    const mfaSel = await findSelector(page, MFA_SELECTORS, 5000);
    if (!mfaSel) {
      await browser.close();
      return res.json({ status: 'error', message: 'MFA 입력창을 찾을 수 없습니다.' });
    }
    await page.fill(mfaSel, code);
    await page.press(mfaSel, 'Enter');

    // 결과 대기 (최대 10초)
    await page.waitForTimeout(5000);
    const currentUrl = page.url();
    console.log('[browser] MFA 후 URL:', currentUrl.substring(0, 200));

    let capturedTokens = null;

    if (currentUrl.includes('playvalorant.com')) {
      const hashIdx = currentUrl.indexOf('#');
      if (hashIdx !== -1) capturedTokens = parseHashTokens(currentUrl.slice(hashIdx));
      if (!capturedTokens) {
        const hash = await page.evaluate(() => window.location.hash).catch(() => '');
        if (hash) capturedTokens = parseHashTokens(hash);
      }
    }

    if (capturedTokens) {
      const cookies = await context.cookies('https://auth.riotgames.com');
      const ssidCookie = cookies.find(c => c.name === 'ssid');
      const ssid = ssidCookie ? `ssid=${ssidCookie.value}` : '';
      await browser.close();
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

// ──────────────────────────────────────────────
// 배포 웹훅
// ──────────────────────────────────────────────
async function fetchTrackerJson(page, url) {
  return page.evaluate(async (targetUrl) => {
    const response = await fetch(targetUrl, {
      headers: {
        accept: 'application/json, text/plain, */*',
      },
      credentials: 'include',
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      json,
      text: text.slice(0, 500),
    };
  }, url);
}

app.post('/tracker/profile', async (req, res) => {
  if (!checkSecret(req, res)) return;

  const { gameName, tagLine } = req.body || {};
  if (!gameName || !tagLine) {
    return res.status(400).json({ status: 'error', message: 'gameName and tagLine are required.' });
  }

  const encoded = `${encodeURIComponent(String(gameName).trim())}/${encodeURIComponent(String(tagLine).trim())}`;
  const pageUrl = `https://tracker.gg/valorant/profile/pc/${encoded}/overview`;
  const profileUrl = `https://api.tracker.gg/api/v2/valorant/standard/profile/pc/${encoded}`;
  const agentUrl = `${profileUrl}/segments/agent`;

  let browser;
  try {
    browser = await launchBrowser();
    const context = await createContext(browser);
    const page = await context.newPage();

    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
    await page.waitForTimeout(1200);

    const [profile, agents] = await Promise.all([
      fetchTrackerJson(page, profileUrl),
      fetchTrackerJson(page, agentUrl).catch((error) => ({ ok: false, status: 0, json: null, text: error.message })),
    ]);

    if (!profile.ok || !profile.json) {
      return res.status(profile.status || 502).json({
        status: 'error',
        message: `tracker profile fetch failed: ${profile.status || 'unknown'}`,
        detail: profile.text,
      });
    }

    return res.json({
      status: 'ok',
      source: 'tracker-browser',
      profile: profile.json,
      agents: agents.ok ? agents.json : null,
    });
  } catch (err) {
    console.error('[tracker] /tracker/profile error:', err.message);
    return res.status(500).json({ status: 'error', message: err.message || 'tracker browser error' });
  } finally {
    await browser?.close().catch(() => {});
  }
});

const { execFile } = require('child_process');
const path = require('path');

let deploying = false;

app.post('/deploy', (req, res) => {
  const deploySecret = process.env.DEPLOY_SECRET;
  if (!deploySecret) {
    return res.status(500).json({ status: 'error', message: 'DEPLOY_SECRET 미설정' });
  }

  const token = req.headers['x-deploy-secret'];
  if (!token || token !== deploySecret) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  if (deploying) {
    return res.status(409).json({ status: 'error', message: '이미 배포 중입니다.' });
  }

  deploying = true;
  res.json({ status: 'ok', message: '배포를 시작합니다.' });
  console.log(`[deploy] ${new Date().toISOString()} 배포 시작`);

  const script = path.join(__dirname, '..', 'deploy.sh');
  execFile('bash', [script], { cwd: path.join(__dirname, '..'), env: process.env }, (err, stdout, stderr) => {
    deploying = false;
    if (err) {
      console.error('[deploy] 실패:', stderr);
    } else {
      console.log('[deploy] 완료:', stdout.trim());
    }
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[proxy] Riot 인증 프록시 서버 실행 중 - 포트 ${PORT}`);
});
