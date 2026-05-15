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

// "name=value; name2=value2" → Playwright cookie 객체 배열
function parseCookieStringToObjects(cookieStr, domain) {
  return cookieStr.split(';')
    .map(part => {
      const trimmed = part.trim();
      const idx = trimmed.indexOf('=');
      if (idx === -1) return null;
      const name = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!name || !value) return null;
      return { name, value, domain, path: '/', sameSite: 'None', secure: true };
    })
    .filter(Boolean);
}

// Playwright context 쿠키 → "name=value; ..." 문자열
function serializeCookies(playwrightCookies) {
  return playwrightCookies.map(c => `${c.name}=${c.value}`).join('; ');
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

// 브라우저 동시 실행 제한 (Chromium 1개당 ~200MB)
const MAX_CONCURRENT_BROWSERS = 2;
let activeBrowserCount = 0;
const browserQueue = [];

function acquireBrowserSlot() {
  return new Promise((resolve) => {
    if (activeBrowserCount < MAX_CONCURRENT_BROWSERS) {
      activeBrowserCount++;
      resolve();
    } else {
      browserQueue.push(resolve);
    }
  });
}

function releaseBrowserSlot() {
  if (browserQueue.length > 0) {
    const next = browserQueue.shift();
    next();
  } else {
    activeBrowserCount--;
  }
}

async function withBrowser(fn) {
  await acquireBrowserSlot();
  let browser;
  try {
    browser = await launchBrowser();
    return await fn(browser);
  } finally {
    await browser?.close().catch(() => {});
    releaseBrowserSlot();
  }
}

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

  try {
    let capturedTokens = null;
    let mfaSession = null;

    await withBrowser(async (browser) => {
      const context = await createContext(browser);
      const page = await context.newPage();

      const tokenCapturePromise = new Promise((resolve) => {
        page.on('framenavigated', (frame) => {
          if (frame !== page.mainFrame()) return;
          const url = frame.url();
          console.log('[browser] 네비게이션:', url.substring(0, 200));
          if (url.includes('playvalorant.com')) {
            const hashIdx = url.indexOf('#');
            if (hashIdx !== -1) {
              capturedTokens = parseHashTokens(url.slice(hashIdx));
              console.log('[browser] URL 해시에서 토큰:', capturedTokens ? '성공' : '파싱 실패');
            }
            if (capturedTokens) resolve(capturedTokens);
          }
        });
        setTimeout(() => resolve(null), 20000);
      });

      await doLogin(page, username, password);
      await page.waitForTimeout(3000);

      const mfaSel = await findSelector(page, MFA_SELECTORS, 2000);
      if (mfaSel) {
        const sessionId = crypto.randomUUID();
        // MFA 세션은 슬롯을 점유한 채 유지 (scheduleSessionCleanup에서 해제)
        activeBrowserCount++; // withBrowser가 close 후 해제하므로 미리 1 추가
        browserSessions.set(sessionId, { browser, page, context, tokenCapturePromise });
        scheduleSessionCleanup(sessionId, browser);
        console.log('[browser] MFA 필요, sessionId:', sessionId);
        mfaSession = sessionId;
        return; // withBrowser의 finally에서 close 안 되도록 browser를 null로
      }

      capturedTokens = await tokenCapturePromise;
      const finalUrl = page.url();
      console.log('[browser] 최종 URL:', finalUrl.substring(0, 200));

      if (!capturedTokens && finalUrl.includes('playvalorant.com')) {
        const hash = await page.evaluate(() => window.location.hash).catch(() => '');
        console.log('[browser] JS hash 폴백:', hash.substring(0, 100));
        if (hash) capturedTokens = parseHashTokens(hash);
      }

      if (capturedTokens) {
        const allCookies = await context.cookies('https://auth.riotgames.com');
        capturedTokens.cookies = serializeCookies(allCookies);
        console.log('[browser] 로그인 성공!');
        return;
      }

      const errorSelectors = [
        '[class*="error" i]', '[class*="Error" i]', '[role="alert"]',
        '[data-testid*="error" i]', 'p[class*="hint" i]',
      ];
      let errorText = null;
      for (const sel of errorSelectors) {
        errorText = await page.$eval(sel, el => el.textContent?.trim()).catch(() => null);
        if (errorText) break;
      }
      await page.screenshot({ path: '/tmp/riot_login_fail.png' }).catch(() => {});
      console.error('[browser] 로그인 실패. URL:', finalUrl, '오류:', errorText);
      capturedTokens = { error: errorText || '아이디 또는 비밀번호가 올바르지 않습니다.' };
    });

    if (mfaSession) return res.json({ status: 'mfa', sessionId: mfaSession });
    if (!capturedTokens) return res.json({ status: 'error', message: '로그인에 실패했습니다.' });
    if (capturedTokens.error) return res.json({ status: 'error', message: capturedTokens.error });
    return res.json({ status: 'success', ...capturedTokens });

  } catch (err) {
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
      const allCookies = await context.cookies('https://auth.riotgames.com');
      const cookieString = serializeCookies(allCookies);
      await browser.close();
      console.log('[browser] MFA 로그인 성공!');
      return res.json({ status: 'success', ...capturedTokens, cookies: cookieString });
    }

    await browser.close();
    return res.json({ status: 'error', message: '2단계 인증 코드가 올바르지 않습니다.' });

  } catch (err) {
    await browser?.close().catch(() => {});
    console.error('[browser] /auth/browser/mfa 오류:', err.message);
    return res.status(500).json({ status: 'error', message: err.message || 'MFA 처리 오류' });
  }
});

// POST /auth/refresh - 저장된 쿠키로 Playwright 브라우저에서 토큰 갱신
app.post('/auth/refresh', async (req, res) => {
  if (!checkSecret(req, res)) return;

  const { cookies } = req.body || {};
  if (!cookies) {
    return res.status(400).json({ status: 'error', message: 'cookies가 필요합니다.' });
  }

  const cookieObjects = parseCookieStringToObjects(cookies, '.riotgames.com');
  if (cookieObjects.length === 0) {
    return res.status(400).json({ status: 'error', message: '유효한 쿠키가 없습니다.' });
  }

  try {
    let result = null;

    await withBrowser(async (browser) => {
      const context = await createContext(browser);
      await context.addCookies(cookieObjects);
      console.log(`[browser] refresh: ${cookieObjects.length}개 쿠키 주입`);

      const page = await context.newPage();
      let capturedTokens = null;

      const tokenPromise = new Promise((resolve) => {
        page.on('framenavigated', (frame) => {
          if (frame !== page.mainFrame()) return;
          const url = frame.url();
          console.log('[browser] refresh 네비게이션:', url.substring(0, 120));
          if (url.includes('playvalorant.com')) {
            const hashIdx = url.indexOf('#');
            if (hashIdx !== -1) {
              const tokens = parseHashTokens(url.slice(hashIdx));
              if (tokens) { capturedTokens = tokens; resolve(tokens); }
            }
          }
        });
        setTimeout(() => resolve(null), 15000);
      });

      await page.goto(RIOT_AUTH_URL, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
      capturedTokens = await tokenPromise;

      if (!capturedTokens && page.url().includes('playvalorant.com')) {
        const hash = await page.evaluate(() => window.location.hash).catch(() => '');
        if (hash) capturedTokens = parseHashTokens(hash);
      }

      if (capturedTokens) {
        const newCookies = await context.cookies('https://auth.riotgames.com');
        capturedTokens.cookies = serializeCookies(newCookies);
        console.log('[browser] refresh 성공!');
        result = { status: 'success', ...capturedTokens };
      } else {
        const currentUrl = page.url();
        console.error('[browser] refresh 실패, 현재 URL:', currentUrl.substring(0, 150));
        result = { status: 'error', message: 'ssid가 만료되었거나 유효하지 않습니다. 다시 로그인 후 쿠키를 복사해 주세요.' };
      }
    });

    return res.json(result);
  } catch (err) {
    console.error('[browser] /auth/refresh 오류:', err.message);
    return res.status(500).json({ status: 'error', message: err.message || '브라우저 갱신 오류' });
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

  try {
    let result = null;

    await withBrowser(async (browser) => {
      const context = await createContext(browser);
      const page = await context.newPage();

      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
      await page.waitForTimeout(1200);

      const [profile, agents] = await Promise.all([
        fetchTrackerJson(page, profileUrl),
        fetchTrackerJson(page, agentUrl).catch((error) => ({ ok: false, status: 0, json: null, text: error.message })),
      ]);

      if (!profile.ok || !profile.json) {
        result = {
          error: true,
          status: profile.status || 502,
          message: `tracker profile fetch failed: ${profile.status || 'unknown'}`,
          detail: profile.text,
        };
        return;
      }

      result = { status: 'ok', source: 'tracker-browser', profile: profile.json, agents: agents.ok ? agents.json : null };
    });

    if (result?.error) {
      return res.status(result.status).json({ status: 'error', message: result.message, detail: result.detail });
    }
    return res.json(result);
  } catch (err) {
    console.error('[tracker] /tracker/profile error:', err.message);
    return res.status(500).json({ status: 'error', message: err.message || 'tracker browser error' });
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

process.on('unhandledRejection', (reason) => {
  console.error('[proxy] unhandledRejection (무시됨):', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[proxy] uncaughtException (무시됨):', err.message);
});

// ──────────────────────────────────────────────
// WebSocket 실시간 브로드캐스트
// ──────────────────────────────────────────────
const { WebSocketServer, WebSocket: WS } = require('ws');

const PORT = process.env.PORT || 3001;
const httpServer = app.listen(PORT, () => {
  console.log(`[proxy] Riot 인증 프록시 서버 실행 중 - 포트 ${PORT}`);
});

const wss = new WebSocketServer({ noServer: true });
const wsClients = new Set();

httpServer.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  wsClients.add(ws);
  console.log(`[ws] 클라이언트 연결 (총 ${wsClients.size}명)`);

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`[ws] 클라이언트 연결 해제 (총 ${wsClients.size}명)`);
  });

  ws.on('error', () => wsClients.delete(ws));
  ws.send(JSON.stringify({ type: 'connected' }));
});

// 연결 유지용 heartbeat (30초마다)
setInterval(() => {
  for (const ws of wsClients) {
    if (ws.readyState === WS.OPEN) {
      ws.ping();
    } else {
      wsClients.delete(ws);
    }
  }
}, 30000);

function broadcast(type, data) {
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  for (const ws of wsClients) {
    if (ws.readyState === WS.OPEN) {
      ws.send(msg, (err) => { if (err) wsClients.delete(ws); });
    }
  }
}

// POST /broadcast - Next.js API에서 이벤트 전송
app.post('/broadcast', (req, res) => {
  const secret = process.env.PROXY_SECRET;
  if (secret && req.headers['x-proxy-secret'] !== secret) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }
  const { type, data } = req.body || {};
  if (!type) return res.status(400).json({ status: 'error', message: 'type이 필요합니다.' });
  broadcast(type, data ?? {});
  console.log(`[ws] broadcast: ${type} (${wsClients.size}명)`);
  return res.json({ status: 'ok', clients: wsClients.size });
});
