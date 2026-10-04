import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { extractResume } from "../src/server/artifacts";
for (const extension of ["pdf", "docx"])
  it(`parses a real ${extension} resume in an isolated worker`, async () => {
    const profile = await extractResume(
      await readFile(`tests/fixtures/resume.${extension}`),
      `resume.${extension}`,
    );
    expect(profile.name).toBe("Ananya Rao");
    expect(profile.email).toBe("ananya@example.com");
    expect(profile.skills).toContain("Python");
  });
it("parses plain text and reports no text PDFs honestly", async () => {
  const p = await extractResume(
    Buffer.from("Ananya Rao\nPython developer\nBuilt projects."),
    "resume.txt",
  );
  expect(p.name).toBe("Ananya Rao");
  await expect(
    extractResume(Buffer.from("%PDF- corrupted"), "bad.pdf"),
  ).rejects.toThrow();
});
