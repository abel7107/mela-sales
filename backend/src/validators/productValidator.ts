
import { z } from "zod";

const priceSchema = z
  .string()
  .regex(
    /^\d{1,10}(\.\d{1,2})?$/,
    "Price must be a decimal amount with up to 2 decimal places."
  );

export const createProductSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Product name is required.")
      .max(150, "Product name cannot exceed 150 characters."),

    description: z
      .string()
      .trim()
      .max(1000, "Description cannot exceed 1000 characters.")
      .nullable()
      .optional(),

    sku: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .nullable()
      .optional(),

    type: z.enum(["PRODUCT", "SERVICE"]),

    // Send prices as strings, e.g. "125.50".
    // This avoids relying on floating-point values for money.
    price: priceSchema,

    is_active: z.boolean().optional(),
  })
  .strict();

export const updateProductSchema = createProductSchema
  .partial()
  .refine(
    (data) => Object.keys(data).length > 0,
    "Provide at least one field to update."
  );

export type CreateProductInput = z.infer<
  typeof createProductSchema
>;

export type UpdateProductInput = z.infer<
  typeof updateProductSchema
>;

