import { Router } from "express";
import { getHealthStatus } from "../controllers/health.controller";
import { createSale } from "../controllers/sales.controller";
import { requireTenantAuth } from "../middleware/auth.middleware";
import { CreateSaleSchema } from "../schemas/sales.schema";

const router = Router();

const validateBody = (schema: any) => (req: any, res: any, next: any) => {
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
