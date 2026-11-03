import { PpbClient, PpbError } from "@ppb/shared";

/** True when running inside the Tauri desktop shell (always injected by Tauri v2), not a regular browser tab. */
export function isDesktopApp(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

const STORAGE_KEY = "ppb.token";

/** `ppb ui` opens the page with `#token=…`; keep it in localStorage and strip it from the address bar. */
export function captureTokenFromHash(): void {
  const match = /(?:^#|&)token=([^&]+)/.exec(window.location.hash);
  if (!match) return;
  localStorage.setItem(STORAGE_KEY, decodeURIComponent(match[1]!));
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

export function getToken(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token.trim());
}

export function clearToken(): void {
  localStorage.removeItem(STORAGE_KEY);
}

let cached: { token: string; client: PpbClient } | null = null;

/** API client for the signed-in token; throws UNAUTHORIZED when there is none. */
export function getApi(): PpbClient {
  const token = getToken();
  if (!token) throw new PpbError("UNAUTHORIZED", "Not signed in");
  if (cached?.token !== token) cached = { token, client: new PpbClient({ baseUrl: "", token }) };
  return cached.client;
}

/** Throwaway client used to validate a token before storing it. */
export function probeToken(token: string): Promise<unknown> {
  return new PpbClient({ baseUrl: "", token: token.trim() }).status();
}
