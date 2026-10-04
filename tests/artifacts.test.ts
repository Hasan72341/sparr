import { describe, expect, it } from "vitest";
import {
  parseResumeText,
  parseRepositoryUrl,
  extractResume,
} from "../src/server/artifacts";
describe("artifact boundaries", () => {
  it("extracts useful resume fields without asserting ownership", () => {
    const p = parseResumeText(
      "Ananya Rao\nananya@example.com\nPython, React and probability\nBuilt a market simulator\nhttps://github.com/ananya/market",
    );
    expect(p.name).toBe("Ananya Rao");
    expect(p.email).toBe("ananya@example.com");
    expect(p.skills).toContain("Python");
    expect(p.resumeText).toContain("market simulator");
  });
  it("accepts only canonical public GitHub clone URLs", () => {
    expect(
      parseRepositoryUrl("https://github.com/openai/openai-python.git"),
    ).toEqual({
      owner: "openai",
      repo: "openai-python",
      url: "https://github.com/openai/openai-python.git",
    });
    for (const url of [
      "file:///etc/passwd",
      "https://localhost/repo",
      "https://github.com.evil.test/a/b",
      "https://user:pass@github.com/a/b",
      "https://github.com/a/b?x=1",
      "https://github.com/a/../b",
    ])
      expect(() => parseRepositoryUrl(url)).toThrow();
  });
  it("rejects binary content disguised as a text resume", async () => {
    await expect(
      extractResume(Buffer.from([0, 1, 2, 3]), "resume.txt"),
    ).rejects.toThrow();
  });
});
