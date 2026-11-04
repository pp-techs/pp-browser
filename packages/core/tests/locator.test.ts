import { describe, expect, test } from "vite-plus/test";
import { parseRefLine } from "../src/locator.ts";

describe("parseRefLine", () => {
  test('extracts role and name from `- button "Post" [ref=e12]`', () => {
    const result = parseRefLine('- button "Post" [ref=e12]', "e12");
    expect(result).toEqual({ role: "button", name: "Post" });
  });

  test("extracts from indented line with attributes", () => {
    const snapshot = '  - textbox "Email" [active] [ref=e5]';
    expect(parseRefLine(snapshot, "e5")).toEqual({ role: "textbox", name: "Email" });
  });

  test("handles YAML single-quoted key", () => {
    const snapshot = `- 'button "a: b" [ref=e9]'`;
    expect(parseRefLine(snapshot, "e9")).toEqual({ role: "button", name: "a: b" });
  });

  test("handles escaped quotes in name", () => {
    const snapshot = '- button "Say \\"hi\\"" [ref=e7]';
    expect(parseRefLine(snapshot, "e7")).toEqual({ role: "button", name: 'Say "hi"' });
  });

  test("role only when no name", () => {
    const snapshot = "- link [ref=e3] [cursor=pointer]:";
    expect(parseRefLine(snapshot, "e3")).toEqual({ role: "link" });
  });

  test("returns null when ref not found", () => {
    const snapshot = '- button "Post" [ref=e12]';
    expect(parseRefLine(snapshot, "e1")).toBeNull();
  });
});
