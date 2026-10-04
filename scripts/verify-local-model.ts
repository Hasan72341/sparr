// Opt-in integration check using a real, already-downloaded Ollama model.
// Uses a disposable database; never changes the user's workspace or settings.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/server/app.js";
import type { SessionView } from "../src/shared/types.js";

const model = process.env.SPARR_LOCAL_MODEL || "qwen2.5:7b";
const endpoint = new URL(
  process.env.SPARR_OLLAMA_URL || "http://127.0.0.1:11434",
);
assert(
  endpoint.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname) &&
    !endpoint.username &&
    !endpoint.password &&
    endpoint.pathname === "/" &&
    !endpoint.search &&
    !endpoint.hash,
  "This check requires an Ollama server at an HTTP loopback origin.",
);
const baseUrl = endpoint.origin;
const tags = await fetch(`${baseUrl}/api/tags`, {
  signal: AbortSignal.timeout(5000),
});
assert(tags.ok, "Cannot read the local model inventory.");
const inventory = (await tags.json()) as {
  models: { name: string; digest: string; size: number }[];
};
const installed = inventory.models.find((item) => item.name === model);
assert(installed, `Download ${model} in Ollama before running this check.`);
const versionResponse = await fetch(`${baseUrl}/api/version`, {
  signal: AbortSignal.timeout(5000),
});
assert(versionResponse.ok, "Cannot read the Ollama version.");
const version = await versionResponse.json();
const directory = await mkdtemp(join(tmpdir(), "sparr-local-model-"));
const ctx = await createApp({ dataDir: directory });
const server = ctx.app.listen(0, "127.0.0.1");

try {
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const apiBase = `http://127.0.0.1:${address.port}/api`;
  async function request<T>(path: string, method = "GET", body?: unknown) {
    const response = await fetch(apiBase + path, {
      method,
      headers: { "Content-Type": "application/json", "X-Sparr-Client": "web" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(90000),
    });
    const result = await response.json();
    assert(response.ok, `${method} ${path}: ${JSON.stringify(result)}`);
    return result as T;
  }
  await request("/settings", "PUT", { provider: "ollama", model, baseUrl });
  const probe = await request<{ ok: boolean; message: string }>(
    "/settings/test",
    "POST",
    {},
  );
  assert(probe.ok, probe.message);

  const cases = [
    {
      track: "quant-research",
      company: "Quant practice",
      answer:
        "1/3. Given an even roll, the equally likely outcomes are 2, 4, and 6. Exactly one of those three outcomes is 6.",
      code: "",
    },
    {
      track: "swe",
      company: "Joveo",
      answer:
        "The hash map stores only earlier values and indices. I check the complement before inserting the current value, so I cannot reuse an element. Expected O(n) time and O(n) space.",
      code: 'def solve(data):\n    seen = {}\n    for i, x in enumerate(data["nums"]):\n        if data["target"] - x in seen:\n            return [seen[data["target"] - x], i]\n        seen[x] = i\n    return []',
    },
  ];
  const results = [];
  for (const example of cases) {
    const started = await request<SessionView>("/sessions", "POST", {
      track: example.track,
      company: example.company,
      difficulty: "foundation",
      stage: "technical",
      durationMinutes: 10,
      mode: "practice",
    });
    const id = started.session.id;
    const before = performance.now();
    const reviewed = await request<SessionView>(
      `/sessions/${id}/answer`,
      "POST",
      {
        answer: example.answer,
        code: example.code,
        language: "python",
        requestId: randomUUID(),
      },
    );
    const elapsedMs = Math.round(performance.now() - before);
    assert(!reviewed.providerNotice, reviewed.providerNotice);
    const assessment = reviewed.session.assessments[0];
    assert(assessment, "No assessment was saved.");
    assert.equal(
      assessment.verdict,
      example.code ? "demonstrated" : "needs-review",
    );
    if (!example.code) {
      assert(
        assessment.evidence.includes(
          "The numeric answer matches the reference solution within tolerance.",
        ),
      );
    }
    assert.match(assessment.feedback, /AI feedback: .+/s);
    assert(
      assessment.evidence.some((entry) =>
        entry.startsWith("AI interpretation:"),
      ),
    );
    assert(
      !assessment.evidence.some((entry) =>
        entry.includes("guided feedback was used"),
      ),
    );
    if (example.code) {
      assert.equal(assessment.run?.status, "passed");
      assert.equal(assessment.run.passed, 6);
      assert.equal(assessment.run.total, 6);
    }
    const lastMessage = reviewed.session.messages.at(-1);
    assert(lastMessage?.role === "interviewer");
    const followup = lastMessage.content
      .slice(assessment.feedback.length)
      .trim();
    assert(followup.length > 0, "No model follow-up returned.");
    const finished = await request<SessionView>(
      `/sessions/${id}/finish`,
      "POST",
      {},
    );
    const restored = await request<SessionView>(`/sessions/${id}`);
    assert.equal(finished.session.status, "completed");
    assert(finished.session.report, "No completed report was returned.");
    assert.equal(finished.session.report.assessments.length, 1);
    assert.deepEqual(restored.session.report, finished.session.report);
    results.push({
      track: example.track,
      question: started.question.title,
      answer: example.answer,
      code: example.code,
      elapsedMs,
      assessment,
      followup,
      reportPersisted: true,
    });
    console.log(
      `PASS ${started.question.title}: real model feedback, follow-up, report (${elapsedMs} ms)`,
    );
  }
  const report = {
    checkedAt: new Date().toISOString(),
    model,
    endpoint: baseUrl,
    runtime: version,
    digest: installed.digest,
    bytes: installed.size,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    results,
    limits:
      "Integration evidence from two synthetic answers; not a model-quality benchmark or network audit.",
  };
  const output = resolve(
    process.env.SPARR_VERIFY_REPORT || ".data/local-ai/verification.json",
  );
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`Evidence: ${output}`);
} finally {
  await new Promise<void>((done) => server.close(() => done()));
  ctx.close();
  await rm(directory, { recursive: true, force: true });
}
