import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import fastifyStatic from "@fastify/static";
import { createMcpFastifyApp } from "@modelcontextprotocol/fastify";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import type { CoreService } from "@ppb/core";
import { createPpMcpServer } from "@ppb/mcp";
import {
  clickSchema,
  createProfileSchema,
  createProxySchema,
  evaluateSchema,
  gotoSchema,
  importProxiesSchema,
  newPageSchema,
  pageRefSchema,
  PpbError,
  pressSchema,
  runWorkflowSchema,
  screenshotSchema,
  startProfileSchema,
  typeSchema,
  updateProfileSchema,
  updateProxySchema,
  waitForSchema,
  workflowDefinitionSchema,
} from "@ppb/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import * as z from "zod";

export interface ServerOptions {
  service: CoreService;
  version: string;
  token: string;
  host: string;
  /** Built web UI (index.html + assets). Skipped when the directory does not exist. */
  webRoot: string | null;
}

const refParams = z.object({ ref: z.string().min(1) });
const pageParams = z.object({ ref: z.string().min(1), pageId: z.string().min(1) });

const parse = <S extends z.ZodType>(schema: S, value: unknown): z.infer<S> => {
  const result = schema.safeParse(value ?? {});
  if (!result.success) throw new PpbError("INVALID_INPUT", z.prettifyError(result.error));
  return result.data;
};

export async function createServer(options: ServerOptions): Promise<FastifyInstance> {
  const { service } = options;
  // Host/Origin validation for loopback binds guards REST and MCP against DNS rebinding.
  const app = createMcpFastifyApp({ host: options.host });
  const expected = Buffer.from(options.token);

  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0]!;
    if (!path.startsWith("/api/") && path !== "/mcp") return;
    if (!tokenMatches(request, expected)) {
      await reply
        .code(401)
        .send(new PpbError("UNAUTHORIZED", "Missing or invalid bearer token").toJSON());
    }
  });

  app.setErrorHandler(async (error: unknown, _request, reply) => {
    if (error instanceof PpbError) return reply.code(error.status).send(error.toJSON());
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof Error && "statusCode" in error ? error.statusCode : undefined;
    if (typeof status === "number" && status < 500) {
      return reply.code(status).send(new PpbError("INVALID_INPUT", message).toJSON());
    }
    app.log.error(error);
    return reply.code(500).send(new PpbError("INTERNAL", message).toJSON());
  });

  // ── REST ──────────────────────────────────────────────────────────────
  app.get("/api/status", () => service.status());

  app.get("/api/profiles", () => service.listProfiles());
  app.post("/api/profiles", async (req, reply) =>
    reply.code(201).send(await service.createProfile(parse(createProfileSchema, req.body))),
  );
  app.get("/api/profiles/:ref", (req) => service.getProfile(parse(refParams, req.params).ref));
  app.patch("/api/profiles/:ref", (req) =>
    service.updateProfile(parse(refParams, req.params).ref, parse(updateProfileSchema, req.body)),
  );
  app.delete("/api/profiles/:ref", async (req, reply) => {
    await service.deleteProfile(parse(refParams, req.params).ref);
    return reply.code(204).send();
  });
  app.post("/api/profiles/:ref/start", (req) =>
    service.startProfile(parse(refParams, req.params).ref, parse(startProfileSchema, req.body)),
  );
  app.post("/api/profiles/:ref/stop", (req) =>
    service.stopProfile(parse(refParams, req.params).ref),
  );

  app.get("/api/profiles/:ref/pages", (req) => service.listPages(parse(refParams, req.params).ref));
  app.post("/api/profiles/:ref/pages", (req) =>
    service.newPage(parse(refParams, req.params).ref, parse(newPageSchema, req.body)),
  );
  app.delete("/api/profiles/:ref/pages/:pageId", async (req, reply) => {
    const { ref, pageId } = parse(pageParams, req.params);
    await service.closePage(ref, pageId);
    return reply.code(204).send();
  });

  const actions = {
    goto: (ref: string, body: unknown) => service.goto(ref, parse(gotoSchema, body)),
    snapshot: (ref: string, body: unknown) => service.snapshot(ref, parse(pageRefSchema, body)),
    click: (ref: string, body: unknown) => service.click(ref, parse(clickSchema, body)),
    type: (ref: string, body: unknown) => service.type(ref, parse(typeSchema, body)),
    press: (ref: string, body: unknown) => service.press(ref, parse(pressSchema, body)),
    screenshot: (ref: string, body: unknown) =>
      service.screenshot(ref, parse(screenshotSchema, body)),
    evaluate: (ref: string, body: unknown) => service.evaluate(ref, parse(evaluateSchema, body)),
    "wait-for": (ref: string, body: unknown) => service.waitFor(ref, parse(waitForSchema, body)),
  } satisfies Record<string, (ref: string, body: unknown) => Promise<unknown>>;
  const actionParams = z.object({
    ref: z.string().min(1),
    action: z.enum(Object.keys(actions) as [keyof typeof actions]),
  });
  app.post("/api/profiles/:ref/actions/:action", (req) => {
    const { ref, action } = parse(actionParams, req.params);
    return actions[action](ref, req.body);
  });

  app.get("/api/proxies", () => service.listProxies());
  app.post("/api/proxies", async (req, reply) =>
    reply.code(201).send(await service.createProxy(parse(createProxySchema, req.body))),
  );
  app.post("/api/proxies/import", (req) =>
    service.importProxies(parse(importProxiesSchema, req.body).text),
  );
  app.patch("/api/proxies/:ref", (req) =>
    service.updateProxy(parse(refParams, req.params).ref, parse(updateProxySchema, req.body)),
  );
  app.delete("/api/proxies/:ref", async (req, reply) => {
    await service.deleteProxy(parse(refParams, req.params).ref);
    return reply.code(204).send();
  });
  app.post("/api/proxies/:ref/check", (req) =>
    service.checkProxy(parse(refParams, req.params).ref),
  );

  // ── workflows ──────────────────────────────────────────────────────────
  app.get("/api/workflows", () => service.listWorkflows());
  app.post("/api/workflows", (req) =>
    service.saveWorkflow(parse(workflowDefinitionSchema, req.body)),
  );
  app.get("/api/workflows/:ref", (req) => service.getWorkflow(parse(refParams, req.params).ref));
  app.delete("/api/workflows/:ref", async (req, reply) => {
    await service.deleteWorkflow(parse(refParams, req.params).ref);
    return reply.code(204).send();
  });
  app.post("/api/workflows/:ref/run", (req) =>
    service.runWorkflow(parse(refParams, req.params).ref, parse(runWorkflowSchema, req.body)),
  );

  app.post("/api/profiles/:ref/recording", async (req, reply) => {
    await service.startRecording(parse(refParams, req.params).ref);
    return reply.code(204).send();
  });
  app.delete("/api/profiles/:ref/recording", (req) =>
    service.stopRecording(parse(refParams, req.params).ref),
  );

  // ── MCP (Streamable HTTP) ─────────────────────────────────────────────
  const mcp = toNodeHandler(createMcpHandler(() => createPpMcpServer(service, options.version)));
  app.all("/mcp", async (request, reply) => {
    reply.hijack();
    await mcp(request.raw, reply.raw, request.body);
  });

  // ── Web UI ────────────────────────────────────────────────────────────
  if (options.webRoot && existsSync(options.webRoot)) {
    await app.register(fastifyStatic, { root: options.webRoot, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api/"))
        return reply.sendFile("index.html");
      return reply
        .code(404)
        .send(new PpbError("NOT_FOUND", `No route ${request.method} ${request.url}`).toJSON());
    });
  }

  return app;
}

function tokenMatches(request: FastifyRequest, expected: Buffer): boolean {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
