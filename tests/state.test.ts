import { beforeEach, afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import request from "supertest";
import { createApp } from "../src/server/app";
import { parseNumericAnswer } from "../src/server/interviews";
let dir: string;
let ctx: Awaited<ReturnType<typeof createApp>>;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sparr-state-"));
  ctx = await createApp({ dataDir: dir, test: true });
});
afterEach(async () => {
  ctx.close();
  await rm(dir, { recursive: true, force: true });
});
it("interprets fractions percentages negatives and refuses division by zero", () => {
  expect(parseNumericAnswer("1/3, because...")).toBeCloseTo(1 / 3);
  expect(parseNumericAnswer("4%")).toBe(0.04);
  expect(parseNumericAnswer("-20")).toBe(-20);
  expect(parseNumericAnswer("1/0")).toBeUndefined();
});
it("finishes expired sessions on the server", async () => {
  const s = ctx.engine.start({
    track: "finance",
    difficulty: "foundation",
    durationMinutes: 5,
    mode: "practice",
  }).session;
  s.createdAt = new Date(Date.now() - 400000).toISOString();
  ctx.engine.save(s);
  const r = await request(ctx.app)
    .post(`/api/sessions/${s.id}/hint`)
    .set("X-Sparr-Client", "web");
  expect(r.status).toBe(409);
  expect(ctx.engine.get(s.id).status).toBe("completed");
});
it("blocks data deletion while an assessment is in flight", async () => {
  let release: () => void = () => {};
  const pending = ctx.engine.lock(
    "assessment",
    () =>
      new Promise<void>((r) => {
        release = r;
      }),
  );
  const r = await request(ctx.app)
    .delete("/api/data")
    .set("X-Sparr-Client", "web");
  release();
  await pending;
  expect(r.status).toBe(409);
});
it("rejects a rebinding hostname even for read requests", async () => {
  const r = await request(ctx.app)
    .get("/api/bootstrap")
    .set("Host", "attacker.example");
  expect(r.status).toBe(403);
});
it("rejects invalid repository URLs before any import", async () => {
  const r = await request(ctx.app)
    .post("/api/repositories")
    .set("X-Sparr-Client", "web")
    .send({ url: "file:///etc" });
  expect(r.status).toBe(400);
  expect(r.body.error).toMatch(/GitHub/);
});
it("keeps follow-up answers separate from the original numeric reference", async () => {
  const s = ctx.engine.start({
    track: "quant-trading",
    difficulty: "foundation",
    durationMinutes: 20,
    mode: "practice",
  }).session;
  await ctx.engine.answer(s.id, {
    answer: "30",
    code: "",
    language: "python",
    requestId: "original-answer",
  });
  const follow = await ctx.engine.followup(s.id, {
    answer: "28 after deducting the two-unit fee.",
    requestId: "followup-answer",
  });
  expect(follow.session.assessments[0].evidence.join(" ")).toContain("matches");
  expect(follow.session.messages.at(-1)?.content).toContain(
    "does not grade this new scenario",
  );
});
it("returns a completed view when a committed answer is retried after finishing", async () => {
  const s = ctx.engine.start({
    track: "finance",
    difficulty: "foundation",
    durationMinutes: 20,
    mode: "practice",
  }).session;
  const answer = {
    answer: "25",
    code: "",
    language: "python" as const,
    requestId: "idempotent-answer",
  };
  await ctx.engine.answer(s.id, answer);
  ctx.engine.finish(ctx.engine.get(s.id));
  expect((await ctx.engine.answer(s.id, answer)).session.status).toBe(
    "completed",
  );
});
it("does not finalize a stale snapshot while a submission is in flight", async () => {
  const s = ctx.engine.start({
    track: "finance",
    difficulty: "foundation",
    durationMinutes: 5,
    mode: "practice",
  }).session;
  await ctx.engine.lock(s.id, async () => {
    s.createdAt = new Date(Date.now() - 400000).toISOString();
    ctx.engine.save(s);
    expect(ctx.engine.get(s.id).status).toBe("active");
  });
  expect(ctx.engine.get(s.id).status).toBe("completed");
});
it("does not send profile data when testing a model connection", async () => {
  const { createServer } = await import("node:http");
  let sent = "";
  const remote = createServer((req, res) => {
    req.on("data", (c) => (sent += c));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              feedback: "Ready",
              followup: "Explain a tradeoff.",
              observation: "Connection check only.",
            }),
          },
        }),
      );
    });
  });
  await new Promise<void>((r) => remote.listen(0, "127.0.0.1", r));
  try {
    ctx.store.put("profile", "local", {
      name: "Private Candidate",
      email: "private@example.com",
      headline: "CONFIDENTIAL_HEADLINE",
      skills: ["PRIVATE_SKILL"],
      resumeText: "CONFIDENTIAL_RESUME",
      goals: "",
    });
    ctx.store.put("settings", "local", {
      provider: "ollama",
      model: "test",
      baseUrl: `http://127.0.0.1:${(remote.address() as { port: number }).port}`,
    });
    const response = await request(ctx.app)
      .post("/api/settings/test")
      .set("X-Sparr-Client", "web")
      .send({});
    expect(response.body.ok).toBe(true);
    expect(sent).not.toContain("CONFIDENTIAL");
    expect(sent).not.toContain("PRIVATE_SKILL");
  } finally {
    await new Promise<void>((r) => remote.close(() => r()));
  }
});
