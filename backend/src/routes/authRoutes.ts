import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import pool from "../config/database.js";

import { requireAuth } from "../middleware/requireAuth.js";
import {
  hashPassword,
  verifyPassword,
} from "../utils/password.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  ACCESS_TOKEN_TTL_SECONDS,
} from "../services/authTokenService.js";

const router = Router();

interface AuthUserRow extends RowDataPacket {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  is_active: number;
  created_at: Date;
}

const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(8).max(128),
    name: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(128),
  })
  .strict();

const refreshSchema = z
  .object({
    refreshToken: z.string().trim().min(1),
  })
  .strict();

const logoutSchema = z
  .object({
    refreshToken: z.string().trim().min(1).optional(),
  })
  .strict();

function toAuthUser(row: AuthUserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.display_name,
    createdAt: row.created_at,
  };
}

async function findUserByEmail(email: string): Promise<AuthUserRow | undefined> {
  const [rows] = await pool.execute<AuthUserRow[]>(
    `SELECT id, email, password_hash, display_name, is_active, created_at
     FROM auth_users
     WHERE email = ?
     LIMIT 1`,
    [email]
  );
  return rows[0];
}

async function findUserById(id: string): Promise<AuthUserRow | undefined> {
  const [rows] = await pool.execute<AuthUserRow[]>(
    `SELECT id, email, password_hash, display_name, is_active, created_at
     FROM auth_users
     WHERE id = ? AND is_active = TRUE
     LIMIT 1`,
    [id]
  );
  return rows[0];
}

async function issueSession(userId: string) {
  const accessToken = await signAccessToken(userId);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await pool.execute<ResultSetHeader>(
    `INSERT INTO auth_refresh_tokens (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [randomUUID(), userId, tokenHash, expiresAt]
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

// POST /api/v1/auth/register
router.post("/register", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        status: "error",
        message: "Invalid registration data.",
        errors: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }

    const input = parsed.data;

    const existing = await findUserByEmail(input.email);
    if (existing) {
      res.status(409).json({
        status: "error",
        message: "An account with this email already exists.",
      });
      return;
    }

    const userId = randomUUID();
    const passwordHash = hashPassword(input.password);

    await pool.execute<ResultSetHeader>(
      `INSERT INTO auth_users (id, email, password_hash, display_name)
       VALUES (?, ?, ?, ?)`,
      [userId, input.email, passwordHash, input.name ?? null]
    );

    const user = await findUserById(userId);
    const session = await issueSession(userId);

    res.status(201).json({
      status: "success",
      message: "Account created successfully.",
      data: {
        user: toAuthUser(user!),
        ...session,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        status: "error",
        message: "Invalid login data.",
        errors: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }

    const input = parsed.data;
    const user = await findUserByEmail(input.email);

    if (!user || user.is_active !== 1) {
      res.status(401).json({
        status: "error",
        message: "Invalid email or password.",
      });
      return;
    }

    if (!verifyPassword(input.password, user.password_hash)) {
      res.status(401).json({
        status: "error",
        message: "Invalid email or password.",
      });
      return;
    }

    const session = await issueSession(user.id);

    res.status(200).json({
      status: "success",
      message: "Signed in successfully.",
      data: {
        user: toAuthUser(user),
        ...session,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/auth/refresh
router.post("/refresh", async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        status: "error",
        message: "Invalid refresh request.",
        errors: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }

    const tokenHash = hashRefreshToken(parsed.data.refreshToken);

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, user_id, expires_at
       FROM auth_refresh_tokens
       WHERE token_hash = ?
       LIMIT 1`,
      [tokenHash]
    );

    const row = rows[0] as
      | { id: string; user_id: string; expires_at: Date }
      | undefined;

    if (!row) {
      res.status(401).json({
        status: "error",
        message: "Invalid refresh token.",
      });
      return;
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await pool.execute(
        `DELETE FROM auth_refresh_tokens WHERE id = ?`,
        [row.id]
      );
      res.status(401).json({
        status: "error",
        message: "Refresh token has expired.",
      });
      return;
    }

    const user = await findUserById(row.user_id);
    if (!user) {
      await pool.execute(`DELETE FROM auth_refresh_tokens WHERE id = ?`, [
        row.id,
      ]);
      res.status(401).json({
        status: "error",
        message: "Invalid refresh token.",
      });
      return;
    }

    // Rotate refresh token.
    await pool.execute(`DELETE FROM auth_refresh_tokens WHERE id = ?`, [row.id]);

    const session = await issueSession(user.id);

    res.status(200).json({
      status: "success",
      message: "Token refreshed.",
      data: {
        user: toAuthUser(user),
        ...session,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/auth/logout
router.post("/logout", async (req, res, next) => {
  try {
    const parsed = logoutSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        status: "error",
        message: "Invalid logout request.",
      });
      return;
    }

    if (parsed.data.refreshToken) {
      const tokenHash = hashRefreshToken(parsed.data.refreshToken);
      await pool.execute(
        `DELETE FROM auth_refresh_tokens WHERE token_hash = ?`,
        [tokenHash]
      );
    }

    res.status(200).json({
      status: "success",
      message: "Signed out.",
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/auth/me
router.get("/me", requireAuth, async (_req, res, next) => {
  try {
    const userId = (res.locals.auth as { userId: string }).userId;
    const user = await findUserById(userId);

    if (!user) {
      res.status(404).json({
        status: "error",
        message: "User not found.",
      });
      return;
    }

    res.status(200).json({
      status: "success",
      data: toAuthUser(user),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
