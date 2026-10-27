import { z } from "zod";

const phoneSchema = z
  .string()
  .trim()
  .min(3)
  .max(30);

const emailSchema = z
  .string()
  .trim()
  .max(254)
  .email();

export const createCustomerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Customer name is required.")
      .max(150, "Customer name cannot exceed 150 characters."),

    phone: phoneSchema.nullable().optional(),

    email: emailSchema.nullable().optional(),

    address: z
      .string()
      .trim()
      .max(255)
      .nullable()
      .optional(),

    notes: z
      .string()
      .trim()
      .max(1000)
      .nullable()
      .optional(),

    is_active: z.boolean().optional(),
  })
  .strict();

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .refine(
    (data) => Object.keys(data).length > 0,
    "Provide at least one field to update."
  );

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
