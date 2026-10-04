import { afterEach, expect, it, vi } from "vitest";
import { sebProof } from "../src/client/seb-client";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("uses the modern SEB key without relying on an updateKeys callback", async () => {
  const updateKeys = vi.fn();
  vi.stubGlobal("window", {
    location: { href: "http://127.0.0.1:4318/strict/id#main" },
    SafeExamBrowser: { security: { configKey: "a".repeat(64), updateKeys } },
    setTimeout,
    clearTimeout,
  });
  expect(await sebProof()).toEqual({
    pageUrl: "http://127.0.0.1:4318/strict/id",
    configHash: "a".repeat(64),
  });
  expect(updateKeys).not.toHaveBeenCalled();
});
it("waits briefly for SEB to populate the current page key", async () => {
  vi.useFakeTimers();
  const security = { configKey: "" };
  vi.stubGlobal("window", {
    location: { href: "http://127.0.0.1/strict/id" },
    SafeExamBrowser: { security },
    setTimeout,
    clearTimeout,
  });
  const result = sebProof();
  security.configKey = "b".repeat(64);
  await vi.advanceTimersByTimeAsync(100);
  expect((await result).configHash).toBe("b".repeat(64));
});
it("fails closed when SEB never supplies a key", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("window", {
    location: { href: "http://127.0.0.1/strict/id" },
    SafeExamBrowser: { security: {} },
    setTimeout,
    clearTimeout,
  });
  const result = expect(sebProof()).rejects.toThrow(/did not provide/);
  await vi.advanceTimersByTimeAsync(2100);
  await result;
});
it("rejects an ordinary browser", async () => {
  vi.stubGlobal("window", { location: { href: "http://127.0.0.1/strict/id" } });
  await expect(sebProof()).rejects.toThrow(/generated SEB configuration/);
});
