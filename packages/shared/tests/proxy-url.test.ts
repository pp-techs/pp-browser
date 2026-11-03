import { describe, expect, test } from "vite-plus/test";
import { formatProxyUrl, parseProxyUrl } from "../src/proxy-url.ts";
import { PpbError } from "../src/errors.ts";

describe("parseProxyUrl", () => {
  test("vendor host:port:user:pass export format", () => {
    expect(parseProxyUrl("1.2.3.4:8000:alice:secret")).toEqual({
      scheme: "http",
      host: "1.2.3.4",
      port: 8000,
      username: "alice",
      password: "secret",
    });
  });

  test("socks5h normalizes to socks5 and decodes credentials", () => {
    expect(parseProxyUrl("socks5h://us%40er:p%3Ass@proxy.example:1080")).toEqual({
      scheme: "socks5",
      host: "proxy.example",
      port: 1080,
      username: "us@er",
      password: "p:ss",
    });
  });

  test("bare host:port defaults to http", () => {
    expect(parseProxyUrl("proxy.example:3128")).toMatchObject({
      scheme: "http",
      port: 3128,
      username: null,
    });
  });

  test("rejects bad ports, paths and schemes", () => {
    for (const bad of [
      "http://h:70000",
      "1.2.3.4:0:u:p",
      "http://h:80/path",
      "ftp://h:21",
      "a:b:c",
      "",
    ]) {
      expect(() => parseProxyUrl(bad), bad).toThrow(PpbError);
    }
  });

  test("format round-trips special characters and masks passwords", () => {
    const parsed = parseProxyUrl("http://us%40er:p%3Ass@[::1]:8080");
    expect(parseProxyUrl(formatProxyUrl(parsed))).toEqual(parsed);
    expect(formatProxyUrl(parsed, { maskPassword: true })).toBe("http://us%40er:****@[::1]:8080");
  });
});
