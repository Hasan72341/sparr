import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/server/app";
import type { SessionView } from "../src/shared/types";

let dir: string;
let ctx: Awaited<ReturnType<typeof createApp>>;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sparr-test-"));
  ctx = await createApp({ dataDir: dir, test: true });
});
afterEach(async () => {
  ctx?.close();
  await rm(dir, { recursive: true, force: true });
});
const post = (path: string, body = {}) =>
  request(ctx.app)
    .post("/api" + path)
    .set("X-Sparr-Client", "web")
    .send(body);
async function session(track = "quant-research"): Promise<SessionView> {
  const r = await post("/sessions", {
    track,
    difficulty: "foundation",
    durationMinutes: 20,
    mode: "practice",
  });
  expect(r.status).toBe(201);
  return r.body;
}

describe("durable local interview API", () => {
  it("starts without keys and contains all seven tracks", async () => {
    const r = await request(ctx.app).get("/api/bootstrap");
    expect(r.status).toBe(200);
    expect(r.body.tracks).toHaveLength(7);
    expect(r.body.settings.provider).toBe("guided");
    expect(r.body.sessions).toEqual([]);
  });
  it("blocks foreign-origin and missing-client mutations", async () => {
    expect((await request(ctx.app).post("/api/sessions").send({})).status).toBe(
      403,
    );
    expect(
      (
        await request(ctx.app)
          .post("/api/sessions")
          .set("X-Sparr-Client", "web")
          .set("Origin", "https://attacker.example")
          .send({})
      ).status,
    ).toBe(403);
  });
  it("validates profile fields and preserves saved profile across restarts", async () => {
    const profile = {
      name: "Ananya",
      email: "",
      headline: "Quant researcher",
      resumeText: "I built a backtest.",
      skills: ["Python"],
      goals: "Quant placements",
    };
    expect(
      (
        await request(ctx.app)
          .put("/api/profile")
          .set("X-Sparr-Client", "web")
          .send(profile)
      ).status,
    ).toBe(200);
    ctx.close();
    ctx = await createApp({ dataDir: dir, test: true });
    expect(
      (await request(ctx.app).get("/api/bootstrap")).body.profile.name,
    ).toBe("Ananya");
    expect(
      (
        await request(ctx.app)
          .put("/api/profile")
          .set("X-Sparr-Client", "web")
          .send({ ...profile, name: "x".repeat(300) })
      ).status,
    ).toBe(400);
  });
  it("checks arithmetic separately from reasoning and deduplicates retries", async () => {
    const v = await session();
    expect(v.question.id).toBe("conditional-dice");
    const body = {
      answer: "1/6. Given an even roll, the outcomes are 2, 4, and 6.",
      code: "",
      language: "python",
      requestId: "answer-00000001",
    };
    const first = await post(`/sessions/${v.session.id}/answer`, body);
    expect(first.status).toBe(200);
    expect(first.body.session.assessments[0].verdict).toBe("developing");
    const again = await post(`/sessions/${v.session.id}/answer`, body);
    expect(again.body.session.messages.length).toBe(
      first.body.session.messages.length,
    );
    const correct = await post(`/sessions/${v.session.id}/answer`, {
      ...body,
      answer:
        "1/3. The conditional sample space is {2, 4, 6}, with one favorable outcome.",
      requestId: "answer-00000002",
    });
    expect(correct.body.session.assessments[0].evidence.join(" ")).toContain(
      "matches",
    );
    expect(correct.body.session.assessments[0].feedback).toContain("reasoning");
  });
  it("saves drafts, accounts for hints, and refuses writes after finishing", async () => {
    const v = await session();
    const draft = { answer: "My working", code: "", language: "python" };
    expect(
      (
        await request(ctx.app)
          .put(`/api/sessions/${v.session.id}/draft`)
          .set("X-Sparr-Client", "web")
          .send(draft)
      ).status,
    ).toBe(200);
    expect(
      (await request(ctx.app).get(`/api/sessions/${v.session.id}`)).body.session
        .draft.answer,
    ).toBe("My working");
    expect(
      (await post(`/sessions/${v.session.id}/hint`)).body.session.hintsUsed,
    ).toBe(1);
    const finish = await post(`/sessions/${v.session.id}/finish`);
    expect(finish.body.session.status).toBe("completed");
    expect(finish.body.session.report.limitations.length).toBeGreaterThan(0);
    expect(
      (
        await post(`/sessions/${v.session.id}/answer`, {
          ...draft,
          requestId: "answer-00000003",
        })
      ).status,
    ).toBe(409);
  });
  it("does not advertise unvalidated strict mode", async () => {
    const result = await post("/sessions", {
      track: "swe",
      difficulty: "foundation",
      durationMinutes: 20,
      mode: "strict",
    });
    expect(result.status).toBe(409);
    expect(result.body.error).toMatch(/strict|SEB/i);
  });
  it("requires a response before moving on, then serves another question", async () => {
    const v = await session();
    expect((await post(`/sessions/${v.session.id}/next`)).status).toBe(409);
    await post(`/sessions/${v.session.id}/answer`, {
      answer: "1/3",
      code: "",
      language: "python",
      requestId: "answer-00000004",
    });
    const next = await post(`/sessions/${v.session.id}/next`);
    expect(next.status).toBe(200);
    expect(next.body.question.id).not.toBe(v.question.id);
  });
  it("exports candidate data and deletes it", async () => {
    await session();
    const data = await request(ctx.app).get("/api/export");
    expect(data.body.sessions).toHaveLength(1);
    expect(data.body).not.toHaveProperty("settings");
    expect(
      (await request(ctx.app).delete("/api/data").set("X-Sparr-Client", "web"))
        .status,
    ).toBe(200);
    expect(
      (await request(ctx.app).get("/api/bootstrap")).body.sessions,
    ).toHaveLength(0);
  });
});
