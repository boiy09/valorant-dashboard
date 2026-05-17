import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export type AuctionAccessRole = "host" | "captain" | "observer";

export interface AuctionAccessPayload {
  sessionId: string;
  role: AuctionAccessRole;
  captainId?: string;
  nonce: string;
  iat: number;
}

const TOKEN_TTL_S = 24 * 60 * 60; // 24시간

function secret() {
  const s = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!s) console.warn("[auctionAccess] NEXTAUTH_SECRET not set — auction tokens are insecure in production");
  return s || "valorant-dashboard-dev-secret";
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sign(data: string) {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createAuctionAccessToken(input: {
  sessionId: string;
  role: AuctionAccessRole;
  captainId?: string;
}) {
  const payload: AuctionAccessPayload = {
    sessionId: input.sessionId,
    role: input.role,
    captainId: input.captainId,
    nonce: randomBytes(12).toString("base64url"),
    iat: Math.floor(Date.now() / 1000),
  };
  const body = encode(payload);
  return `${body}.${sign(body)}`;
}

export function verifyAuctionAccessToken(token: string): AuctionAccessPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = sign(body);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length) return null;
  if (!timingSafeEqual(actualBytes, expectedBytes)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AuctionAccessPayload;
    if (!payload.sessionId || !payload.role || !payload.nonce || !payload.iat) return null;
    if (!["host", "captain", "observer"].includes(payload.role)) return null;
    if (payload.role === "captain" && !payload.captainId) return null;
    if (Math.floor(Date.now() / 1000) - payload.iat > TOKEN_TTL_S) return null;
    return payload;
  } catch {
    return null;
  }
}
