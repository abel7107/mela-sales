import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
} from "jose";

export interface AuthTestServer {
  issuer: string;
  audience: string;
  jwksUrl: string;
  mintToken: (userId: string) => Promise<string>;
  close: () => Promise<void>;
}

/**
 * Boots a local JWKS endpoint and returns a token minter, so tests can
 * exercise the real `requireAuth` middleware without a live Mela Auth.
 */
export async function startAuthServer(): Promise<AuthTestServer> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    extractable: true,
  });

  const jwk = (await exportJWK(publicKey)) as JWK;
  jwk.kid = await calculateJwkThumbprint(jwk);
  jwk.alg = "RS256";
  jwk.use = "sig";

  const issuer = "https://auth.test.mela/";
  const audience = "mela-sales-api-test";

  const server = http.createServer((req, res) => {
    if (req.url === "/.well-known/jwks.json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const port = (server.address() as AddressInfo).port;

  return {
    issuer,
    audience,
    jwksUrl: `http://127.0.0.1:${port}/.well-known/jwks.json`,
    mintToken: async (userId: string) =>
      new SignJWT({})
        .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
        .setIssuer(issuer)
        .setAudience(audience)
        .setSubject(userId)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
