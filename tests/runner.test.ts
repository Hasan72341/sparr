import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { runCode, runnerCapability } from "../src/server/runner";
import { problems, getProblem } from "../src/server/questions";

describe("isolated execution", () => {
  it("runs reviewed reference solutions against every coding case", async () => {
    const capability = await runnerCapability();
    expect(capability.available).toBe(true);
    for (const p of problems.filter((p) => p.kind === "coding"))
      for (const language of ["python", "javascript"] as const) {
        const r = await runCode(p, p.reference![language], language);
        expect(r.status, JSON.stringify(r)).toBe("passed");
        expect(r.passed).toBe(p.tests!.length);
      }
  }, 30000);
  it("reports real failures and protects hidden expected values", async () => {
    const r = await runCode(
      getProblem("two-sum"),
      "def solve(data):\n    return []",
      "python",
    );
    expect(r.status).toBe("failed");
    expect(r.passed).toBe(3);
    expect(
      r.cases
        .filter((c) => c.name.startsWith("Hidden"))
        .every((c) => !c.detail?.includes("expected")),
    ).toBe(true);
  });
  it("blocks access to host home files", async () => {
    const directory = await mkdtemp(join(homedir(), ".sparr-runner-test-"));
    const file = join(directory, "canary.txt");
    const contents = "Synthetic host file that candidate code must not read.";
    try {
      await writeFile(file, contents, { mode: 0o600 });
      expect(await readFile(file, "utf8")).toBe(contents);
      const attempts = {
        python: `def solve(data):\n    return open(${JSON.stringify(file)}).read()`,
        javascript: `function solve(data) { return require("node:fs").readFileSync(${JSON.stringify(file)}, "utf8"); }`,
      };
      for (const language of ["python", "javascript"] as const) {
        const result = await runCode(
          getProblem("two-sum"),
          attempts[language],
          language,
        );
        expect(result.status).toBe("error");
        expect(result.output).toMatch(
          /PermissionError|Operation not permitted|EPERM|EACCES/,
        );
        expect(result.output).not.toContain(contents);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("blocks sockets and enforces timeouts", async () => {
    const net = await runCode(
      getProblem("two-sum"),
      'import socket\ndef solve(data):\n    socket.socket().connect(("127.0.0.1",4318))',
      "python",
    );
    expect(net.status).toBe("error");
    const loop = await runCode(
      getProblem("two-sum"),
      "function solve(data) { while(true){} }",
      "javascript",
    );
    expect(loop.status).toBe("error");
    expect(loop.output).toMatch(/time|limit/i);
  }, 12000);
});
