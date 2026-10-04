import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/server/store";
import { InterviewEngine } from "../src/server/interviews";
let dir: string, store: Store, engine: InterviewEngine;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sparr-adapt-"));
  store = new Store(dir);
  engine = new InterviewEngine(store);
});
afterEach(async () => {
  store.close();
  await rm(dir, { recursive: true, force: true });
});
it("includes a grounded resume discussion without a repository", () => {
  store.put("profile", "local", {
    name: "Ananya",
    email: "",
    headline: "",
    resumeText: "Ananya\nBuilt a market simulator using Python.",
    skills: ["Python"],
    goals: "",
  });
  const v = engine.start({
    track: "finance",
    difficulty: "foundation",
    durationMinutes: 20,
    mode: "practice",
  });
  const resumeId = v.session.questionIds.find((id) => id.startsWith("resume-"));
  expect(resumeId).toBeDefined();
  const s = {
    ...v.session,
    questionIndex: v.session.questionIds.indexOf(resumeId!),
  };
  expect(engine.problem(s).prompt).toContain("Built a market simulator");
});
it("selects a foundational follow-up exercise after incorrect intermediate arithmetic", async () => {
  const v = engine.start({
    track: "quant-research",
    difficulty: "intermediate",
    durationMinutes: 20,
    mode: "practice",
  });
  expect(v.question.id).toBe("bayes-test");
  await engine.answer(v.session.id, {
    answer: "90%",
    code: "",
    language: "python",
    requestId: "wrong-intermediate",
  });
  expect(engine.next(v.session.id).question.id).toBe("conditional-dice");
});
