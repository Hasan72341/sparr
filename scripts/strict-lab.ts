// Isolated integration laboratory. Synthetic native observations and a VM-safe
// SEB configuration exercise the controller/UI; they do NOT validate hardware.
// The production entry point never imports this file or exposes these routes.
import express from "express";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApp } from "../src/server/app.ts";
import {
  strictSebSettings,
  sebConfigKey,
  sebPageHash,
} from "../src/server/strict-seb.ts";
import type { GuardianSnapshot, Session } from "../src/shared/types.ts";

const port = Number(process.env.SPARR_STRICT_LAB_PORT ?? 4353);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("Invalid lab port");
const origin = `http://127.0.0.1:${port}`;
const dir = resolve(".data/strict-lab");
await mkdir(dir, { recursive: true, mode: 0o700 });
let sequence = 0,
  armed = false,
  stopped = false;
let emit: ((snapshot: GuardianSnapshot) => void) | undefined;
let overrides: Partial<GuardianSnapshot> = {};
let expectedProof: { pageUrl: string; configHash: string };
const events: { event: string; at: string }[] = [];
const event = (event: string) =>
  events.push({ event, at: new Date().toISOString() });
function sample() {
  if (stopped) return;
  emit?.({
    version: 1,
    sequence: ++sequence,
    armedPid: armed ? 222 : null,
    displays: 1,
    mirrored: false,
    cameras: 1,
    physicalCamera: true,
    virtualMachine: false,
    prohibitedApplications: [],
    cameraPermission: "authorized",
    microphonePermission: "authorized",
    captureRunning: true,
    videoAgeMs: 10,
    audioAgeMs: 10,
    faceCount: 1,
    seb: {
      pid: 222,
      startedAt: 1,
      validSignature: true,
      frontmost: true,
      version: "3.7",
    },
    ...overrides,
  });
}
const ctx = await createApp({
  dataDir: resolve(dir, `run-${Date.now()}`),
  strict: {
    guardianFactory: (onSample) => {
      emit = onSample;
      stopped = false;
      armed = false;
      overrides = {};
      sample();
      return {
        arm() {
          armed = true;
          event("synthetic-guardian-armed");
          sample();
        },
        exitSeb() {
          event("native-exit-requested-simulated");
        },
        stop() {
          stopped = true;
          event("synthetic-guardian-stopped");
        },
      };
    },
    settingsFactory(input) {
      const settings = {
        ...strictSebSettings(input),
        allowVirtualMachine: true,
        allowScreenSharing: true,
        screenSharingMacEnforceBlocked: false,
        allowScreenCapture: true,
        allowWindowCapture: true,
        blockScreenShotsLegacy: false,
        allowSwitchToApplications: true,
        allowedDisplayBuiltinEnforce: false,
        detectAccessibilityApps: false,
        detectStoppedProcess: false,
        enableAppSwitcherCheck: false,
      };
      expectedProof = {
        pageUrl: input.startUrl,
        configHash: sebPageHash(input.startUrl, sebConfigKey(settings)),
      };
      return settings;
    },
  },
});
const timer = setInterval(sample, 500);
ctx.app.use("/__strict_lab", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (
    req.method === "POST" &&
    (req.headers["x-sparr-client"] !== "web" ||
      (req.headers.origin && req.headers.origin !== origin))
  )
    return res.status(403).end();
  next();
});
function prepare() {
  return ctx.strict.prepare(
    {
      mode: "practice",
      track: "finance",
      difficulty: "foundation",
      stage: "technical",
      durationMinutes: 10,
    },
    origin,
  );
}
let launch = prepare();
async function saveConfig() {
  await writeFile(
    resolve(dir, "sparr-strict-lab.seb"),
    ctx.strict.config(launch.id),
    { mode: 0o600 },
  );
}
await saveConfig();
ctx.app.get("/__strict_lab/status", (_req, res) =>
  res.json({
    notice: "SYNTHETIC NATIVE EVIDENCE: not a verified hardware interview",
    launch,
    proof: expectedProof,
    status: ctx.strict.status(launch.id),
    events,
    sessions: ctx.store.sessions(),
  }),
);
ctx.app.post("/__strict_lab/prepare", async (_req, res) => {
  ctx.strict.cancel(launch.id);
  events.length = 0;
  launch = prepare();
  await saveConfig();
  res.json(launch);
});
ctx.app.post("/__strict_lab/violation", (req, res) => {
  const fixtures: Record<string, Partial<GuardianSnapshot>> = {
    display: { displays: 2 },
    camera: { cameras: 2 },
    face: { faceCount: 2 },
    vm: { virtualMachine: true },
    capture: { captureRunning: false },
  };
  if (!fixtures[req.body?.kind])
    return res.status(400).json({ error: "Unknown fixture" });
  overrides = fixtures[req.body.kind];
  sample();
  res.json({ injected: req.body.kind });
});
ctx.app.use(express.static(resolve("dist/client")));
ctx.app.get("/{*path}", (_req, res) =>
  res.sendFile(resolve("dist/client/index.html")),
);
const server = ctx.app.listen(port, "127.0.0.1", () =>
  console.log(
    JSON.stringify(
      {
        warning: "LAB ONLY: synthetic native observations; VM permitted",
        origin,
        launch,
        config: resolve(dir, "sparr-strict-lab.seb"),
      },
      null,
      2,
    ),
  ),
);
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  ctx.strict.close();
  await writeFile(
    resolve(dir, "latest-results.json"),
    JSON.stringify(
      { events, sessions: ctx.store.sessions() as Session[] },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  server.close(() => {
    ctx.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
