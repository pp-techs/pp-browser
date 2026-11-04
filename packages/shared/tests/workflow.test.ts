import { describe, expect, test } from "vite-plus/test";
import { renderTemplate, resolveParams, workflowDefinitionSchema } from "../src/workflow.ts";
import { PpbError } from "../src/errors.ts";

const validDef = {
  name: "test",
  params: { text: { type: "string" as const, required: true } },
  steps: [
    { id: "s1", do: "goto" as const, url: "https://example.com" },
    {
      id: "s2",
      do: "switch" as const,
      cases: [
        {
          cond: { exists: { role: "button", name: "OK" } },
          steps: [{ id: "s2a", do: "extract" as const, target: { selector: "#x" } }],
        },
      ],
    },
    { id: "s3", do: "type" as const, target: { role: "textbox" }, text: "{{text}}" },
    { id: "s4", do: "type" as const, target: { selector: "#y" }, text: "{{steps.s2a.value}}" },
    {
      id: "s5",
      do: "if" as const,
      cond: { not: { exists: { role: "alert" } } },
      // eslint-disable-next-line unicorn/no-thenable -- `then` is the workflow step field name
      then: [{ id: "s5a", do: "screenshot" as const }],
    },
  ],
};

describe("workflowDefinitionSchema", () => {
  test("valid nested definition parses", () => {
    const result = workflowDefinitionSchema.safeParse(validDef);
    expect(result.success).toBe(true);
  });

  test("duplicate id inside else branch is rejected", () => {
    const def = {
      ...validDef,
      steps: [
        {
          id: "a",
          do: "if",
          cond: { exists: { role: "button" } },
          // eslint-disable-next-line unicorn/no-thenable
          then: [{ id: "b", do: "screenshot" }],
          else: [{ id: "b", do: "screenshot" }],
        },
      ],
    };
    const result = workflowDefinitionSchema.safeParse(def);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("Duplicate step id"))).toBe(true);
    }
  });

  test("unknown variable is rejected", () => {
    const def = { ...validDef, steps: [{ id: "x", do: "goto", url: "{{missing}}" }] };
    const result = workflowDefinitionSchema.safeParse(def);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("Unknown variable"))).toBe(true);
    }
  });

  test("snapshot ref selector is rejected", () => {
    const def = {
      ...validDef,
      steps: [{ id: "x", do: "click", target: { selector: "e12" } }],
    };
    const result = workflowDefinitionSchema.safeParse(def);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("not stable"))).toBe(true);
    }
  });

  test("invalid urlMatches regex is rejected", () => {
    const def = {
      ...validDef,
      steps: [
        {
          id: "x",
          do: "if",
          cond: { urlMatches: "(" },
          // eslint-disable-next-line unicorn/no-thenable
          then: [{ id: "y", do: "screenshot" }],
        },
      ],
    };
    const result = workflowDefinitionSchema.safeParse(def);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("Invalid regex"))).toBe(true);
    }
  });
});

describe("resolveParams", () => {
  const declared = {
    text: { type: "string" as const, required: true },
    count: { type: "number" as const, default: 1 },
    flag: { type: "boolean" as const },
  };

  test("unknown key is rejected", () => {
    expect(() => resolveParams(declared, { unknown: "x" })).toThrow(PpbError);
  });

  test("missing required is rejected", () => {
    expect(() => resolveParams(declared, {})).toThrow(/Missing required parameter/);
  });

  test("default is applied", () => {
    const result = resolveParams(declared, { text: "hello" });
    expect(result.count).toBe(1);
  });

  test("string number coerces to number", () => {
    const result = resolveParams(declared, { text: "hi", count: "42" });
    expect(result.count).toBe(42);
  });

  test("non-boolean string rejected for boolean", () => {
    expect(() => resolveParams(declared, { text: "hi", flag: "yes" })).toThrow(/must be boolean/);
  });

  test("boolean strings accepted", () => {
    expect(resolveParams(declared, { text: "hi", flag: "true" }).flag).toBe(true);
    expect(resolveParams(declared, { text: "hi", flag: "false" }).flag).toBe(false);
  });
});

describe("renderTemplate", () => {
  test("replaces known variables", () => {
    expect(renderTemplate("hello {{name}}", (e) => ({ name: "world" })[e])).toBe("hello world");
  });

  test("throws on unset variable", () => {
    expect(() => renderTemplate("{{x}}", () => undefined)).toThrow("Variable {{x}} is not set");
  });

  test("no templates returns unchanged", () => {
    expect(renderTemplate("plain", () => undefined)).toBe("plain");
  });
});
