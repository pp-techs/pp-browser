import type {
  Condition,
  ParamValues,
  RunStatus,
  StepLog,
  WorkflowDefinition,
  WorkflowStep,
} from "@ppb/shared";
import { renderTemplate } from "@ppb/shared";
import type { Page } from "playwright-core";
import { normalizeUrl } from "./session.ts";
import { resolveLocator } from "./locator.ts";

export interface RunOutcome {
  status: RunStatus;
  failedStep?: { path: string; id: string; error: string };
  outputs: Record<string, string>;
  screenshots: { stepId: string; data: string }[];
  log: StepLog[];
}

interface ExecContext {
  page: Page;
  params: ParamValues;
  secrets: string[];
  outputs: Record<string, string>;
  screenshots: { stepId: string; data: string }[];
  log: StepLog[];
}

function mask(message: string, secrets: string[]): string {
  let result = message;
  for (const s of secrets) result = result.split(s).join("***");
  return result;
}

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const cut = raw.indexOf("\nCall log:");
  return (cut === -1 ? raw : raw.slice(0, cut)).trim().slice(0, 1000);
}

const OPTIONAL_TIMEOUT_MS = 2000;

// ── condition evaluation ───────────────────────────────────────────────────

async function evalCond(ctx: ExecContext, cond: Condition): Promise<boolean> {
  const render = (s: string) => renderTemplate(s, lookup(ctx));
  if ("exists" in cond) return resolveLocator(ctx.page, cond.exists, render).first().isVisible();
  if ("notExists" in cond)
    return !(await resolveLocator(ctx.page, cond.notExists, render).first().isVisible());
  if ("textVisible" in cond)
    return ctx.page.getByText(render(cond.textVisible)).first().isVisible();
  if ("urlMatches" in cond) return new RegExp(cond.urlMatches).test(ctx.page.url());
  if ("paramSet" in cond) {
    const v = ctx.params[cond.paramSet];
    return v !== undefined && String(v) !== "";
  }
  if ("paramEquals" in cond) return ctx.params[cond.paramEquals.name] === cond.paramEquals.value;
  if ("and" in cond) {
    for (const c of cond.and) if (!(await evalCond(ctx, c))) return false;
    return true;
  }
  if ("or" in cond) {
    for (const c of cond.or) if (await evalCond(ctx, c)) return true;
    return false;
  }
  if ("not" in cond) return !(await evalCond(ctx, cond.not));
  return false;
}

// ── variable lookup ────────────────────────────────────────────────────────

function lookup(ctx: ExecContext): (expr: string) => string | undefined {
  return (expr) => {
    if (expr.startsWith("steps.")) {
      const m = /^steps\.([\w-]+)\.value$/.exec(expr);
      return m ? ctx.outputs[m[1]!] : undefined;
    }
    const v = ctx.params[expr];
    return v !== undefined ? String(v) : "";
  };
}

// ── step execution ─────────────────────────────────────────────────────────

async function execSteps(
  ctx: ExecContext,
  steps: WorkflowStep[],
  basePath: string,
  parentBranch: string | undefined,
): Promise<RunOutcome | null> {
  for (const [i, step] of steps.entries()) {
    const path = basePath ? `${basePath}.${i}` : String(i);
    const start = performance.now();
    const render = (s: string) => renderTemplate(s, lookup(ctx));
    let branch: string | undefined;

    try {
      const terminal = await runStep(ctx, step, render, (b) => (branch = b), path);
      if (terminal) return terminal;
      ctx.log.push({
        path,
        id: step.id,
        do: step.do,
        status: "ok",
        ...(branch !== undefined ? { branch } : parentBranch ? { branch: parentBranch } : {}),
        ms: Math.round(performance.now() - start),
      });
    } catch (error) {
      const msg = mask(errorMessage(error), ctx.secrets);
      const ms = Math.round(performance.now() - start);

      if (step.optional) {
        ctx.log.push({ path, id: step.id, do: step.do, status: "skipped", error: msg, ms });
        continue;
      }

      const policy = step.onFail ?? "needs_agent";
      if (policy === "continue") {
        ctx.log.push({
          path,
          id: step.id,
          do: step.do,
          status: "continued",
          error: msg,
          ms,
        });
        continue;
      }

      ctx.log.push({ path, id: step.id, do: step.do, status: "failed", error: msg, ms });
      return {
        status: policy === "abort" ? "failed" : "needs_agent",
        failedStep: { path, id: step.id, error: msg },
        outputs: ctx.outputs,
        screenshots: ctx.screenshots,
        log: ctx.log,
      };
    }
  }
  return null;
}

async function runStep(
  ctx: ExecContext,
  step: WorkflowStep,
  render: (s: string) => string,
  setBranch: (b: string) => void,
  path: string,
): Promise<RunOutcome | null> {
  const timeout = step.timeoutMs ?? (step.optional ? OPTIONAL_TIMEOUT_MS : undefined);
  const page = ctx.page;

  switch (step.do) {
    case "goto":
      await page.goto(normalizeUrl(render(step.url)), { waitUntil: "domcontentloaded", timeout });
      return null;

    case "click":
      await resolveLocator(page, step.target, render).click({ timeout });
      return null;

    case "type": {
      const loc = resolveLocator(page, step.target, render);
      const text = render(step.text);
      if (step.mode === "keystrokes") {
        await loc.click({ timeout });
        await loc.pressSequentially(text, { delay: 50, timeout });
      } else {
        await loc.fill(text, { timeout });
      }
      if (step.submit) await loc.press("Enter", { timeout });
      return null;
    }

    case "press":
      await page.keyboard.press(step.key);
      return null;

    case "wait_for":
      if (step.text !== undefined) {
        await page.getByText(render(step.text)).first().waitFor({ state: "visible", timeout });
      } else if (step.target !== undefined) {
        await resolveLocator(page, step.target, render)
          .first()
          .waitFor({ state: "visible", timeout });
      } else {
        await page.waitForTimeout(step.timeoutMs ?? 1000);
      }
      return null;

    case "screenshot": {
      const buf = await page.screenshot({ type: "png", fullPage: step.fullPage ?? false });
      ctx.screenshots.push({ stepId: step.id, data: buf.toString("base64") });
      return null;
    }

    case "extract": {
      const loc = resolveLocator(page, step.target, render);
      const value = step.attr
        ? ((await loc.getAttribute(step.attr, { timeout })) ?? "")
        : (await loc.innerText({ timeout })).trim();
      ctx.outputs[step.id] = value;
      return null;
    }

    case "if": {
      const branch = (await evalCond(ctx, step.cond)) ? "then" : "else";
      setBranch(branch);
      const childSteps = branch === "then" ? step.then : (step.else ?? []);
      const childBase = `${path}.${branch === "then" ? "then" : "else"}`;
      return await execSteps(ctx, childSteps, childBase, undefined);
    }

    case "switch": {
      const deadline = performance.now() + (step.timeoutMs ?? 10_000);
      for (;;) {
        for (const [ci, c] of step.cases.entries()) {
          if (await evalCond(ctx, c.cond)) {
            setBranch(`cases.${ci}`);
            return await execSteps(ctx, c.steps, `${path}.cases.${ci}.steps`, undefined);
          }
        }
        if (performance.now() >= deadline) break;
        await page.waitForTimeout(250);
      }
      if (step.default) {
        setBranch("default");
        return await execSteps(ctx, step.default, `${path}.default`, undefined);
      }
      throw new Error(`No case matched within ${step.timeoutMs ?? 10_000}ms`);
    }
  }
  return null;
}

// ── public API ─────────────────────────────────────────────────────────────

export async function runSteps(
  page: Page,
  definition: WorkflowDefinition,
  params: ParamValues,
): Promise<RunOutcome> {
  const secrets = Object.entries(definition.params)
    .filter(([, p]) => p.type === "secret")
    .map(([name]) => String(params[name] ?? ""))
    .filter((s) => s.length > 0);

  const ctx: ExecContext = {
    page,
    params,
    secrets,
    outputs: {},
    screenshots: [],
    log: [],
  };

  const result = await execSteps(ctx, definition.steps, "", undefined);
  if (result) return result;
  return {
    status: "succeeded",
    outputs: ctx.outputs,
    screenshots: ctx.screenshots,
    log: ctx.log,
  };
}
