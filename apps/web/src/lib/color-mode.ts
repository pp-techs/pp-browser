import { useSyncExternalStore } from "react";

export type ColorMode = "system" | "light" | "dark";

const STORAGE_KEY = "ppb.colorMode";
const MODES: readonly ColorMode[] = ["system", "light", "dark"];

function read(): ColorMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return MODES.find((mode) => mode === stored) ?? "system";
}

let current = read();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setColorMode(mode: ColorMode): void {
  current = mode;
  localStorage.setItem(STORAGE_KEY, mode);
  for (const listener of listeners) listener();
}

export function useColorMode(): ColorMode {
  return useSyncExternalStore(subscribe, () => current);
}
