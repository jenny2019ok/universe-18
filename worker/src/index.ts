interface Env {
  DB: D1Database;
  SITE_ORIGIN: string;
  FIREBASE_PROJECT_ID: string;
  OWNER_EMAIL: string;
}

type VisitorInput = { browserId?: unknown; nickname?: unknown; gift?: unknown; selfWish?: unknown };
type Jwk = JsonWebKey & { kid?: string; alg?: string };
const gifts = new Set(["好运", "钱", "爱", "自由", "勇气", "新鲜事", "健康", "睡眠"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const jwkUrl = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let cachedKeys: Jwk[] = [];
let keyExpiry = 0;

function cors(origin: string | null, env: Env) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Vary": "Origin" });
  if (origin === env.SITE_ORIGIN) {
    headers.set("Access-Control-Allow-Origin", env.SITE_ORIGIN);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Max-Age", "600");
  }
  return headers;
}

function json(data: unknown, status: number, headers: Headers) {
  return new Response(JSON.stringify(data), { status, headers });
}

function decodePart(part: string): Record<string, unknown> {
  const raw = part.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, "=")));
}

function signatureBytes(part: string) {
  const raw = part.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, "=")), c => c.charCodeAt(0));
}

async function getKeys(): Promise<Jwk[]> {
  if (Date.now() < keyExpiry && cachedKeys.length) return cachedKeys;
  const response = await fetch(jwkUrl);
  if (!response.ok) throw new Error("Cannot fetch signing keys");
  const result = await response.json() as { keys?: Jwk[] };
  if (!Array.isArray(result.keys)) throw new Error("Invalid signing keys");
  const maxAge = Number(response.headers.get("Cache-Control")?.match(/max-age=(\d+)/)?.[1] || 3600);
  cachedKeys = result.keys;
  keyExpiry = Date.now() + Math.min(maxAge, 3600) * 1000;
  return cachedKeys;
}

async function verifyOwner(token: string, env: Env) {
  const parts = token.split(".");
  if (parts.length !== 3 || token.length > 6000) return false;
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = decodePart(parts[0]);
    claims = decodePart(parts[1]);
  } catch { return false; }
  if (header.alg !== "RS256" || typeof header.kid !== "string") return false;
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== env.FIREBASE_PROJECT_ID ||
      claims.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}` ||
      claims.email !== env.OWNER_EMAIL ||
      typeof claims.sub !== "string" || !claims.sub ||
      typeof claims.exp !== "number" || claims.exp <= now ||
      typeof claims.iat !== "number" || claims.iat > now ||
      typeof claims.auth_time !== "number" || claims.auth_time > now ||
      (claims.firebase as { sign_in_provider?: unknown } | undefined)?.sign_in_provider !== "password") return false;
  const key = (await getKeys()).find(k => k.kid === header.kid && k.kty === "RSA");
  if (!key) return false;
  const imported = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", imported, signatureBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
}

async function readBody(request: Request): Promise<VisitorInput | null> {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) return null;
  if (Number(request.headers.get("Content-Length") || 0) > 1024) return null;
  const body = await request.text();
  if (body.length > 1024) return null;
  try { return JSON.parse(body) as VisitorInput; } catch { return null; }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const headers = cors(origin, env);
    const path = new URL(request.url).pathname;
    if (request.method === "OPTIONS") return origin === env.SITE_ORIGIN ? new Response(null, { status: 204, headers }) : json({ error: "Forbidden" }, 403, headers);
    if (origin !== env.SITE_ORIGIN) return json({ error: "Forbidden" }, 403, headers);
    try {
      if (request.method === "POST" && path === "/visit") {
        const body = await readBody(request);
        if (!body || typeof body.browserId !== "string" || !uuid.test(body.browserId) ||
            typeof body.nickname !== "string" || body.nickname.trim().length < 1 || body.nickname.trim().length > 24) {
          return json({ error: "Invalid visitor" }, 400, headers);
        }
        await env.DB.prepare("INSERT INTO visitors (browser_id, nickname) VALUES (?, ?) ON CONFLICT(browser_id) DO UPDATE SET nickname = excluded.nickname, updated_at = CURRENT_TIMESTAMP")
          .bind(body.browserId, body.nickname.trim()).run();
        return json({ ok: true }, 200, headers);
      }
      if (request.method === "POST" && path === "/gift") {
        const body = await readBody(request);
        if (!body || typeof body.browserId !== "string" || !uuid.test(body.browserId) ||
            typeof body.gift !== "string" || !gifts.has(body.gift) ||
            typeof body.selfWish !== "string" || !gifts.has(body.selfWish)) return json({ error: "Invalid gift" }, 400, headers);
        const result = await env.DB.prepare("UPDATE visitors SET gift = ?, self_wish = ?, updated_at = CURRENT_TIMESTAMP WHERE browser_id = ?")
          .bind(body.gift, body.selfWish, body.browserId).run();
        if (!result.meta.changes) return json({ error: "Visitor not found" }, 404, headers);
        return json({ ok: true }, 200, headers);
      }
      if (request.method === "GET" && path === "/admin/visitors") {
        const match = request.headers.get("Authorization")?.match(/^Bearer (.+)$/);
        if (!match || !(await verifyOwner(match[1], env))) return json({ error: "Unauthorized" }, 401, headers);
        const [count, visitorRows, giftRows] = await Promise.all([
          env.DB.prepare("SELECT COUNT(*) AS total FROM visitors").first<{ total: number }>(),
          env.DB.prepare("SELECT sequence, nickname, gift, self_wish AS selfWish, created_at AS createdAt FROM visitors ORDER BY sequence DESC LIMIT 500").all(),
          env.DB.prepare("SELECT gift, COUNT(*) AS total FROM visitors WHERE gift IS NOT NULL GROUP BY gift").all(),
        ]);
        return json({ total: count?.total || 0, visitors: visitorRows.results, gifts: giftRows.results }, 200, headers);
      }
      return json({ error: "Not found" }, 404, headers);
    } catch {
      return json({ error: "Service unavailable" }, 503, headers);
    }
  },
};
