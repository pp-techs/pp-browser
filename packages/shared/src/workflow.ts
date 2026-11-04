import * as z from "zod";
import { PpbError } from "./errors.ts";
import { nameSchema } from "./schemas.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export type Locator =
  | { role: string; name?: string; exact?: boolean; nth?: number }
  | { text: string; exact?: boolean; nth?: number }
  | { selector: string; nth?: number };

export type Condition =
  | { exists: Locator }
  | { notExists: Locator }
  | { textVisible: string }
  | { urlMatches: string }
  | { paramSet: string }
  | { paramEquals: { name: string; value: string | number | boolean } }
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition };

export type OnFail = "needs_agent" | "abort" | "continue";

interface StepBase {
  id: string;
  optional?: boolean;
  onFail?: OnFail;
  timeoutMs?: number;
}

export type WorkflowStep = StepBase &
  (
    | { do: "goto"; url: string }
    | { do: "click"; target: Locator }
    | { do: "type"; target: Locator; text: string; submit?: boolean; mode?: "fill" | "keystrokes" }
    | { do: "press"; key: string }
    | { do: "wait_for"; text?: string; target?: Locator }
    | { do: "screenshot"; fullPage?: boolean }
    | { do: "extract"; target: Locator; attr?: string }
    | { do: "if"; cond: Condition; then: WorkflowStep[]; else?: WorkflowStep[] }
    | {
        do: "switch";
        cases: { cond: Condition; steps: WorkflowStep[] }[];
        default?: WorkflowStep[];
      }
  );

export type ParamType = "string" | "number" | "boolean" | "secret";

export interface WorkflowParam {
  type: ParamType;
  required?: boolean;
  default?: string | number | boolean;
  description?: string;
}

export interface WorkflowDefinition {
  name: string;
  description?: string;
  params: Record<string, WorkflowParam>;
  steps: WorkflowStep[];
}

export type ParamValues = Record<string, string | number | boolean>;

// ── Schemas ────────────────────────────────────────────────────────────────

const idSchema = z
  .string()
  .regex(/^[A-Za-z][\w-]*$/)
  .max(64);
const timeoutSchema = z.number().int().min(0).max(120_000);
const nthSchema = z.number().int().min(0);

const paramSchema = z
  .object({
    type: z.enum(["string", "number", "boolean", "secret"]),
    required: z.boolean().optional(),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    description: z.string().max(500).optional(),
  })
  .strict();

export const locatorSchema: z.ZodType<Locator> = z.union([
  z
    .object({
      role: z.string().min(1),
      name: z.string().optional(),
      exact: z.boolean().optional(),
      nth: nthSchema.optional(),
    })
    .strict(),
  z
    .object({
      text: z.string().min(1),
      exact: z.boolean().optional(),
      nth: nthSchema.optional(),
    })
    .strict(),
  z
    .object({
      selector: z.string().min(1),
      nth: nthSchema.optional(),
    })
    .strict(),
]);

export const conditionSchema: z.ZodType<Condition> = z.union([
  z.object({ exists: locatorSchema }).strict(),
  z.object({ notExists: locatorSchema }).strict(),
  z.object({ textVisible: z.string() }).strict(),
  z.object({ urlMatches: z.string() }).strict(),
  z.object({ paramSet: z.string() }).strict(),
  z
    .object({
      paramEquals: z
        .object({
          name: z.string(),
          value: z.union([z.string(), z.number(), z.boolean()]),
        })
        .strict(),
    })
    .strict(),
  z.object({ and: z.array(z.lazy(() => conditionSchema)) }).strict(),
  z.object({ or: z.array(z.lazy(() => conditionSchema)) }).strict(),
  z.object({ not: z.lazy(() => conditionSchema) }).strict(),
]);

const stepBaseShape = {
  id: idSchema,
  optional: z.boolean().optional(),
  onFail: z.enum(["needs_agent", "abort", "continue"]).optional(),
  timeoutMs: timeoutSchema.optional(),
};

const gotoStepSchema = z
  .object({ ...stepBaseShape, do: z.literal("goto"), url: z.string().min(1) })
  .strict();

const clickStepSchema = z
  .object({ ...stepBaseShape, do: z.literal("click"), target: locatorSchema })
  .strict();

const typeStepSchema = z
  .object({
    ...stepBaseShape,
    do: z.literal("type"),
    target: locatorSchema,
    text: z.string(),
    submit: z.boolean().optional(),
    mode: z.enum(["fill", "keystrokes"]).optional(),
  })
  .strict();

const pressStepSchema = z
  .object({ ...stepBaseShape, do: z.literal("press"), key: z.string().min(1) })
  .strict();

const waitForStepSchema = z
  .object({
    ...stepBaseShape,
    do: z.literal("wait_for"),
    text: z.string().optional(),
    target: locatorSchema.optional(),
  })
  .strict();

const screenshotStepSchema = z
  .object({ ...stepBaseShape, do: z.literal("screenshot"), fullPage: z.boolean().optional() })
  .strict();

const extractStepSchema = z
  .object({
    ...stepBaseShape,
    do: z.literal("extract"),
    target: locatorSchema,
    attr: z.string().optional(),
  })
  .strict();

const ifStepSchema = z
  .object({
    ...stepBaseShape,
    do: z.literal("if"),
    cond: z.lazy(() => conditionSchema),
    // eslint-disable-next-line unicorn/no-thenable -- `then` is the workflow step field name
    then: z.array(z.lazy(() => workflowStepSchema)),
    else: z.array(z.lazy(() => workflowStepSchema)).optional(),
  })
  .strict();

const switchStepSchema = z
  .object({
    ...stepBaseShape,
    do: z.literal("switch"),
    cases: z
      .array(
        z
          .object({
            cond: z.lazy(() => conditionSchema),
            steps: z.array(z.lazy(() => workflowStepSchema)),
          })
          .strict(),
      )
      .min(1),
    default: z.array(z.lazy(() => workflowStepSchema)).optional(),
  })
  .strict();

export const workflowStepSchema: z.ZodType<WorkflowStep> = z.discriminatedUnion("do", [
  gotoStepSchema,
  clickStepSchema,
  typeStepSchema,
  pressStepSchema,
  waitForStepSchema,
  screenshotStepSchema,
  extractStepSchema,
  ifStepSchema,
  switchStepSchema,
]);

export const workflowDefinitionSchema = z
  .object({
    name: nameSchema,
    description: z.string().max(500).optional(),
    params: z.record(z.string(), paramSchema).default({}),
    steps: z.array(workflowStepSchema).min(1),
  })
  .strict()
  .superRefine((def, ctx) => {
    const paramNames = new Set(Object.keys(def.params));

    // Collect all step IDs and extract IDs
    const allIds = new Set<string>();
    const extractIds = new Set<string>();
    const collectIds = (steps: WorkflowStep[]): void => {
      for (const step of steps) {
        if (allIds.has(step.id)) {
          ctx.addIssue({ code: "custom", message: `Duplicate step id "${step.id}"` });
        }
        allIds.add(step.id);
        if (step.do === "extract") extractIds.add(step.id);
        if (step.do === "if") {
          collectIds(step.then);
          if (step.else) collectIds(step.else);
        }
        if (step.do === "switch") {
          for (const c of step.cases) collectIds(c.steps);
          if (step.default) collectIds(step.default);
        }
      }
    };
    collectIds(def.steps);

    // Param names
    for (const name of paramNames) {
      if (!/^[A-Za-z_]\w*$/.test(name)) {
        ctx.addIssue({
          code: "custom",
          message: `Invalid parameter name "${name}"; use letters, digits, '_'`,
        });
      }
    }

    // Param defaults must match declared type
    for (const [name, param] of Object.entries(def.params)) {
      if (param.default !== undefined) {
        const actual = typeof param.default;
        const expected = param.type === "secret" ? "string" : param.type;
        if (actual !== expected) {
          ctx.addIssue({ code: "custom", message: `Default for "${name}" must be ${param.type}` });
        }
      }
    }

    const validateTemplate = (template: string): void => {
      for (const [, expr] of template.matchAll(/\{\{(.*?)\}\}/g)) {
        const e = expr.trim();
        const isParam = paramNames.has(e);
        const isStepValue = /^steps\.[\w-]+\.value$/.test(e) && extractIds.has(e.slice(6, -6));
        if (!isParam && !isStepValue) {
          ctx.addIssue({ code: "custom", message: `Unknown variable {{${e}}}` });
        }
      }
    };

    const validateLocator = (loc: Locator): void => {
      if ("selector" in loc && /^(f\d+)?e\d+$/.test(loc.selector)) {
        ctx.addIssue({
          code: "custom",
          message: `Snapshot refs like "${loc.selector}" are not stable; use { role, name } instead`,
        });
      }
      if ("name" in loc && loc.name !== undefined) validateTemplate(loc.name);
      if ("text" in loc) validateTemplate(loc.text);
      if ("selector" in loc) validateTemplate(loc.selector);
    };

    const validateCond = (cond: Condition): void => {
      if ("exists" in cond) validateLocator(cond.exists);
      else if ("notExists" in cond) validateLocator(cond.notExists);
      else if ("textVisible" in cond) validateTemplate(cond.textVisible);
      else if ("urlMatches" in cond) {
        try {
          new RegExp(cond.urlMatches);
        } catch (e) {
          ctx.addIssue({
            code: "custom",
            message: `Invalid regex in urlMatches: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      } else if ("paramSet" in cond) {
        if (!paramNames.has(cond.paramSet)) {
          ctx.addIssue({ code: "custom", message: `Unknown parameter "${cond.paramSet}"` });
        }
      } else if ("paramEquals" in cond) {
        if (!paramNames.has(cond.paramEquals.name)) {
          ctx.addIssue({ code: "custom", message: `Unknown parameter "${cond.paramEquals.name}"` });
        }
      } else if ("and" in cond) cond.and.forEach(validateCond);
      else if ("or" in cond) cond.or.forEach(validateCond);
      else if ("not" in cond) validateCond(cond.not);
    };

    const validateStep = (step: WorkflowStep): void => {
      switch (step.do) {
        case "goto":
          validateTemplate(step.url);
          break;
        case "click":
          validateLocator(step.target);
          break;
        case "type":
          validateLocator(step.target);
          validateTemplate(step.text);
          break;
        case "wait_for":
          if (step.text !== undefined && step.target !== undefined) {
            ctx.addIssue({
              code: "custom",
              message: `Step "${step.id}": wait_for sets at most one of text and target`,
            });
          }
          if (step.text !== undefined) validateTemplate(step.text);
          if (step.target !== undefined) validateLocator(step.target);
          break;
        case "extract":
          validateLocator(step.target);
          break;
        case "if":
          validateCond(step.cond);
          step.then.forEach(validateStep);
          if (step.else) step.else.forEach(validateStep);
          break;
        case "switch":
          for (const c of step.cases) {
            validateCond(c.cond);
            c.steps.forEach(validateStep);
          }
          if (step.default) step.default.forEach(validateStep);
          break;
      }
    };
    def.steps.forEach(validateStep);
  });

export const paramValuesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()]),
);

export const runWorkflowSchema = z
  .object({
    profile: z.string().min(1).describe("Profile id or name"),
    params: paramValuesSchema.optional(),
    pageId: z
      .string()
      .min(1)
      .optional()
      .describe("Run on this existing page instead of opening a new one"),
    keepPage: z.boolean().optional().describe("Keep the page the run opened after it finishes"),
    headless: z
      .boolean()
      .optional()
      .describe("Headless when the run has to start the profile (default true)"),
  })
  .strict();

export type RunWorkflowInput = z.infer<typeof runWorkflowSchema>;

// ── Helpers ────────────────────────────────────────────────────────────────

function coerceParam(
  name: string,
  type: ParamType,
  raw: string | number | boolean,
): string | number | boolean {
  switch (type) {
    case "string":
    case "secret":
      if (typeof raw !== "string")
        throw new PpbError("INVALID_INPUT", `Parameter "${name}" must be ${type}`);
      return raw;
    case "number":
      if (typeof raw === "number") return raw;
      if (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw)))
        return Number(raw);
      throw new PpbError("INVALID_INPUT", `Parameter "${name}" must be ${type}`);
    case "boolean":
      if (typeof raw === "boolean") return raw;
      if (raw === "true") return true;
      if (raw === "false") return false;
      throw new PpbError("INVALID_INPUT", `Parameter "${name}" must be ${type}`);
  }
}

export function resolveParams(
  declared: Record<string, WorkflowParam>,
  given: ParamValues,
): ParamValues {
  const result: ParamValues = {};
  for (const key of Object.keys(given)) {
    if (!(key in declared)) {
      throw new PpbError("INVALID_INPUT", `Unknown parameter "${key}"`);
    }
  }
  for (const [name, param] of Object.entries(declared)) {
    const raw = given[name];
    if (raw !== undefined) {
      result[name] = coerceParam(name, param.type, raw);
    } else if (param.default !== undefined) {
      result[name] = param.default;
    } else if (param.required) {
      throw new PpbError("INVALID_INPUT", `Missing required parameter "${name}"`);
    }
  }
  return result;
}

export function renderTemplate(
  template: string,
  lookup: (expr: string) => string | undefined,
): string {
  return template.replace(/\{\{(.*?)\}\}/g, (_, expr: string) => {
    const trimmed = expr.trim();
    const value = lookup(trimmed);
    if (value === undefined) throw new Error(`Variable {{${trimmed}}} is not set`);
    return value;
  });
}
