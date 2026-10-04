import { expect, it } from "vitest";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { createServer, request as httpRequest } from "node:http";
import { importArtifact } from "../src/server/artifacts";
import { createApp } from "../src/server/app";
it("a behavioral round uses attached evidence and completes without switching to technical exercises", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sparr-behavioral-"));
  const ctx = await createApp({ dataDir: dir, test: true });
  try {
    const artifact = await importArtifact(
      Buffer.from("Year,Revenue\n2026,100\n"),
      "model.csv",
    );
    ctx.store.put("artifact", artifact.id, artifact);
    let view = ctx.engine.start({
      track: "finance",
      difficulty: "foundation",
      durationMinutes: 20,
      mode: "practice",
      stage: "behavioral",
      company: "Example Bank",
      artifactId: artifact.id,
    });
    expect(view.question.prompt).toContain("Revenue");
    for (let i = 0; i < 3; i++) {
      expect(view.question.tags).toContain("Behavioral");
      await ctx.engine.answer(view.session.id, {
        answer:
          "I collected the evidence, considered alternatives, discussed the risks, and documented the outcome.",
        code: "",
        language: "python",
        requestId: `behavioral-${i}`,
      });
      view = ctx.engine.next(view.session.id);
    }
    expect(view.session.status).toBe("completed");
    expect(view.session.report?.assessments).toHaveLength(3);
    expect(
      view.session.report?.assessments.every(
        (a) => a.verdict === "needs-review",
      ),
    ).toBe(true);
  } finally {
    ctx.close();
    await rm(dir, { recursive: true, force: true });
  }
});
it.each(["multipart", "json"])(
  "a pending %s upload cannot restore data after delete-all",
  async (mode) => {
    const dir = await mkdtemp(join(tmpdir(), "sparr-delete-race-"));
    const ctx = await createApp({ dataDir: dir, test: true });
    const server = createServer(ctx.app);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;
    let arrived!: () => void;
    const bodyStarted = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    server.on("request", (req) => {
      if (req.method !== "DELETE") req.once("data", arrived);
    });
    const body =
      mode === "multipart"
        ? '--sparr-boundary\r\nContent-Disposition: form-data; name="file"; filename="race.csv"\r\nContent-Type: text/csv\r\n\r\nYear,Revenue\n2026,100\n\r\n--sparr-boundary--\r\n'
        : JSON.stringify({
            name: "Deleted profile",
            email: "",
            headline: "",
            resumeText: "",
            skills: [],
            goals: "",
          });
    let finish!: () => void;
    const result = new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        base + (mode === "multipart" ? "/api/artifacts" : "/api/profile"),
        {
          method: mode === "multipart" ? "POST" : "PUT",
          headers: {
            "X-Sparr-Client": "web",
            "Content-Type":
              mode === "multipart"
                ? "multipart/form-data; boundary=sparr-boundary"
                : "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode!));
        },
      );
      req.on("error", reject);
      req.write(body.slice(0, -8));
      let ended = false;
      finish = () => {
        if (!ended) {
          ended = true;
          req.end(body.slice(-8));
        }
      };
    });
    try {
      await bodyStarted;
      expect(
        (await request(base).delete("/api/data").set("X-Sparr-Client", "web"))
          .status,
      ).toBe(200);
      finish();
      expect(await result).toBe(409);
      expect(ctx.store.list("artifact")).toHaveLength(0);
      expect(ctx.store.profile().name).toBe("");
    } finally {
      finish();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      ctx.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
it("reads an XLSX formula and cached value without recalculating it", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Forecast");
  sheet.getCell("A1").value = "Revenue";
  sheet.getCell("B1").value = { formula: "SUM(10,20)", result: 999 };
  const artifact = await importArtifact(
    Buffer.from(await workbook.xlsx.writeBuffer()),
    "valuation.xlsx",
  );
  expect(artifact.evidence[0].path).toContain("Forecast");
  expect(artifact.evidence[0].excerpt).toContain("SUM(10,20)");
  expect(artifact.evidence[0].excerpt).toContain("cached result: 999");
  expect(artifact.notes.join(" ")).toContain("not recalculated");
});
it("extracts research PDF text through the isolated parser", async () => {
  const artifact = await importArtifact(
    await readFile("tests/fixtures/resume.pdf"),
    "research.pdf",
  );
  expect(artifact.kind).toBe("research");
  expect(artifact.evidence[0].excerpt.length).toBeGreaterThan(30);
});
it("rejects a document whose declared ZIP expansion exceeds the parser budget", async () => {
  const malicious = Buffer.alloc(46);
  malicious.writeUInt32LE(0x02014b50, 0);
  malicious.writeUInt32LE(21000000, 24);
  await expect(importArtifact(malicious, "bomb.xlsx")).rejects.toThrow(
    "parsing limit",
  );
});
it("inspects a financial CSV without interpreting formula strings", async () => {
  const a = await importArtifact(
    Buffer.from("Year,Revenue,Margin\n2025,100,0.2\n2026,120,0.25\n"),
    "forecast.csv",
  );
  expect(a.kind).toBe("financial-model");
  expect(a.evidence[0].excerpt).toContain("Revenue");
  expect(a.notes.join(" ")).toContain("not recalculated");
});
it("extracts notebook source without executing cells or trusting stored outputs", async () => {
  const file = JSON.stringify({
    cells: [
      {
        cell_type: "code",
        source: ['print("never execute this")'],
        outputs: [{ text: ["unverified output"] }],
      },
    ],
  });
  const a = await importArtifact(Buffer.from(file), "research.ipynb");
  expect(a.kind).toBe("notebook");
  expect(a.evidence[0].excerpt).toContain("never execute this");
  expect(a.evidence[0].excerpt).not.toContain("unverified output");
});
it("attaches a model to a project interview and retains targeting", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sparr-document-test-"));
  const ctx = await createApp({ dataDir: dir, test: true });
  try {
    const artifact = await request(ctx.app)
      .post("/api/artifacts")
      .set("X-Sparr-Client", "web")
      .attach("file", Buffer.from("Year,Revenue\n2026,100\n"), "forecast.csv");
    expect(artifact.status).toBe(201);
    const r = await request(ctx.app)
      .post("/api/sessions")
      .set("X-Sparr-Client", "web")
      .send({
        track: "finance",
        difficulty: "foundation",
        durationMinutes: 20,
        mode: "practice",
        stage: "project",
        artifactId: artifact.body.id,
        company: "Example Bank",
        jobDescription: "Assess accounting and valuation.",
      });
    expect(r.status).toBe(201);
    expect(r.body.question.prompt).toContain("Revenue");
    expect(r.body.session.company).toBe("Example Bank");
    expect(r.body.session.stage).toBe("project");
    expect(
      (
        await request(ctx.app)
          .delete(`/api/artifacts/${artifact.body.id}`)
          .set("X-Sparr-Client", "web")
      ).status,
    ).toBe(409);
  } finally {
    ctx.close();
    await rm(dir, { recursive: true, force: true });
  }
});
it("OA mode rejects hints and project defense requires evidence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sparr-stage-test-"));
  const ctx = await createApp({ dataDir: dir, test: true });
  try {
    const s = await request(ctx.app)
      .post("/api/sessions")
      .set("X-Sparr-Client", "web")
      .send({
        track: "finance",
        difficulty: "foundation",
        durationMinutes: 20,
        mode: "practice",
        stage: "oa",
      });
    expect(s.status).toBe(201);
    expect(
      (
        await request(ctx.app)
          .post(`/api/sessions/${s.body.session.id}/hint`)
          .set("X-Sparr-Client", "web")
      ).status,
    ).toBe(409);
    const bad = await request(ctx.app)
      .post("/api/sessions")
      .set("X-Sparr-Client", "web")
      .send({
        track: "finance",
        difficulty: "foundation",
        durationMinutes: 20,
        mode: "practice",
        stage: "project",
      });
    expect(bad.status).toBe(400);
  } finally {
    ctx.close();
    await rm(dir, { recursive: true, force: true });
  }
});
