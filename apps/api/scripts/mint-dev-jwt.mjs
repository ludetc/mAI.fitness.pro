import { createHmac } from "node:crypto";

const [, , userId, secret] = process.argv;
if (!userId || !secret) {
  console.error("usage: node mint-dev-jwt.mjs <userId> <secret>");
  process.exit(1);
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const now = Math.floor(Date.now() / 1000);
const payload = { sub: userId, iat: now, exp: now + 60 * 60 * 24 * 30 };
const header = { alg: "HS256", typ: "JWT" };
const headerB64 = b64url(JSON.stringify(header));
const payloadB64 = b64url(JSON.stringify(payload));
const signingInput = `${headerB64}.${payloadB64}`;
const sig = createHmac("sha256", secret).update(signingInput).digest();
const sigB64 = b64url(sig);
process.stdout.write(`${signingInput}.${sigB64}`);
