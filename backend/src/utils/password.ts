import crypto from "node:crypto";

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const derived = crypto.scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: 128 * 1024 * 1024,
  });

  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);

  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }

  let salt: Buffer;
  let hash: Buffer;

  try {
    salt = Buffer.from(parts[4], "base64");
    hash = Buffer.from(parts[5], "base64");
  } catch {
    return false;
  }

  if (salt.length === 0 || hash.length === 0) return false;

  let derived: Buffer;

  try {
    derived = crypto.scryptSync(password, salt, hash.length, {
      N,
      r,
      p,
      maxmem: 128 * 1024 * 1024,
    });
  } catch {
    return false;
  }

  if (derived.length !== hash.length) return false;

  return crypto.timingSafeEqual(derived, hash);
}
