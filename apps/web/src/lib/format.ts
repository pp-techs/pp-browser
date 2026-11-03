import { PpbError } from "@ppb/shared";

export function errorText(error: unknown): string {
  if (error instanceof PpbError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const seconds = Math.round((Date.parse(iso) - Date.now()) / 1000);
  const [unit, size] = UNITS.find(([, size]) => Math.abs(seconds) >= size) ?? UNITS.at(-1)!;
  return relative.format(Math.round(seconds / size), unit);
}
