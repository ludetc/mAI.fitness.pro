import type { GoogleIdentity } from "@mai/shared";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ALLOWED_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
}

interface JwksDoc {
  keys: Jwk[];
}

function base64UrlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function decodeJson<T>(s: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(s))) as T;
  } catch {
    return null;
  }
}

async function fetchJwks(): Promise<JwksDoc | null> {
  const cache = caches.default;
  const req = new Request(GOOGLE_JWKS_URL, { method: "GET" });
  const cached = await cache.match(req);
  if (cached) {
    try {
      return (await cached.json()) as JwksDoc;
    } catch {
      // fall through to refresh
    }
  }
  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) return null;
  const body = await res.text();
  const cacheRes = new Response(body, {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
  });
  await cache.put(req, cacheRes.clone());
  try {
    return JSON.parse(body) as JwksDoc;
  } catch {
    return null;
  }
}

interface GoogleIdTokenPayload {
  iss: string;
  aud: string;
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  exp: number;
  iat: number;
}

export async function verifyGoogleIdToken(
  idToken: string,
  audience: string,
): Promise<GoogleIdentity | null> {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  const header = decodeJson<{ kid?: string; alg?: string }>(headerB64);
  if (!header || header.alg !== "RS256" || !header.kid) return null;

  const jwks = await fetchJwks();
  if (!jwks) return null;
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      jwk as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return null;
  }

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sigBytes = base64UrlDecode(sigB64);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    sigBytes,
    signingInput,
  );
  if (!valid) return null;

  const payload = decodeJson<GoogleIdTokenPayload>(payloadB64);
  if (!payload) return null;

  if (!ALLOWED_ISSUERS.has(payload.iss)) return null;
  if (payload.aud !== audience) return null;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return null;
  if (!payload.sub || !payload.email) return null;
  if (payload.email_verified === false) return null;

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}
