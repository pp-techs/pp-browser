import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface ProcessUsage {
  pid: number;
  memoryMb: number;
}

/**
 * Resident memory of each browser process tree, keyed by user-data-dir.
 * The main Firefox process carries `-profile <dir>` on its command line; content processes are its descendants.
 * One `ps` call covers every running profile. Returns an empty map where `ps` is unavailable (Windows).
 */
export async function usageByProfileDir(dirs: string[]): Promise<Map<string, ProcessUsage>> {
  const result = new Map<string, ProcessUsage>();
  if (dirs.length === 0 || process.platform === "win32") return result;
  let stdout: string;
  try {
    ({ stdout } = await run("ps", ["-axww", "-o", "pid=,ppid=,rss=,command="], {
      maxBuffer: 32 * 1024 * 1024,
    }));
  } catch {
    return result;
  }
  const rows: { pid: number; ppid: number; rssKb: number; command: string }[] = [];
  for (const line of stdout.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (match)
      rows.push({ pid: +match[1]!, ppid: +match[2]!, rssKb: +match[3]!, command: match[4]! });
  }
  const children = new Map<number, number[]>();
  for (const row of rows) children.set(row.ppid, [...(children.get(row.ppid) ?? []), row.pid]);
  const rss = new Map(rows.map((r) => [r.pid, r.rssKb]));

  for (const dir of dirs) {
    const root = rows.find((r) => r.command.includes(`-profile ${dir}`));
    if (!root) continue;
    let totalKb = 0;
    const stack = [root.pid];
    while (stack.length > 0) {
      const pid = stack.pop()!;
      totalKb += rss.get(pid) ?? 0;
      stack.push(...(children.get(pid) ?? []));
    }
    result.set(dir, { pid: root.pid, memoryMb: Math.round(totalKb / 1024) });
  }
  return result;
}
