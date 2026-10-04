import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { GuardianSnapshot } from "../shared/types.js";

export interface GuardianHandle {
  arm(pid: number, startedAt: number): void;
  exitSeb(): void;
  stop(): void;
}
export type GuardianFactory = (
  sample: (snapshot: GuardianSnapshot) => void,
  failure: (reason: string) => void,
) => GuardianHandle;
export const guardianPath = resolve(
  "native/macos/.build/Sparr Guardian.app/Contents/MacOS/sparr-guardian",
);
export function guardianAvailable() {
  return process.platform === "darwin" && existsSync(guardianPath);
}
const age = z.number().finite().min(0).nullable();
const permission = z.enum([
  "authorized",
  "denied",
  "restricted",
  "not-requested",
  "unknown",
]);
const snapshotSchema = z.object({
  version: z.literal(1),
  armedPid: z.number().int().positive().nullable(),
  sequence: z.number().int().positive(),
  displays: z.number().int().min(0).max(100).nullable(),
  mirrored: z.boolean(),
  cameras: z.number().int().min(0).max(100),
  physicalCamera: z.boolean(),
  virtualMachine: z.boolean().nullable(),
  prohibitedApplications: z.array(z.string().max(200)).max(100),
  cameraPermission: permission,
  microphonePermission: permission,
  captureRunning: z.boolean(),
  videoAgeMs: age,
  audioAgeMs: age,
  faceCount: z.number().int().min(0).max(100).nullable(),
  seb: z
    .object({
      pid: z.number().int().positive(),
      startedAt: z.number().finite().positive(),
      validSignature: z.boolean(),
      frontmost: z.boolean(),
      version: z.string().max(100),
    })
    .nullable(),
});

export const startGuardian: GuardianFactory = (sample, failure) => {
  if (!guardianAvailable())
    throw new Error(
      "Build the macOS guardian with npm run native:build first.",
    );
  const child: ChildProcessWithoutNullStreams = spawn(guardianPath, [], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      HOME: process.env.HOME,
      LANG: "en_US.UTF-8",
    },
  });
  let buffer = "",
    stopped = false,
    failed = false,
    pid: number | undefined,
    startedAt: number | undefined;
  let diagnosticBytes = 0;
  const send = (value: object) => {
    if (!child.stdin.destroyed) child.stdin.write(JSON.stringify(value) + "\n");
  };
  const fail = (reason: string) => {
    if (!stopped && !failed) {
      failed = true;
      failure(reason);
    }
  };
  const heartbeat = setInterval(() => send({ type: "ping" }), 1000);
  heartbeat.unref();
  child.stdin.on("error", () =>
    fail("The native guardian connection was lost."),
  );
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    if (buffer.length > 65536) {
      fail("The native guardian sent invalid output.");
      child.kill();
      return;
    }
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      try {
        sample(snapshotSchema.parse(JSON.parse(line)));
      } catch {
        fail("The native guardian returned an incomplete observation.");
      }
    }
  });
  // Never forward raw native diagnostics/device identifiers to the browser.
  child.stderr.on("data", (chunk: Buffer) => {
    diagnosticBytes += chunk.length;
    if (diagnosticBytes > 256000) {
      fail("The native guardian stopped responding reliably.");
      child.kill();
    }
  });
  child.on("error", () => fail("The native guardian could not start."));
  child.on("close", () => {
    clearInterval(heartbeat);
    fail("The native guardian stopped.");
  });
  const fallback = () => {
    if (!pid || !startedAt) return;
    const recovery = spawn(
      guardianPath,
      ["--exit-seb", String(pid), String(startedAt)],
      {
        stdio: "ignore",
      },
    );
    recovery.on("error", () => {});
    const timeout = setTimeout(() => recovery.kill("SIGKILL"), 5000);
    timeout.unref();
    recovery.on("close", () => clearTimeout(timeout));
  };
  return {
    arm(value, launchTime) {
      pid = value;
      startedAt = launchTime;
      send({ type: "arm", pid, startedAt });
    },
    exitSeb() {
      send({ type: "exit-seb" });
      fallback();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(heartbeat);
      send({ type: "stop" });
      child.stdin.end();
      const timeout = setTimeout(() => child.kill("SIGKILL"), 3000);
      timeout.unref();
      child.once("close", () => clearTimeout(timeout));
    },
  };
};
