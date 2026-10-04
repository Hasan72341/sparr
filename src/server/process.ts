import { spawn } from "node:child_process";
import { readdir, lstat } from "node:fs/promises";
import { join } from "node:path";
const activeProcesses = new Set<() => void>();
let shuttingDown = false;
export function terminateProcesses() {
  shuttingDown = true;
  for (const kill of activeProcesses) kill();
}
export interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  limited: boolean;
}
async function diskUse(path: string, ceiling: number): Promise<number> {
  let bytes = 0,
    count = 0;
  const pending = [path];
  while (pending.length) {
    const dir = pending.pop()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (++count > 10000) return ceiling + 1;
      const file = join(dir, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else if (!entry.isSymbolicLink()) {
        try {
          bytes += (await lstat(file)).size;
        } catch {}
      }
      if (bytes > ceiling) return bytes;
    }
  }
  return bytes;
}
export function boundedProcess(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    input?: string | Buffer;
    timeout?: number;
    maxOutput?: number;
    env?: NodeJS.ProcessEnv;
    diskLimit?: { path: string; bytes: number };
    memoryLimitMb?: number;
  } = {},
): Promise<ProcessResult> {
  if (shuttingDown) return Promise.reject(new Error("Sparr is shutting down."));
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        LANG: "en_US.UTF-8",
      },
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    });
    let stdout = "",
      stderr = "",
      timedOut = false,
      limited = false,
      bytes = 0,
      checking = false,
      closed = false;
    const kill = () => {
      if (closed) return;
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    activeProcesses.add(kill);
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, options.timeout ?? 15000);
    const monitor =
      options.diskLimit || options.memoryLimitMb
        ? setInterval(async () => {
            if (checking || closed) return;
            checking = true;
            try {
              if (
                options.diskLimit &&
                (await diskUse(
                  options.diskLimit.path,
                  options.diskLimit.bytes,
                )) > options.diskLimit.bytes
              ) {
                limited = true;
                stderr += "\nWorkspace storage limit exceeded.";
                kill();
              }
              if (options.memoryLimitMb && !closed) {
                const usage = await new Promise<number>((resolveUsage) => {
                  const ps = spawn("/bin/ps", ["-axo", "pgid=,rss="], {
                    stdio: ["ignore", "pipe", "ignore"],
                  });
                  let out = "";
                  ps.stdout.on("data", (c) => {
                    out += c;
                  });
                  ps.on("error", () => resolveUsage(0));
                  ps.on("close", () =>
                    resolveUsage(
                      out
                        .trim()
                        .split("\n")
                        .reduce((sum, line) => {
                          const [group, rss] = line
                            .trim()
                            .split(/\s+/)
                            .map(Number);
                          return sum + (group === child.pid ? rss || 0 : 0);
                        }, 0),
                    ),
                  );
                });
                if (!closed && usage > options.memoryLimitMb * 1024) {
                  limited = true;
                  stderr += "\nMemory limit exceeded.";
                  kill();
                }
              }
            } finally {
              checking = false;
            }
          }, 100)
        : undefined;
    const cleanup = () => {
      closed = true;
      activeProcesses.delete(kill);
      clearTimeout(timer);
      if (monitor) clearInterval(monitor);
    };
    const receive = (part: Buffer, isError: boolean) => {
      bytes += part.length;
      if (bytes > (options.maxOutput ?? 65536)) {
        limited = true;
        kill();
        return;
      }
      if (isError) stderr += part.toString();
      else stdout += part.toString();
    };
    child.stdout.on("data", (data) => receive(data, false));
    child.stderr.on("data", (data) => receive(data, true));
    child.on("error", (err) => {
      cleanup();
      reject(err);
    });
    child.on("close", (code) => {
      cleanup();
      resolve({ code, stdout, stderr, timedOut, limited });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(options.input ?? "");
  });
}
