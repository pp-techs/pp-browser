import * as z from "zod";

export const osSchema = z.enum(["windows", "macos", "linux"]);
export type ProfileOs = z.infer<typeof osSchema>;

export const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u,
    "letters, digits, '.', '_' or '-'; must not start with a symbol",
  );

export const createProfileSchema = z.object({
  name: nameSchema.describe("Unique profile name, usable in place of the id"),
  group: z.string().trim().max(64).optional().describe("Free-form group label"),
  notes: z.string().max(2000).optional(),
  os: osSchema.optional().describe("Fingerprint OS. Random when omitted"),
  proxyId: z
    .string()
    .nullable()
    .optional()
    .describe("Proxy id or name. Omit for a direct connection"),
});
export type CreateProfileInput = z.infer<typeof createProfileSchema>;

export const updateProfileSchema = z.object({
  name: nameSchema.optional(),
  group: z.string().trim().max(64).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  proxyId: z.string().nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const createProxySchema = z.object({
  name: nameSchema.optional().describe("Unique proxy name. Derived from host:port when omitted"),
  url: z.string().trim().min(1).describe("scheme://user:pass@host:port or host:port:user:pass"),
});
export type CreateProxyInput = z.infer<typeof createProxySchema>;

export const updateProxySchema = z.object({
  name: nameSchema.optional(),
  url: z.string().trim().min(1).optional(),
});
export type UpdateProxyInput = z.infer<typeof updateProxySchema>;

export const importProxiesSchema = z.object({
  text: z
    .string()
    .describe("One proxy per line; blank lines and lines starting with # are ignored"),
});

export const startProfileSchema = z.object({
  headless: z.boolean().optional().describe("Run without a visible window"),
});
export type StartProfileInput = z.infer<typeof startProfileSchema>;

const pageIdSchema = z
  .string()
  .optional()
  .describe("Page id from list_pages. Defaults to the most recently used page");

export const targetSchema = z
  .string()
  .min(1)
  .describe("Element ref from the latest snapshot (e.g. e12, f1e5) or a Playwright selector");

export const gotoSchema = z.object({ pageId: pageIdSchema, url: z.string().min(1) });
export const newPageSchema = z.object({ url: z.string().min(1).optional() });
export const pageRefSchema = z.object({ pageId: pageIdSchema });
export const clickSchema = z.object({ pageId: pageIdSchema, target: targetSchema });
export const typeSchema = z.object({
  pageId: pageIdSchema,
  target: targetSchema,
  text: z.string(),
  submit: z.boolean().optional().describe("Press Enter after typing"),
});
export const pressSchema = z.object({
  pageId: pageIdSchema,
  key: z.string().min(1).describe("Key name, e.g. Enter, Tab, Control+A"),
});
export const screenshotSchema = z.object({
  pageId: pageIdSchema,
  fullPage: z.boolean().optional(),
});
export const evaluateSchema = z.object({
  pageId: pageIdSchema,
  expression: z
    .string()
    .min(1)
    .describe("JavaScript expression evaluated in the page; result must be JSON-serializable"),
});
export const waitForSchema = z.object({
  pageId: pageIdSchema,
  text: z.string().optional().describe("Wait until this text is visible"),
  selector: z.string().optional().describe("Wait until this selector is visible"),
  timeoutMs: z.number().int().min(0).max(120_000).optional(),
});

export type GotoInput = z.infer<typeof gotoSchema>;
export type NewPageInput = z.infer<typeof newPageSchema>;
export type PageRefInput = z.infer<typeof pageRefSchema>;
export type ClickInput = z.infer<typeof clickSchema>;
export type TypeInput = z.infer<typeof typeSchema>;
export type PressInput = z.infer<typeof pressSchema>;
export type ScreenshotInput = z.infer<typeof screenshotSchema>;
export type EvaluateInput = z.infer<typeof evaluateSchema>;
export type WaitForInput = z.infer<typeof waitForSchema>;
