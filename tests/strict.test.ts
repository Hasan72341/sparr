import * as providers from "../src/server/providers";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createApp } from "../src/server/app";

// Native capture is an OS boundary. Tests supply observations through the same
// factory callbacks; HTTP clients never get an endpoint to supply these values.
let dir: string,
  ctx: Awaited<ReturnType<typeof createApp>>,
  sample: (s: any) => void;
let now: number, exited: number, stopped: number;
let armChange: object = {};
const options = {
  track: "finance",
  difficulty: "intermediate",
  durationMinutes: 20,
  mode: "practice",
  stage: "technical",
};
const healthy = (sequence = 1) => ({
  version: 1,
  sequence,
  armedPid: sequence > 1 ? 222 : null,
  displays: 1,
  mirrored: false,
  cameras: 1,
  physicalCamera: true,
  virtualMachine: false,
  prohibitedApplications: [],
  cameraPermission: "authorized",
  microphonePermission: "authorized",
  captureRunning: true,
  videoAgeMs: 50,
  audioAgeMs: 50,
  faceCount: 1,
  seb: {
    pid: 222,
    startedAt: 1,
    validSignature: true,
    frontmost: true,
    version: "3.7",
  },
});
const headers = { "X-Sparr-Client": "web", Host: "127.0.0.1:4318" };
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sparr-strict-"));
  now = 10000;
  armChange = {};
  exited = 0;
  stopped = 0;
  ctx = await createApp({
    dataDir: dir,
    test: true,
    strict: {
      now: () => now,
      guardianFactory: (onSample: any) => {
        sample = onSample;
        return {
          arm(pid: number) {
            onSample({ ...healthy(2), armedPid: pid, ...armChange });
          },
          exitSeb() {
            exited++;
          },
          stop() {
            stopped++;
          },
        };
      },
    },
  } as any);
});
afterEach(async () => {
  vi.restoreAllMocks();
  ctx.close();
  await rm(dir, { recursive: true, force: true });
});
const post = (path: string, body = {}) =>
  request(ctx.app)
    .post("/api" + path)
    .set(headers)
    .send(body);
async function prepare() {
  const r = await post("/strict/launches", { options, consent: true });
  expect(r.status).toBe(201);
  return r.body;
}
// Independent encoding used only for generated settings with ASCII strings.
function sorted(value: any): string {
  if (Array.isArray(value)) return "[" + value.map(sorted).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1))
        .map((k) => JSON.stringify(k) + ":" + sorted(value[k]))
        .join(",") +
      "}"
    );
  return typeof value === "string" ? `"${value}"` : JSON.stringify(value);
}
async function proof(launch: any) {
  // Read the actual transmitted config through Python's plist parser in a
  // separate test below; the service exposes neither expected key nor hashes.
  const { strictSebSettings } = await import("../src/server/strict-seb");
  const settings = strictSebSettings({
    startUrl: launch.startUrl,
    quitUrl: launch.quitUrl,
    origin: "http://127.0.0.1:4318",
  });
  const key = createHash("sha256").update(sorted(settings)).digest("hex");
  return {
    pageUrl: launch.startUrl,
    configHash: createHash("sha256")
      .update(launch.startUrl + key)
      .digest("hex"),
  };
}
async function admit() {
  const launch = await prepare();
  sample(healthy());
  const p = await proof(launch);
  const r = await post(`/strict/launches/${launch.id}/admit`, p);
  expect(r.status).toBe(201);
  return {
    launch,
    p,
    view: r.body.view,
    challenge: r.body.challenge,
    cookie: r.headers["set-cookie"][0].split(";")[0],
  };
}

it("requires disclosed consent before starting native capture", async () => {
  const r = await post("/strict/launches", { options, consent: false });
  expect(r.status).toBe(400);
});
it("does not admit a browser without fresh native evidence and the matching SEB config", async () => {
  const launch = await prepare();
  expect(
    (
      await post(`/strict/launches/${launch.id}/admit`, {
        pageUrl: launch.startUrl,
        configHash: "0".repeat(64),
      })
    ).status,
  ).toBe(403);
  sample(healthy());
  expect(
    (
      await post(`/strict/launches/${launch.id}/admit`, {
        pageUrl: launch.startUrl,
        configHash: "0".repeat(64),
      })
    ).status,
  ).toBe(403);
  expect(ctx.store.sessions()).toHaveLength(0);
});
it("binds one strict session and blocks ordinary browser access and admission replay", async () => {
  const a = await admit();
  expect(a.view.session.mode).toBe("strict");
  expect(
    (await post(`/strict/launches/${a.launch.id}/admit`, a.p)).status,
  ).toBe(409);
  expect(
    (await request(ctx.app).get(`/api/sessions/${a.view.session.id}`)).status,
  ).toBe(403);
  expect((await post("/sessions", options)).status).toBe(423);
  expect(ctx.store.sessions()).toHaveLength(1);
});
it("invalidates on a second display before requesting SEB exit, preserving the saved draft", async () => {
  const a = await admit();
  const id = a.view.session.id;
  const s = ctx.store.get<any>("session", id)!;
  s.draft.answer = "A saved derivation";
  ctx.store.put("session", id, s);
  sample({ ...healthy(3), displays: 2 });
  expect(ctx.store.get<any>("session", id)).toMatchObject({
    status: "terminated",
    draft: { answer: "A saved derivation" },
  });
  expect(ctx.store.get<any>("session", id).terminationReason).toMatch(
    /display/i,
  );
  expect(exited).toBe(1);
  expect(
    (
      await post(`/sessions/${id}/answer`, {
        answer: "125",
        code: "",
        language: "python",
        requestId: "after-termination",
      })
    ).status,
  ).toBe(409);
});
it.each([
  ["extra camera", { cameras: 2 }],
  ["virtual camera", { physicalCamera: false }],
  ["VM", { virtualMachine: true }],
  ["unknown VM status", { virtualMachine: null }],
  ["permission revoked", { microphonePermission: "denied" }],
  ["lost capture", { captureRunning: false }],
  ["stale audio", { audioAgeMs: 9000 }],
  ["mirroring", { mirrored: true }],
  ["blocked app", { prohibitedApplications: ["com.obsproject.obs-studio"] }],
  [
    "SEB left foreground",
    {
      seb: { pid: 222, validSignature: true, frontmost: false, version: "3.7" },
    },
  ],
  [
    "unsigned SEB",
    {
      seb: { pid: 222, validSignature: false, frontmost: true, version: "3.7" },
    },
  ],
] as const)("terminates an admitted session on %s", async (_name, change) => {
  const a = await admit();
  sample({ ...healthy(3), ...change });
  expect(ctx.store.get<any>("session", a.view.session.id).status).toBe(
    "terminated",
  );
});
it("expires native evidence and rejects a replayed heartbeat challenge", async () => {
  const a = await admit();
  const beat = () =>
    post(`/strict/launches/${a.launch.id}/heartbeat`, {
      ...a.p,
      challenge: a.challenge,
    }).set("Cookie", a.cookie);
  expect((await beat()).status).toBe(200);
  expect((await beat()).status).toBe(409);
  now += 5000;
  ctx.strict.tick();
  expect(ctx.store.get<any>("session", a.view.session.id).status).toBe(
    "terminated",
  );
});
it("requires ongoing browser liveness even with healthy native samples", async () => {
  const a = await admit();
  now += 9000;
  sample(healthy(3));
  ctx.strict.tick();
  expect(
    ctx.store.get<any>("session", a.view.session.id).terminationReason,
  ).toMatch(/heartbeat/i);
});
it("uses sustained face observations instead of a single missed detection", async () => {
  const a = await admit();
  sample({ ...healthy(3), faceCount: 0 });
  expect(ctx.store.get<any>("session", a.view.session.id).status).toBe(
    "active",
  );
  now += 3000;
  sample({ ...healthy(4), faceCount: 2 });
  now += 3001;
  sample({ ...healthy(5), faceCount: 2 });
  expect(
    ctx.store.get<any>("session", a.view.session.id).terminationReason,
  ).toMatch(/multiple faces/i);
});
it("does not resurrect an invalidated attempt from a stale in-flight session object", async () => {
  const a = await admit();
  const stale = ctx.engine.get(a.view.session.id);
  sample({ ...healthy(3), displays: 2 });
  expect(() => ctx.engine.save(stale)).toThrow();
  ctx.engine.finish(stale);
  expect(ctx.store.get<any>("session", stale.id).status).toBe("terminated");
});
it("invalidates unfinished strict sessions on server restart", async () => {
  const a = await admit();
  ctx.close();
  ctx = await createApp({ dataDir: dir, test: true });
  expect(ctx.store.get<any>("session", a.view.session.id).status).toBe(
    "terminated",
  );
});

it.each([
  [
    "SEB process changes during arming",
    {
      seb: {
        pid: 333,
        startedAt: 1,
        validSignature: true,
        frontmost: true,
        version: "3.7",
      },
    },
  ],
  ["a second face appears during arming", { faceCount: 2 }],
])("rejects admission if %s", async (_name, change) => {
  const launch = await prepare();
  sample(healthy());
  armChange = change;
  const r = await post(
    `/strict/launches/${launch.id}/admit`,
    await proof(launch),
  );
  expect(r.status).toBe(409);
  expect(ctx.store.sessions()).toHaveLength(0);
  expect(exited).toBe(1);
});
it("rejects a non-ASCII replay challenge without an internal server error", async () => {
  const a = await admit();
  const r = await post(`/strict/launches/${a.launch.id}/heartbeat`, {
    ...a.p,
    challenge: "é".repeat(36),
  }).set("Cookie", a.cookie);
  expect(r.status).toBe(409);
});
it("releases an armed guardian if session creation rejects missing project context", async () => {
  const r = await post("/strict/launches", {
    options: { ...options, stage: "project" },
    consent: true,
  });
  expect(r.status).toBe(201);
  sample(healthy());
  const start = await post(
    `/strict/launches/${r.body.id}/admit`,
    await proof(r.body),
  );
  expect(start.status).toBe(400);
  expect(stopped).toBe(1);
  expect(exited).toBe(1);
});
it("keeps the independent SEB exit path on normal completion", async () => {
  const a = await admit();
  ctx.engine.finish(ctx.engine.get(a.view.session.id));
  ctx.strict.tick();
  expect(exited).toBe(1);
  expect(stopped).toBe(1);
});
it("cancels preflight and native monitoring when all workspace data is deleted", async () => {
  const a = await prepare();
  sample(healthy());
  await request(ctx.app).delete("/api/data").set(headers).expect(200);
  expect(stopped).toBe(1);
  expect(
    (await post(`/strict/launches/${a.id}/admit`, await proof(a))).status,
  ).toBe(409);
});

it("keeps the strict attempt blocked and exits SEB if durable invalidation fails", async () => {
  const a = await admit();
  const original = ctx.store.put.bind(ctx.store);
  const failWrite = vi
    .spyOn(ctx.store, "put")
    .mockImplementation((kind, id, value: any) => {
      if (kind === "session" && value.status === "terminated")
        throw new Error("simulated full disk");
      return original(kind, id, value);
    });
  sample({ ...healthy(3), displays: 2 });
  failWrite.mockRestore();
  expect(ctx.store.get<any>("session", a.view.session.id).status).toBe(
    "active",
  );
  expect(() => ctx.engine.get(a.view.session.id)).toThrow(/invalidated/);
  expect(exited).toBe(1);
  expect(stopped).toBe(1);
});
it("preserves submitted work and discards a model result arriving after invalidation", async () => {
  let release!: () => void;
  let reached!: () => void;
  const started = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(providers, "providerReply").mockImplementation(async () => {
    reached();
    await pending;
    return {
      feedback: "Late assessment",
      observation: "Late observation",
      followup: "Late followup",
    };
  });
  ctx.store.put("settings", "local", {
    provider: "claude",
    model: "",
    baseUrl: "http://127.0.0.1:11434",
  });
  const a = await admit();
  const response = post(`/sessions/${a.view.session.id}/answer`, {
    answer: "125; here is my derivation",
    code: "",
    language: "python",
    requestId: "in-flight-model",
  })
    .set("Cookie", a.cookie)
    .set("X-Sparr-SEB-Page", a.p.pageUrl)
    .set("X-Sparr-SEB-Config", a.p.configHash)
    .then((r) => r);
  await started;
  sample({ ...healthy(3), cameras: 2 });
  release();
  expect((await response).status).toBe(409);
  const s = ctx.store.get<any>("session", a.view.session.id);
  expect(s.status).toBe("terminated");
  expect(s.draft.answer).toBe("125; here is my derivation");
  expect(s.assessments).toHaveLength(0);
});
