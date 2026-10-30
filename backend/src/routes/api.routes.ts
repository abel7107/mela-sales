import { Router } from "express";
import { getHealthStatus } from "../controllers/health.controller.js";
import { createSale } from "../controllers/sales.controller.js";
import { requireTenantAuth } from "../middleware/auth.middleware.js";
import { CreateSaleSchema } from "../schemas/sales.schema.js";

const router = Router();

const validateBody = (schema: any) => (req: any, _res: any, next: any) => {
  schema.parse({ body: req.body });
  next();
};

router.get("/health", getHealthStatus);
router.post(
  "/api/v1/sales",
  requireTenantAuth,
  validateBody(CreateSaleSchema),
  createSale,
);

export default router;
