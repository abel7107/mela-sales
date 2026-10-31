
import { z } from "zod";

const moneySchema = z
  .string()
  .regex(
    /^\d{1,10}(\.\d{1,2})?$/,
    "Amount must be a non-negative decimal with up to 2 decimal places."
  );

const quantitySchema = z
  .string()
  .regex(
    /^\d{1,9}(\.\d{1,3})?$/,
    "Quantity must be positive with up to 3 decimal places."
  )
  .refine(
    (value) => /[1-9]/.test(value),
    "Quantity must be greater than zero."
  );

const saleItemSchema = z
  .object({
    productServiceId: z.string().uuid(),
    quantity: quantitySchema,
    discountAmount: moneySchema.optional().default("0.00"),
  })
  .strict();

export const createSaleSchema = z
  .object({
    customerId: z.string().uuid().nullable().optional(),

    saleType: z.enum(["CASH", "CREDIT"]),

    items: z.array(saleItemSchema).min(1).max(100),

    discountAmount: moneySchema.optional().default("0.00"),
    taxAmount: moneySchema.optional().default("0.00"),

    notes: z.string().trim().max(1000).nullable().optional(),

    // For credit sales, this is the optional initial/partial payment.
    // For cash sales, the server will require full payment.
    initialPaymentAmount: moneySchema.optional().default("0.00"),

    paymentMethod: z
      .enum(["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "OTHER"])
      .optional(),

    paymentReference: z.string().trim().max(150).nullable().optional(),
    paymentNotes: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.saleType === "CREDIT" && !data.customerId) {
      ctx.addIssue({
        code: "custom",
        path: ["customerId"],
        message: "A customer is required for a credit sale.",
      });
    }

    const initialPaymentIsPositive =
      /[1-9]/.test(data.initialPaymentAmount);

    if (
      data.saleType === "CASH" &&
      !data.paymentMethod
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["paymentMethod"],
        message: "A payment method is required for a cash sale.",
      });
    }

    if (
      data.saleType === "CREDIT" &&
      initialPaymentIsPositive &&
      !data.paymentMethod
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["paymentMethod"],
        message: "A payment method is required when recording an initial payment.",
      });
    }
  });

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

