import { z } from "zod";

export const createBusinessSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Business name is required.")
      .max(150, "Business name cannot exceed 150 characters."),

    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code.")
      .optional(),

    phone: z.string().trim().min(3).max(30).nullable().optional(),

    email: z.string().trim().max(254).email().nullable().optional(),

    address: z.string().trim().max(255).nullable().optional(),

    logoUrl: z
      .string()
      .trim()
      .max(500)
      .url("logoUrl must be a valid URL.")
      .nullable()
      .optional(),
  })
  .strict();

export const updateBusinessSchema = createBusinessSchema
  .partial()
  .refine(
    (data) => Object.keys(data).length > 0,
    "Provide at least one field to update."
  );

export const addMemberSchema = z
  .object({
    authUserId: z
      .string()
      .trim()
      .min(1, "authUserId is required.")
      .max(255),
    role: z.enum(["OWNER", "CASHIER"]),
  })
  .strict();

export const updateMemberSchema = z
  .object({
    role: z.enum(["OWNER", "CASHIER"]).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    "Provide at least one field to update."
  );

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
