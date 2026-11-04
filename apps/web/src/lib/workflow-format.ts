import type { Condition, Locator, WorkflowStep } from "@ppb/shared";

export function describeLocator(loc: Locator): string {
  const nth = loc.nth === undefined ? "" : ` #${loc.nth + 1}`;
  if ("role" in loc) return `${loc.role}${loc.name === undefined ? "" : ` "${loc.name}"`}${nth}`;
  if ("text" in loc) return `text "${loc.text}"${nth}`;
  return `css ${loc.selector}${nth}`;
}

export function describeCondition(cond: Condition): string {
  if ("exists" in cond) return `${describeLocator(cond.exists)} is visible`;
  if ("notExists" in cond) return `${describeLocator(cond.notExists)} is not visible`;
  if ("textVisible" in cond) return `text "${cond.textVisible}" is visible`;
  if ("urlMatches" in cond) return `URL matches /${cond.urlMatches}/`;
  if ("paramSet" in cond) return `{{${cond.paramSet}}} is set`;
  if ("paramEquals" in cond)
    return `{{${cond.paramEquals.name}}} = ${JSON.stringify(cond.paramEquals.value)}`;
  if ("and" in cond) return cond.and.map(describeCondition).join(" and ");
  if ("or" in cond) return cond.or.map(describeCondition).join(" or ");
  return `not (${describeCondition(cond.not)})`;
}

/** One-line summary of a step; nested branches of `if`/`switch` are rendered by the caller. */
export function describeStep(step: WorkflowStep): { label: string; detail?: string } {
  switch (step.do) {
    case "goto":
      return { label: "Go to", detail: step.url };
    case "click":
      return { label: "Click", detail: describeLocator(step.target) };
    case "type":
      return {
        label: step.mode === "keystrokes" ? "Type keys" : "Type",
        detail: `${JSON.stringify(step.text)} into ${describeLocator(step.target)}${step.submit ? ", then Enter" : ""}`,
      };
    case "press":
      return { label: "Press", detail: step.key };
    case "wait_for":
      return {
        label: "Wait for",
        detail:
          step.text !== undefined
            ? `text "${step.text}"`
            : step.target
              ? describeLocator(step.target)
              : `${step.timeoutMs ?? 1000} ms`,
      };
    case "screenshot":
      return { label: "Screenshot", detail: step.fullPage ? "full page" : undefined };
    case "extract":
      return {
        label: "Extract",
        detail: `${describeLocator(step.target)}${step.attr ? ` @${step.attr}` : ""} → {{steps.${step.id}.value}}`,
      };
    case "if":
      return { label: "If", detail: describeCondition(step.cond) };
    case "switch":
      return {
        label: "Switch",
        detail: `first matching case, up to ${step.timeoutMs ?? 10_000} ms`,
      };
  }
}
