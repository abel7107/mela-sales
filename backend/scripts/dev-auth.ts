/**
 * Local development auth helper.
 *
 * Starts a throwaway JWKS endpoint and mints access tokens, so you can test
 * the API with curl/Postman without a real Mela Auth instance.
 *
 * Usage:
 *   npm run dev:auth                # mint a token for user "dev-owner"
 *   npm run dev:auth -- --user bob  # mint a token for user "bob"
 *
 * Keep this process running while you test, and copy the printed
 * MELA_AUTH_* values into backend/.env, then restart `npm run dev`.
 */
import { startAuthServer } from "../tests/helpers/authServer.js";

function readArg(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  const value = index !== -1 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : fallback;
}

const userId = readArg("--user", "dev-owner");

const auth = await startAuthServer();
const token = await auth.mintToken(userId);

const lines = [
  "",
  "  Mela Sales — dev auth",
  "  ────────────────────────────────────────────────────────────",
  "",
  "  1. Add these to backend/.env (then restart `npm run dev`):",
  "",
  `     MELA_AUTH_ISSUER=${auth.issuer}`,
  `     MELA_AUTH_AUDIENCE=${auth.audience}`,
  `     MELA_AUTH_JWKS_URL=${auth.jwksUrl}`,
  "",
  `  2. Use this token for user "${userId}":`,
  "",
  `     Authorization: Bearer ${token}`,
  "",
  "  3. Quick check:",
  "",
  `     curl -s -H "Authorization: Bearer ${token}" \\`,
  "       http://localhost:5000/api/v1/businesses",
  "",
  "  This JWKS endpoint stays alive until you stop this process (Ctrl+C).",
  "  Tokens expire in 1 hour.",
  "",
];

process.stdout.write(lines.join("\n"));

const keepAlive = setInterval(() => {}, 1 << 30);

async function shutdown(): Promise<void> {
  clearInterval(keepAlive);
  await auth.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
