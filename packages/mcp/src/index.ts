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
  screenshotSchema,
  startProfileSchema,
  typeSchema,
  waitForSchema,
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

  return server;
}
