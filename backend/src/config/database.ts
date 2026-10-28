const { PrismaClient } = require("@prisma/client") as {
  PrismaClient: new (
    options?: ConstructorParameters<
      typeof import("@prisma/client").PrismaClient
    >[0],
  ) => import("@prisma/client").PrismaClient;
};

export const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "error", "warn"]
      : ["error"],
});
