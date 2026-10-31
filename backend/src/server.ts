import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import dotenv from "dotenv";
import { pathToFileURL } from "node:url";
import pool from "./config/database.js";
import { errorHandler, notFoundHandler } from "./middleware/errorMiddleware.js";
import { requestId } from "./middleware/requestId.js";
import productRoutes from "./routes/productRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import salesRoutes from "./routes/salesRoutes.js";
import saleDetailRoutes from "./routes/saleDetailRoutes.js";
import salePaymentRoutes from "./routes/salePaymentRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import businessRoutes from "./routes/businessRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import { getPublicJwk } from "./services/authTokenService.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";

if (!process.env.MELA_AUTH_ISSUER) {
  process.env.MELA_AUTH_ISSUER = `http://localhost:${PORT}/`;
}
if (!process.env.MELA_AUTH_AUDIENCE) {
  process.env.MELA_AUTH_AUDIENCE = "mela-sales-api";
}
if (!process.env.MELA_AUTH_JWKS_URL) {
  process.env.MELA_AUTH_JWKS_URL = `http://localhost:${PORT}/.well-known/jwks.json`;
}

function resolveCorsOrigins(): string[] | boolean {
  const raw = process.env.CORS_ORIGINS;

  if (!raw || raw.trim() === "") {
    // No allowlist configured: allow all origins in development only.
    return NODE_ENV !== "production";
  }

  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

app.disable("x-powered-by");
app.use(helmet());
app.use(requestId);
app.use(
  cors({
    origin: resolveCorsOrigins(),
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-Request-Id",
    ],
    exposedHeaders: ["X-Request-Id"],
  })
);

// Generous ceiling: enough for a busy UI, enough to blunt brute force.
// Disabled in tests so the suite is not throttled.
if (NODE_ENV !== "test") {
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: Number(process.env.RATE_LIMIT_PER_MINUTE) || 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        status: "error",
        message: "Too many requests, please try again shortly.",
      },
    })
  );
}

app.use(express.json({ limit: "1mb" }));

// --- Auth -------------------------------------------------------------------
app.use("/api/v1/auth", authRoutes);

// --- JWKS endpoint ----------------------------------------------------------
app.get("/.well-known/jwks.json", async (_req, res, next) => {
  try {
    const { jwk } = await getPublicJwk();
    res.status(200).json({ keys: [jwk] });
  } catch (error) {
    next(error);
  }
});

// --- Business lifecycle -----------------------------------------------------
app.use("/api/v1/businesses", businessRoutes);

// --- Products / services ----------------------------------------------------
app.use(
  "/api/v1/businesses/:businessId/products-services",
  productRoutes
);

// --- Customers --------------------------------------------------------------
app.use(
  "/api/v1/businesses/:businessId/customers",
  customerRoutes
);

// --- Sales ------------------------------------------------------------------
app.use(
  "/api/v1/businesses/:businessId/sales/:saleId/payments",
  salePaymentRoutes
);
app.use(
  "/api/v1/businesses/:businessId/sales/:saleId",
  saleDetailRoutes
);
app.use(
  "/api/v1/businesses/:businessId/sales",
  salesRoutes
);

// --- Reports ----------------------------------------------------------------
app.use(
  "/api/v1/businesses/:businessId/reports",
  reportRoutes
);

// --- Health -----------------------------------------------------------------
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "mela-sales-api",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health/db", async (_req, res) => {
  try {
    const connection = await pool.getConnection();

    try {
      await connection.ping();

      res.status(200).json({
        status: "ok",
        database: "connected",
        timestamp: new Date().toISOString(),
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Database connection check failed:", error);

    res.status(503).json({
      status: "error",
      database: "disconnected",
    });
  }
});

app.use(notFoundHandler);
app.use(errorHandler);

// Only bind a port when executed directly (not when imported by tests).
function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

let server: ReturnType<typeof app.listen> | undefined;

if (isMainModule()) {
  server = app.listen(PORT, () => {
    console.log(`Mela Sales API running on port ${PORT} (${NODE_ENV})`);
  });
}

// Graceful shutdown: stop accepting connections, then close the DB pool.
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received, shutting down...`);

  const forceExit = setTimeout(() => {
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  const closeServer = (): Promise<void> =>
    new Promise((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });

  await closeServer();

  try {
    await pool.end();
    console.log("Database pool closed.");
  } catch (error) {
    console.error("Failed to close database pool:", error);
  }

  clearTimeout(forceExit);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  void shutdown("uncaughtException");
});

export default app;
