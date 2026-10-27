import type { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let configuredJwksUrl: string | undefined;

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const issuer = process.env.MELA_AUTH_ISSUER;
  const audience = process.env.MELA_AUTH_AUDIENCE;
  const jwksUrl = process.env.MELA_AUTH_JWKS_URL;

  if (!issuer || !audience || !jwksUrl) {
    res.status(503).json({
      status: "error",
      message: "Mela Auth is not configured on this server.",
    });
    return;
  }

  const authorization = req.headers.authorization;
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    res.status(401).json({
      status: "error",
      message: "A valid Bearer access token is required.",
    });
    return;
  }

  try {
    const jwksAddress = new URL(jwksUrl);

    if (
      jwksAddress.protocol !== "https:" &&
      jwksAddress.hostname !== "localhost" &&
      jwksAddress.hostname !== "127.0.0.1"
    ) {
      res.status(503).json({
        status: "error",
        message: "Mela Auth must use a secure JWKS endpoint.",
      });
      return;
    }

    if (!jwks || configuredJwksUrl !== jwksUrl) {
      jwks = createRemoteJWKSet(jwksAddress);
      configuredJwksUrl = jwksUrl;
    }

    const { payload } = await jwtVerify(match[1], jwks, {
      issuer,
      audience,
    });

    if (!payload.sub) {
      res.status(401).json({
        status: "error",
        message: "The access token has no user identity.",
      });
      return;
    }

    res.locals.auth = {
      userId: payload.sub,
      claims: payload,
    };

    next();
  } catch {
    res.status(401).json({
      status: "error",
      message: "The access token is invalid or could not be verified.",
    });
  }
}
