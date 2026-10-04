import { afterEach, beforeEach, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server/app";
import { boundedResponse } from "../src/server/limits";
import { providerReply, validateEndpoint } from "../src/server/providers";
let server: Server;
let base: string;
let receivedBody: Record<string, unknown>;
const context: any = {
  profile: { headline: "", skills: [], resumeText: "" },
  question: { prompt: "A reviewed question" },
  session: { messages: [{ role: "candidate", content: "Candidate answer" }] },
  assessment: { evidence: ["Independent check"], feedback: "Needs review" },
};
beforeEach(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = JSON.parse(body);
      receivedBody = parsed;
      res.setHeader("content-type", "application/json");
      const message = JSON.stringify({
        feedback: "Your assumptions need to be explicit.",
        followup: "Which assumption would you test?",
        observation: "The answer mentions one assumption.",
      });
      res.end(
        JSON.stringify(
          req.url === "/api/chat"
            ? { message: { content: message } }
            : { choices: [{ message: { content: message } }] },
        ),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});
for (const provider of ["ollama", "openai-compatible"] as const)
  it(`${provider} validates a structured assessment through its HTTP contract`, async () => {
    const result = await providerReply(
      { provider, model: "fixture", baseUrl: base },
      context,
    );
    expect(result.followup).toBe("Which assumption would you test?");
  });
it("constrains Ollama output to the required feedback fields", async () => {
  await providerReply(
    { provider: "ollama", model: "fixture", baseUrl: base },
    context,
  );
  expect(receivedBody.format).toEqual({
    type: "object",
    properties: {
      feedback: { type: "string" },
      followup: { type: "string" },
      observation: { type: "string" },
    },
    required: ["feedback", "followup", "observation"],
    additionalProperties: false,
  });
});
it("grounds model feedback in evidence without supplying the canned guided judgment", async () => {
  await providerReply(
    { provider: "ollama", model: "fixture", baseUrl: base },
    context,
  );
  const messages = receivedBody.messages as { content: string }[];
  expect(JSON.parse(messages[1].content).assessment).toEqual({
    evidence: ["Independent check"],
  });
});
it("separates follow-up reasoning from the original numeric reference", async () => {
  await providerReply(
    { provider: "ollama", model: "fixture", baseUrl: base },
    {
      ...context,
      phase: "followup",
    },
  );
  const messages = receivedBody.messages as { content: string }[];
  expect(messages[0].content).toContain("Evaluate ONLY the follow-up response");
  expect(messages[0].content).toContain(
    "original numeric reference does not apply",
  );
  expect(JSON.parse(messages[1].content).assessment).not.toHaveProperty(
    "feedback",
  );
});
it("carries the follow-up phase from the controller without regrading the original answer", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sparr-followup-"));
  const ctx = await createApp({ dataDir: dir, test: true });
  try {
    ctx.store.put("settings", "local", {
      provider: "ollama",
      model: "fixture",
      baseUrl: base,
    });
    const { session } = ctx.engine.start({
      track: "quant-trading",
      difficulty: "foundation",
      durationMinutes: 20,
      mode: "practice",
    });
    const original = await ctx.engine.answer(session.id, {
      answer: "30",
      code: "",
      language: "python",
      requestId: "original",
    });
    expect(
      (receivedBody.messages as { content: string }[])[0].content,
    ).not.toContain("Evaluate ONLY");
    const result = await ctx.engine.followup(session.id, {
      answer: "28 after deducting the two-unit fee.",
      requestId: "followup",
    });
    const messages = receivedBody.messages as { content: string }[];
    expect(messages[0].content).toContain(
      "Evaluate ONLY the follow-up response",
    );
    expect(messages[1].content).toContain("28 after deducting");
    expect(result.providerNotice).toBeUndefined();
    expect(result.session.assessments).toHaveLength(1);
    expect(result.session.assessments[0].verdict).toBe(
      original.session.assessments[0].verdict,
    );
    expect(result.session.assessments[0].evidence.join(" ")).toContain(
      "numeric answer matches",
    );
  } finally {
    ctx.close();
    await rm(dir, { recursive: true, force: true });
  }
});
it("does not tell a candidate to connect a model after receiving model feedback", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sparr-discussion-"));
  const ctx = await createApp({ dataDir: dir, test: true });
  try {
    ctx.store.put("settings", "local", {
      provider: "ollama",
      model: "fixture",
      baseUrl: base,
    });
    const { session } = ctx.engine.start({
      track: "finance",
      stage: "behavioral",
      difficulty: "foundation",
      durationMinutes: 20,
      mode: "practice",
    });
    const result = await ctx.engine.answer(session.id, {
      answer:
        "I clarified the assumptions with the team before changing the forecast.",
      code: "",
      language: "python",
      requestId: "discussion",
    });
    const feedback = result.session.assessments[0].feedback;
    expect(feedback).toContain(
      "AI feedback: Your assumptions need to be explicit.",
    );
    expect(feedback).not.toContain("connect a model");
    expect(feedback).not.toContain("Guided practice");
    expect(result.session.assessments[0].verdict).toBe("needs-review");
  } finally {
    ctx.close();
    await rm(dir, { recursive: true, force: true });
  }
});
it("bounds streaming responses before allocating the entire body", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(100));
      },
      cancel() {
        cancelled = true;
      },
    }),
  );
  await expect(boundedResponse(response, 150)).rejects.toThrow(/size limit/);
  expect(cancelled).toBe(true);
});
it("does not permit tool-enabled Codex fallback", async () => {
  await expect(
    providerReply({ provider: "codex", model: "", baseUrl: "" }, context),
  ).rejects.toThrow(/disabled/);
});
it("requires remote encryption and prevents embedded URL credentials", () => {
  expect(() => validateEndpoint("http://example.com/v1")).toThrow();
  expect(() => validateEndpoint("https://user:pass@example.com/v1")).toThrow();
  expect(validateEndpoint(base)).toBe(base);
});
