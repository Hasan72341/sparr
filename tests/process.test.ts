import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { boundedProcess, terminateProcesses } from "../src/server/process";

it("shutdown terminates a live detached worker and prevents further launches", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sparr-shutdown-"));
  const marker = join(dir, "pid");
  const job = boundedProcess(
    process.execPath,
    [
      "-e",
      'require("node:fs").writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)',
      marker,
    ],
    { timeout: 10000 },
  );
  try {
    let pid = 0;
    for (let i = 0; i < 100; i++) {
      try {
        pid = Number(await readFile(marker, "utf8"));
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    expect(pid).toBeGreaterThan(0);
    process.kill(pid, 0);
    terminateProcesses();
    const result = await job;
    expect(result.timedOut).toBe(false);
    expect(() => process.kill(pid, 0)).toThrow();
    await expect(boundedProcess(process.execPath, ["-e", ""])).rejects.toThrow(
      "shutting down",
    );
  } finally {
    terminateProcesses();
    await job;
    await rm(dir, { recursive: true, force: true });
  }
});
