import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

const daemon = process.env.PPB_DAEMON_URL ?? "http://127.0.0.1:7777";

export default defineConfig({
  plugins: [
    // Must run before the React plugin so route files are transformed for code splitting.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
  ],
  server: {
    proxy: {
      "/api": daemon,
      "/mcp": daemon,
    },
  },
});
