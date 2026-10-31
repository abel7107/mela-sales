import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createPublicKey } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { importPKCS8, exportJWK, calculateJwkThumbprint, SignJWT } from "jose";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_KEY_PATH = join(__dirname, "..", "..", "data", "auth-signing-key.pem");

let cachedKey: Awaited<ReturnType<typeof importPKCS8>> | undefined;
let cachedJwk: Record<string, unknown> | undefined;
let cachedKid: string | undefined;

function keyPath(): string {
  return process.env.MELA_AUTH_PRIVATE_KEY_PATH || DEFAULT_KEY_PATH;
}

export async function getSigningKey() {
  if (cachedKey) return cachedKey;

  const pem = readFileSync(keyPath(), "utf8");
  cachedKey = await importPKCS8(pem, "RS256", { extractable: true });
  return cachedKey;
}

export async function getPublicJwk() {
  if (cachedJwk && cachedKid) {
    return { jwk: cachedJwk, kid: cachedKid };
  }

  const pem = readFileSync(keyPath(), "utf8");
  const publicKey = createPublicKey(pem);
  const jwk = await exportJWK(publicKey);
  jwk.alg = "RS256";
  jwk.use = "sig";
  jwk.kid = await calculateJwkThumbprint(jwk);
  cachedJwk = jwk as Record<string, unknown>;
  cachedKid = jwk.kid as string;
  return { jwk: cachedJwk, kid: cachedKid };
}

export function issuer(): string {
  return process.env.MELA_AUTH_ISSUER || "http://localhost:5000/";
}

export function audience(): string {
  return process.env.MELA_AUTH_AUDIENCE || "mela-sales-api";
}

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

export async function signAccessToken(userId: string): Promise<string> {
  const { kid } = await getPublicJwk();
  const key = await getSigningKey();

  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(issuer())
    .setAudience(audience())
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(key);
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
