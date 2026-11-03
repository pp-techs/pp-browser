import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/main.ts"],
    platform: "node",
    target: "node24",
    format: "esm",
    dts: false,
    // Workspace packages (@ppb/*) are devDependencies and get inlined; `dependencies` stay external.
    copy: [{ from: "../web/dist", to: "dist", rename: "web" }],
  },
});
