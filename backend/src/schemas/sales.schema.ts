import { z } from "zod";

export const CreateSaleSchema = z.object({
  body: z.object({
    customerId: z.string().uuid().nullable().optional(),
    saleType: z.enum(["CASH", "CREDIT"]),
    discount: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Must be a decimal string string"),
    lines: z
      .array(
        z.object({
          productServiceId: z.string().uuid(),
          description: z.string().max(255).optional(),
          quantity: z
            .string()
            .regex(
              /^\d+(\.\d{1,3})?$/,
              "Must be a decimal quantity limit snapshot",
            ),
          unitPrice: z
            .string()
            .regex(
              /^\d+(\.\d{1,2})?$/,
              "Must be valid numeric asset price format",
            ),
          discount: z.string().regex(/^\d+(\.\d{1,2})?$/),
        }),
      )
      .min(1, "At least one line item is required"),
  }),
});
