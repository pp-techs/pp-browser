import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: ["**/dist/**", "**/routeTree.gen.ts", "**/astryx-themes.ts"],
  },
  lint: {
    ignorePatterns: ["**/dist/**", "**/routeTree.gen.ts", "**/astryx-themes.ts"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: ["apps/web/**"],
        plugins: ["react"],
      },
    ],
  },
  run: {
    cache: true,
  },
});
