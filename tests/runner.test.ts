import { describe, expect, it } from "vitest";
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
    const r = await runCode(
      getProblem("two-sum"),
      'def solve(data):\n    return open("/Users/hasanraza/.zshrc").read()',
      "python",
    );
    expect(r.status).toBe("error");
    expect(r.output).toMatch(/PermissionError|Operation not permitted/);
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
