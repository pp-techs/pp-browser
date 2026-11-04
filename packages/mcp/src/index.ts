import { McpServer, type ToolCallback } from "@modelcontextprotocol/server";
import {
  clickSchema,
  createProfileSchema,
  evaluateSchema,
  gotoSchema,
  newPageSchema,
  pageRefSchema,
  PpbError,
  pressSchema,
  runWorkflowSchema,
  screenshotSchema,
  startProfileSchema,
  typeSchema,
  waitForSchema,
  workflowDefinitionSchema,
  type PageInfo,
  type PpbApi,
  type Profile,
} from "@ppb/shared";
import * as z from "zod";

type ToolResult = {
  content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[];
  isError?: boolean;
};

const profileArg = { profile: z.string().min(1).describe("Profile id or name") };

const text = (value: unknown): ToolResult => ({
  content: [
    { type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) },
  ],
});

function profileSummary(p: Profile) {
  return {
    id: p.id,
    name: p.name,
    group: p.group,
    status: p.runtime.status,
    proxy: p.proxy?.name ?? null,
    ip: p.runtime.ip,
    os: p.identity.os,
    pages: p.runtime.pageCount,
    memoryMb: p.runtime.memoryMb,
    lastError: p.runtime.lastError,
  };
}

/**
 * Builds the ppb MCP server over any `PpbApi`: the daemon passes its in-process service,
 * `ppb mcp` (stdio) passes an HTTP client to the daemon. Both expose identical tools.
 */
export function createPpMcpServer(api: PpbApi, version: string): McpServer {
  const server = new McpServer({ name: "pp-browser", version });

  const tool = <S extends z.ZodObject>(
    name: string,
    description: string,
    inputSchema: S,
    handler: (args: z.output<S>) => Promise<ToolResult>,
  ) => {
    const callback = async (args: z.output<S>): Promise<ToolResult> => {
      try {
        return await handler(args);
      } catch (error) {
        const message =
          error instanceof PpbError ? `${error.code}: ${error.message}` : String(error);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    };
    // ToolCallback<S> is a conditional type TypeScript cannot resolve while S is still generic.
    server.registerTool(name, { description, inputSchema }, callback as ToolCallback<S>);
  };

  /** Page-changing actions answer with a fresh snapshot so the agent can pick the next ref without another call. */
  const withSnapshot = async (profile: string, info: PageInfo): Promise<ToolResult> => {
    const snap = await api.snapshot(profile, { pageId: info.pageId });
    return text(`page ${snap.pageId}: ${snap.title}\n${snap.url}\n\n${snap.snapshot}`);
  };

  tool(
    "list_profiles",
    "List browser profiles with status, proxy and exit IP.",
    z.object({}),
    async () => text((await api.listProfiles()).map(profileSummary)),
  );

  tool("get_profile", "Show one profile in full.", z.object(profileArg), async ({ profile }) =>
    text(await api.getProfile(profile)),
  );

  tool(
    "create_profile",
    "Create a profile with a new persistent fingerprint. Optionally bind a proxy.",
    createProfileSchema,
    async (input) => text(profileSummary(await api.createProfile(input))),
  );

  tool(
    "start_profile",
    "Launch a profile's browser through its proxy. Required before any page tool.",
    startProfileSchema.extend(profileArg),
    async ({ profile, ...input }) => text(profileSummary(await api.startProfile(profile, input))),
  );

  tool(
    "stop_profile",
    "Close a profile's browser. Cookies and storage persist.",
    z.object(profileArg),
    async ({ profile }) => text(profileSummary(await api.stopProfile(profile))),
  );

  tool("list_proxies", "List saved proxies and their last check result.", z.object({}), async () =>
    text(await api.listProxies()),
  );

  tool(
    "check_proxy",
    "Test a proxy: exit IP, country, timezone, latency.",
    z.object({ proxy: z.string().min(1).describe("Proxy id or name") }),
    async ({ proxy }) => text(await api.checkProxy(proxy)),
  );

  tool(
    "list_pages",
    "List open pages (tabs) of a running profile.",
    z.object(profileArg),
    async ({ profile }) => text(await api.listPages(profile)),
  );

  tool(
    "new_page",
    "Open a new page, optionally navigating to a URL.",
    newPageSchema.extend(profileArg),
    async ({ profile, ...input }) => withSnapshot(profile, await api.newPage(profile, input)),
  );

  tool(
    "close_page",
    "Close a page.",
    z.object({ ...profileArg, pageId: z.string().min(1) }),
    async ({ profile, pageId }) => {
      await api.closePage(profile, pageId);
      return text(`closed ${pageId}`);
    },
  );

  tool(
    "navigate",
    "Navigate a page to a URL; returns the page snapshot.",
    gotoSchema.extend(profileArg),
    async ({ profile, ...input }) => withSnapshot(profile, await api.goto(profile, input)),
  );

  tool(
    "snapshot",
    "Accessibility snapshot of a page. Elements carry [ref=…] (e.g. e12, f1e5) usable as `target` in click/type.",
    pageRefSchema.extend(profileArg),
    async ({ profile, ...input }) => {
      const snap = await api.snapshot(profile, input);
      return text(`page ${snap.pageId}: ${snap.title}\n${snap.url}\n\n${snap.snapshot}`);
    },
  );

  tool(
    "click",
    "Click an element; returns the updated snapshot.",
    clickSchema.extend(profileArg),
    async ({ profile, ...input }) => withSnapshot(profile, await api.click(profile, input)),
  );

  tool(
    "type",
    "Fill a text field; returns the updated snapshot.",
    typeSchema.extend(profileArg),
    async ({ profile, ...input }) => withSnapshot(profile, await api.type(profile, input)),
  );

  tool(
    "press",
    "Press a key on the focused element; returns the updated snapshot.",
    pressSchema.extend(profileArg),
    async ({ profile, ...input }) => withSnapshot(profile, await api.press(profile, input)),
  );

  tool(
    "wait_for",
    "Wait for text or a selector to appear, or for a fixed time.",
    waitForSchema.extend(profileArg),
    async ({ profile, ...input }) => withSnapshot(profile, await api.waitFor(profile, input)),
  );

  tool(
    "screenshot",
    "PNG screenshot of a page.",
    screenshotSchema.extend(profileArg),
    async ({ profile, ...input }) => {
      const shot = await api.screenshot(profile, input);
      return { content: [{ type: "image", data: shot.data, mimeType: shot.mimeType }] };
    },
  );

  tool(
    "evaluate",
    "Evaluate a JavaScript expression in the page and return its JSON result.",
    evaluateSchema.extend(profileArg),
    async ({ profile, ...input }) => text((await api.evaluate(profile, input)).result ?? null),
  );

  // ── workflows ───────────────────────────────────────────────────────────

  const workflowArg = {
    workflow: z.string().min(1).describe("Workflow id or name"),
  };

  tool("list_workflows", "List saved workflows with their parameters.", z.object({}), async () =>
    text(await api.listWorkflows()),
  );

  tool(
    "get_workflow",
    "Show a workflow definition.",
    z.object(workflowArg),
    async ({ workflow }) => {
      const wf = await api.getWorkflow(workflow);
      return text({ version: wf.version, definition: wf.definition });
    },
  );

  tool(
    "save_workflow",
    'Save (create or update) a reusable browser workflow; saving an existing name creates a new version. definition = { name, description?, params?: { <name>: { type: "string"|"number"|"boolean"|"secret", required?, default?, description? } }, steps: Step[] }. Step = { id, do, optional?, onFail?: "needs_agent"|"abort"|"continue", timeoutMs? } plus per do: goto {url}; click {target}; type {target, text, submit?, mode?: "fill"|"keystrokes"}; press {key}; wait_for {text? | target?} (neither = sleep timeoutMs); screenshot {fullPage?}; extract {target, attr?}; if {cond, then, else?}; switch {cases: [{cond, steps}], default?}. target = {role, name?, exact?, nth?} | {text, exact?, nth?} | {selector, nth?}; never snapshot refs. cond = {exists: target} | {notExists: target} | {textVisible} | {urlMatches} | {paramSet} | {paramEquals: {name, value}} | {and: [..]} | {or: [..]} | {not: cond}. Strings may contain {{param}} and {{steps.<id>.value}} (set by extract). if checks once; switch waits up to timeoutMs (default 10000) for the first matching case, then runs default. optional steps are skipped when they fail (default timeout 2000ms).',
    z.object({
      definition: z
        .record(z.string(), z.unknown())
        .describe("Workflow definition object; see tool description for the format"),
    }),
    async ({ definition }) => {
      const parsed = workflowDefinitionSchema.safeParse(definition);
      if (!parsed.success) throw new PpbError("INVALID_INPUT", z.prettifyError(parsed.error));
      const wf = await api.saveWorkflow(parsed.data);
      return text({ name: wf.name, version: wf.version });
    },
  );

  tool("delete_workflow", "Delete a workflow.", z.object(workflowArg), async ({ workflow }) => {
    await api.deleteWorkflow(workflow);
    return text(`deleted ${workflow}`);
  });

  tool(
    "run_workflow",
    "Run a saved workflow on a profile (starts it headless if needed). On status needs_agent the page stays open: read failedStep and the snapshot, fix the step with save_workflow, then run again.",
    runWorkflowSchema.extend(workflowArg),
    async ({ workflow, ...input }) => {
      const result = await api.runWorkflow(workflow, input);
      const { screenshots, snapshot, ...rest } = result;
      const content: ToolResult["content"] = [
        { type: "text", text: JSON.stringify(rest, null, 2) },
      ];
      if (snapshot !== undefined) {
        content.push({ type: "text", text: `page ${result.pageId} snapshot:\n${snapshot}` });
      }
      for (const shot of screenshots) {
        content.push({ type: "image", data: shot.data, mimeType: "image/png" });
      }
      return { content };
    },
  );

  tool(
    "start_recording",
    "Record this profile's subsequent navigate/click/type/press/wait_for calls as workflow steps. Call snapshot before acting so refs can be turned into stable locators.",
    z.object(profileArg),
    async ({ profile }) => {
      await api.startRecording(profile);
      return text(`recording ${profile}`);
    },
  );

  tool(
    "stop_recording",
    "Stop recording and return the recorded steps and warnings. Replace literal values with {{param}} placeholders, add params, then save_workflow.",
    z.object(profileArg),
    async ({ profile }) => text(await api.stopRecording(profile)),
  );

  return server;
}
