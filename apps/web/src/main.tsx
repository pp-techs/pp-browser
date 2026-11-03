import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { captureTokenFromHash } from "./lib/auth.ts";
import { router } from "./router.tsx";
import "./globals.css";

// Must run before the router reads the URL so the token never lands in history.
captureTokenFromHash();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
