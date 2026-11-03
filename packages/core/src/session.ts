import { PpbError, type PageInfo } from "@ppb/shared";
import type { BrowserContext, Locator, Page } from "playwright-core";
import type { Forwarder } from "./forwarder.ts";

const ACTION_TIMEOUT_MS = 15_000;
const NAVIGATION_TIMEOUT_MS = 45_000;

/** A launched profile: its browser context, proxy forwarder and addressable pages. */
export class Session {
  readonly context: BrowserContext;
  readonly forwarder: Forwarder | null;
  readonly headless: boolean;
  readonly startedAt: string;
  readonly ip: string;
  readonly #pages = new Map<string, Page>();
  readonly #ids = new WeakMap<Page, string>();
  #nextId = 1;
  #activeId: string | null = null;

  constructor(options: {
    context: BrowserContext;
    forwarder: Forwarder | null;
    headless: boolean;
    ip: string;
  }) {
    this.context = options.context;
    this.forwarder = options.forwarder;
    this.headless = options.headless;
    this.ip = options.ip;
    this.startedAt = new Date().toISOString();
    this.context.setDefaultTimeout(ACTION_TIMEOUT_MS);
    this.context.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
    for (const page of this.context.pages()) this.#register(page);
    this.context.on("page", (page) => this.#register(page));
  }

  get pageCount(): number {
    return this.#pages.size;
  }

  listPages(): Promise<PageInfo[]> {
    return Promise.all([...this.#pages.values()].map((page) => this.info(page)));
  }

  async info(page: Page): Promise<PageInfo> {
    const pageId = this.#ids.get(page) ?? "";
    return {
      pageId,
      url: page.url(),
      title: await page.title().catch(() => ""),
      active: pageId === this.#activeId,
    };
  }

  /** Resolves a page id, defaulting to the most recently used page; opens one when none exist. */
  async page(pageId?: string): Promise<Page> {
    if (pageId) {
      const page = this.#pages.get(pageId);
      if (!page) throw new PpbError("NOT_FOUND", `No page ${pageId}`);
      this.#activeId = pageId;
      return page;
    }
    const active = this.#activeId ? this.#pages.get(this.#activeId) : undefined;
    if (active) return active;
    const last = [...this.#pages.values()].at(-1);
    if (last) {
      this.#activeId = this.#ids.get(last)!;
      return last;
    }
    return this.newPage();
  }

  async newPage(): Promise<Page> {
    const page = await this.context.newPage();
    this.#activeId = this.#register(page);
    return page;
  }

  async closePage(pageId: string): Promise<void> {
    const page = this.#pages.get(pageId);
    if (!page) throw new PpbError("NOT_FOUND", `No page ${pageId}`);
    await page.close();
  }

  async close(): Promise<void> {
    await this.context.close().catch(() => undefined);
    await this.forwarder?.close().catch(() => undefined);
  }

  #register(page: Page): string {
    const existing = this.#ids.get(page);
    if (existing) return existing;
    const id = `p${this.#nextId++}`;
    this.#ids.set(page, id);
    this.#pages.set(id, page);
    page.on("close", () => {
      this.#pages.delete(id);
      if (this.#activeId === id) this.#activeId = null;
    });
    return id;
  }
}

/** Refs (`e12`, or `f1e12` inside frames/after navigation) come from `ariaSnapshot({ mode: "ai" })`; anything else is a Playwright selector. */
export function locate(page: Page, target: string): Locator {
  return /^(f\d+)?e\d+$/.test(target) ? page.locator(`aria-ref=${target}`) : page.locator(target);
}

export function normalizeUrl(url: string): string {
  return /^([a-z][a-z\d+.-]*:\/\/|about:|data:)/i.test(url) ? url : `https://${url}`;
}
