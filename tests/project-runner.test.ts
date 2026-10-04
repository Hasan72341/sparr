import { expect, it } from "vitest";
import { runProjectFiles } from "../src/server/runner";
it("executes Python unittest projects and reports observed results", async () => {
  const r = await runProjectFiles({
    "calculator.py": "def add(a,b): return a+b",
    "test_calculator.py":
      "import unittest\nfrom calculator import add\nclass TestCalc(unittest.TestCase):\n def test_add(self): self.assertEqual(add(2,3),5)\n",
  });
  expect(r.status).toBe("passed");
  expect(r.output).toContain("Ran 1 test");
});
it("executes JavaScript node:test projects", async () => {
  const r = await runProjectFiles({
    "math.test.cjs":
      "const test=require('node:test');const assert=require('node:assert/strict');test('addition',()=>assert.equal(2+3,5));",
  });
  expect(r.status).toBe("passed");
  expect(r.output).toContain("addition");
});
it("does not invent execution when no supported tests exist", async () => {
  expect((await runProjectFiles({ "README.md": "A project." })).status).toBe(
    "unavailable",
  );
});
it("blocks traversal in imported execution paths", async () => {
  await expect(runProjectFiles({ "../escape.py": "pass" })).rejects.toThrow(
    /path/i,
  );
});
