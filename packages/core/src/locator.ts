import type { Locator as WorkflowLocator } from "@ppb/shared";
import type { ElementHandle, Locator, Page } from "playwright-core";
import { isRef } from "./session.ts";

/**
 * Parses a single line of an `ariaSnapshot({ mode: "ai" })` result to extract the
 * accessible role and name for the element carrying `ref`.
 *
 * Snapshot line formats (after YAML key unquoting):
 *   - button "Post" [ref=e12]
 *   - textbox "Email" [active] [ref=e5]
 *   - 'button "a: b" [ref=e9]'
 *   - link [ref=e3] [cursor=pointer]:
 */
export function parseRefLine(
  snapshot: string,
  ref: string,
): { role: string; name?: string } | null {
  const refRe = new RegExp(`\\[ref=${ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`);
  for (const rawLine of snapshot.split("\n")) {
    if (!refRe.test(rawLine)) continue;

    let line = rawLine.trimStart();
    if (line.startsWith("- ")) line = line.slice(2);

    // Unwrap YAML single-quoted key: '...' with '' as escaped quote
    if (line.startsWith("'")) {
      let inner = "";
      let i = 1;
      while (i < line.length) {
        if (line[i] === "'" && line[i + 1] === "'") {
          inner += "'";
          i += 2;
        } else if (line[i] === "'") {
          i++;
          break;
        } else {
          inner += line[i];
          i++;
        }
      }
      line = inner;
    }

    const roleMatch = /^[a-z]+/.exec(line);
    if (!roleMatch) return null;
    const role = roleMatch[0];
    let rest = line.slice(role.length);
    if (rest.startsWith(" ")) rest = rest.slice(1);

    if (rest.startsWith('"')) {
      const nameMatch = /^"(?:[^"\\]|\\.)*"/.exec(rest);
      if (nameMatch) {
        try {
          return { role, name: JSON.parse(nameMatch[0]) as string };
        } catch {
          return { role };
        }
      }
      return { role };
    }
    if (rest.startsWith("/")) {
      const end = rest.indexOf(" [");
      const name = end === -1 ? rest.replace(/:$/, "") : rest.slice(0, end);
      return { role, name };
    }
    return { role };
  }
  return null;
}

/** Build a Playwright Locator from a workflow Locator spec. */
export function resolveLocator(
  page: Page,
  loc: WorkflowLocator,
  render: (s: string) => string,
): Locator {
  let result: Locator;
  if ("role" in loc) {
    result = page.getByRole(loc.role as Parameters<Page["getByRole"]>[0], {
      name: loc.name === undefined ? undefined : render(loc.name),
      exact: loc.exact ?? true,
    });
  } else if ("text" in loc) {
    result = page.getByText(render(loc.text), { exact: loc.exact ?? false });
  } else {
    result = page.locator(render(loc.selector));
  }
  return loc.nth !== undefined ? result.nth(loc.nth) : result;
}

/**
 * Resolves a `target` string (ref or Playwright selector) into a stable workflow
 * Locator suitable for recording. Returns `{ warning }` when a stable locator
 * cannot be built.
 */
export async function describeTarget(
  page: Page,
  snapshot: string | undefined,
  target: string,
): Promise<WorkflowLocator | { warning: string }> {
  if (!isRef(target)) return { selector: target };
  if (!snapshot)
    return {
      warning: "no snapshot taken on this page; call snapshot before acting while recording",
    };

  const parsed = parseRefLine(snapshot, target);
  if (!parsed) return { warning: "ref not found in the latest snapshot" };

  const { role, name } = parsed;
  let handle: ElementHandle<SVGElement | HTMLElement> | null = null;
  try {
    handle = await page.locator(`aria-ref=${target}`).elementHandle({ timeout: 2000 });
    if (!handle) return { warning: `could not resolve ref ${target}` };

    const matches = page.getByRole(role as Parameters<Page["getByRole"]>[0], {
      name,
      exact: true,
    });
    const { index, count } = await matches.evaluateAll(
      (els, el: HTMLElement | SVGElement) => ({ index: els.indexOf(el), count: els.length }),
      handle,
    );

    if (index === -1)
      return { warning: `could not build a stable locator (${role} "${name ?? ""}")` };

    return {
      role,
      ...(name !== undefined ? { name } : {}),
      ...(count > 1 ? { nth: index } : {}),
    };
  } catch {
    return { warning: `could not build a stable locator (${role} "${name ?? ""}")` };
  } finally {
    await handle?.dispose().catch(() => undefined);
  }
}
