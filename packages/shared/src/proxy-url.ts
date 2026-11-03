import { PpbError } from "./errors.ts";

export const PROXY_SCHEMES = ["http", "https", "socks4", "socks5"] as const;
export type ProxyScheme = (typeof PROXY_SCHEMES)[number];

export interface ParsedProxy {
  scheme: ProxyScheme;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
}

const DEFAULT_PORT: Record<ProxyScheme, number> = {
  http: 80,
  https: 443,
  socks4: 1080,
  socks5: 1080,
};

/**
 * Accepts `scheme://[user:pass@]host[:port]`, `host:port`, and the vendor export
 * format `host:port:user:pass`. Scheme defaults to http; `socks5h`/`socks` normalize to socks5.
 */
export function parseProxyUrl(input: string): ParsedProxy {
  const raw = input.trim();
  if (!raw) throw new PpbError("INVALID_INPUT", "Proxy URL is empty");

  if (!raw.includes("://")) {
    const parts = raw.split(":");
    if (parts.length === 4) {
      const [host, port, username, password] = parts as [string, string, string, string];
      return build("http", host, port, username, password, input);
    }
    if (parts.length !== 2)
      throw new PpbError("INVALID_INPUT", `Unrecognized proxy format: ${input}`);
    return parseProxyUrl(`http://${raw}`);
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PpbError("INVALID_INPUT", `Invalid proxy URL: ${input}`);
  }
  const scheme = normalizeScheme(url.protocol.slice(0, -1));
  if (!scheme) throw new PpbError("INVALID_INPUT", `Unsupported proxy scheme: ${url.protocol}`);
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new PpbError("INVALID_INPUT", `Proxy URL must not contain a path: ${input}`);
  }
  return build(
    scheme,
    url.hostname.replace(/^\[|\]$/g, ""),
    url.port || String(DEFAULT_PORT[scheme]),
    decodeURIComponent(url.username),
    decodeURIComponent(url.password),
    input,
  );
}

export function formatProxyUrl(proxy: ParsedProxy, { maskPassword = false } = {}): string {
  const host = proxy.host.includes(":") ? `[${proxy.host}]` : proxy.host;
  let auth = "";
  if (proxy.username !== null) {
    const password =
      proxy.password === null ? "" : maskPassword ? "****" : encodeURIComponent(proxy.password);
    auth = `${encodeURIComponent(proxy.username)}${password ? `:${password}` : ""}@`;
  }
  return `${proxy.scheme}://${auth}${host}:${proxy.port}`;
}

function normalizeScheme(scheme: string): ProxyScheme | null {
  const lower = scheme.toLowerCase();
  if (lower === "socks" || lower === "socks5h") return "socks5";
  if (lower === "socks4a") return "socks4";
  return (PROXY_SCHEMES as readonly string[]).includes(lower) ? (lower as ProxyScheme) : null;
}

function build(
  scheme: ProxyScheme,
  host: string,
  portText: string,
  username: string,
  password: string,
  input: string,
): ParsedProxy {
  const port = Number(portText);
  if (!host) throw new PpbError("INVALID_INPUT", `Proxy host is missing: ${input}`);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new PpbError("INVALID_INPUT", `Invalid proxy port: ${input}`);
  }
  return {
    scheme,
    host,
    port,
    username: username ? username : null,
    password: username && password ? password : null,
  };
}
