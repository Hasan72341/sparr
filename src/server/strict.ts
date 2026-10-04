import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import type {
  GuardianSnapshot,
  IntegrityEvent,
  PracticeOptions,
  Session,
  StrictLaunch,
  StrictStatus,
} from "../shared/types.js";
import { Store } from "./store.js";
import { InterviewEngine, HttpError } from "./interviews.js";
import {
  startGuardian,
  type GuardianFactory,
  type GuardianHandle,
} from "./guardian.js";
import { strictSebSettings, sebConfigKey, sebPageHash } from "./strict-seb.js";
import { encodeSebConfig } from "./seb.js";

export interface StrictDependencies {
  guardianFactory?: GuardianFactory;
  now?: () => number;
  // Programmatic integration-lab seam. The production entry point supplies none.
  settingsFactory?: typeof strictSebSettings;
}
interface Attempt {
  launch: StrictLaunch;
  config: Buffer;
  key: string;
  phase: StrictStatus["phase"];
  admitting?: boolean;
  expires: number;
  snapshot?: GuardianSnapshot;
  nativeAt: number;
  browserAt: number;
  sequence: number;
  guardian?: GuardianHandle;
  reason?: string;
  sessionId?: string;
  pid?: number;
  startedAt?: number;
  cookie?: string;
  challenge: string;
  absentSince?: number;
  multipleSince?: number;
}
const equal = (a: string, b: string) => {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
export function nativeReasons(s?: GuardianSnapshot): string[] {
  if (!s)
    return [
      "Waiting for the native guardian and camera/microphone permissions.",
    ];
  const reasons: string[] = [];
  if (s.displays !== 1) reasons.push("Exactly one active display is required.");
  if (s.mirrored) reasons.push("Display mirroring is not allowed.");
  if (s.cameras !== 1)
    reasons.push("Exactly one connected camera is required.");
  if (!s.physicalCamera)
    reasons.push(
      "Strict mode requires the built-in camera; external, continuity, and virtual cameras are not accepted.",
    );
  if (s.virtualMachine !== false)
    reasons.push(
      s.virtualMachine
        ? "Virtual machines are not allowed."
        : "The native guardian could not establish VM status.",
    );
  if (s.prohibitedApplications.length)
    reasons.push(
      "A screen capture, remote access, or prohibited application is running.",
    );
  if (s.cameraPermission !== "authorized")
    reasons.push("Camera permission is required for the Sparr Guardian app.");
  if (s.microphonePermission !== "authorized")
    reasons.push(
      "Microphone permission is required for the Sparr Guardian app.",
    );
  if (!s.captureRunning)
    reasons.push("Live camera and microphone capture must remain running.");
  if (s.videoAgeMs === null || s.videoAgeMs > 3000)
    reasons.push("Live camera frames are unavailable.");
  if (s.audioAgeMs === null || s.audioAgeMs > 3000)
    reasons.push("Live microphone samples are unavailable.");
  if (s.faceCount === null) reasons.push("Face observation is unavailable.");
  return reasons;
}

export class StrictController {
  private attempt?: Attempt;
  private timer: ReturnType<typeof setInterval>;
  private now: () => number;
  private factory: GuardianFactory;
  private settingsFactory: typeof strictSebSettings;
  constructor(
    private store: Store,
    private engine: InterviewEngine,
    dependencies: StrictDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => performance.now());
    this.factory = dependencies.guardianFactory ?? startGuardian;
    this.settingsFactory = dependencies.settingsFactory ?? strictSebSettings;
    for (const session of store.sessions())
      if (session.mode === "strict" && session.status === "active")
        engine.terminate(
          session.id,
          "server-restarted",
          "Sparr restarted before the strict attempt ended.",
        );
    this.timer = setInterval(() => this.tick(), 500);
    this.timer.unref();
  }
  prepare(options: PracticeOptions, origin: string): StrictLaunch {
    this.tick();
    if (this.attempt && this.attempt.phase !== "ended")
      throw new HttpError(
        409,
        "A strict setup or interview is already open. Cancel it before preparing another.",
      );
    const id = randomUUID();
    const launch: StrictLaunch = {
      id,
      options,
      startUrl: `${origin}/strict/${id}`,
      quitUrl: `${origin}/strict/${id}/quit`,
      configUrl: `${origin}/api/strict/launches/${id}/config.seb`,
      launchUrl: "",
      expiresAt: new Date(Date.now() + 10 * 60000).toISOString(),
    };
    launch.launchUrl = launch.configUrl
      .replace(/^http:/, "seb:")
      .replace(/^https:/, "sebs:");
    const settings = this.settingsFactory({
      startUrl: launch.startUrl,
      quitUrl: launch.quitUrl,
      origin,
    });
    const a: Attempt = {
      launch,
      config: encodeSebConfig(settings),
      key: sebConfigKey(settings),
      phase: "preflight",
      expires: this.now() + 10 * 60000,
      nativeAt: 0,
      browserAt: 0,
      sequence: 0,
      challenge: randomUUID(),
    };
    this.attempt = a;
    try {
      a.guardian = this.factory(
        (s) => this.observe(a, s),
        (reason) => this.fail(a, "guardian-failed", reason),
      );
      if (a.phase === "ended") a.guardian.stop();
    } catch (error) {
      this.attempt = undefined;
      throw new HttpError(
        409,
        error instanceof Error
          ? error.message
          : "Native monitoring could not start.",
      );
    }
    return launch;
  }
  private get(id: string) {
    const a = this.attempt;
    if (!a || a.launch.id !== id)
      throw new HttpError(
        404,
        "This strict setup is unavailable. Prepare a new session.",
      );
    return a;
  }
  config(id: string) {
    const a = this.get(id);
    this.tick();
    if (a.phase !== "preflight")
      throw new HttpError(
        409,
        "This strict configuration is no longer available.",
      );
    return a.config;
  }
  status(id: string): StrictStatus {
    this.tick();
    const a = this.get(id);
    const reasons = a.reason ? [a.reason] : this.reasons(a, false);
    return {
      phase: a.phase,
      ready: a.phase === "preflight" && !reasons.length,
      reasons,
      sessionId: a.sessionId,
      quitUrl: a.launch.quitUrl,
      ...(a.snapshot
        ? {
            observation: {
              displays: a.snapshot.displays,
              cameras: a.snapshot.cameras,
              faceCount: a.snapshot.faceCount,
              cameraPermission: a.snapshot.cameraPermission,
              microphonePermission: a.snapshot.microphonePermission,
            },
          }
        : {}),
    };
  }
  private reasons(a: Attempt, requireSeb: boolean) {
    const reasons = nativeReasons(a.snapshot);
    if (a.snapshot && this.now() - a.nativeAt > 4000)
      reasons.push("The native guardian heartbeat expired.");
    if (!requireSeb && a.snapshot?.faceCount !== 1)
      reasons.push(
        "Keep one face visible to the built-in camera before starting.",
      );
    if (requireSeb) {
      const seb = a.snapshot?.seb;
      if (!seb || !seb.validSignature)
        reasons.push(
          "The official signed Safe Exam Browser must be running on this Mac.",
        );
      else {
        if (!seb.frontmost)
          reasons.push("Safe Exam Browser left the foreground.");
        if (a.pid && (a.pid !== seb.pid || a.startedAt !== seb.startedAt))
          reasons.push("The Safe Exam Browser process changed.");
        if (a.pid && a.snapshot?.armedPid !== a.pid)
          reasons.push("The native guardian lost its binding to SEB.");
      }
    }
    return reasons;
  }
  private observe(a: Attempt, snapshot: GuardianSnapshot) {
    if (this.attempt !== a || a.phase === "ended") return;
    if (snapshot.sequence <= a.sequence) {
      this.fail(
        a,
        "native-replay",
        "The native guardian observation sequence was replayed.",
      );
      return;
    }
    a.sequence = snapshot.sequence;
    a.snapshot = snapshot;
    a.nativeAt = this.now();
    if (a.phase === "active") {
      if (snapshot.faceCount === 0) a.absentSince ??= this.now();
      else a.absentSince = undefined;
      if (snapshot.faceCount !== null && snapshot.faceCount > 1)
        a.multipleSince ??= this.now();
      else a.multipleSince = undefined;
    }
    this.tick();
  }
  private validProof(
    a: Attempt,
    proof: { pageUrl: string; configHash: string },
  ) {
    return (
      proof.pageUrl === a.launch.startUrl &&
      /^[a-f0-9]{64}$/.test(proof.configHash) &&
      equal(sebPageHash(a.launch.startUrl, a.key), proof.configHash)
    );
  }
  async admit(id: string, proof: { pageUrl: string; configHash: string }) {
    const a = this.get(id);
    this.tick();
    if (a.phase !== "preflight")
      throw new HttpError(
        409,
        "This strict admission has already been used or ended.",
      );
    if (!this.validProof(a, proof))
      throw new HttpError(
        403,
        "SEB configuration verification failed. Open the generated strict configuration in SEB.",
      );
    const reasons = [
      ...this.reasons(a, true),
      ...(a.snapshot?.faceCount === 1
        ? []
        : ["Keep exactly one face visible before admission."]),
    ];
    if (reasons.length) throw new HttpError(409, reasons.join(" "));
    if (a.admitting)
      throw new HttpError(409, "Strict admission is already in progress.");
    a.admitting = true;
    a.pid = a.snapshot!.seb!.pid;
    a.startedAt = a.snapshot!.seb!.startedAt;
    try {
      a.guardian?.arm(a.pid, a.startedAt);
      for (
        let waited = 0;
        a.snapshot?.armedPid !== a.pid &&
        waited < 60 &&
        this.attempt?.phase !== "ended";
        waited++
      )
        await new Promise((resolve) => setTimeout(resolve, 50));
      if (
        a.snapshot?.armedPid !== a.pid ||
        a.phase !== "preflight" ||
        this.reasons(a, true).length ||
        a.snapshot.faceCount !== 1
      )
        throw new HttpError(
          409,
          "The native guardian could not bind to SEB. Prepare a new strict session.",
        );
      const view = this.engine.start(
        { ...a.launch.options, mode: "strict" },
        true,
      );
      a.phase = "active";
      a.sessionId = view.session.id;
      a.cookie = randomBytes(32).toString("hex");
      a.browserAt = this.now();
      view.session.integrity = {
        policy: "macos-strict-v1",
        events: [
          {
            at: new Date().toISOString(),
            code: "admitted",
            detail:
              "SEB configuration and fresh native observations passed admission.",
          },
        ],
      };
      this.engine.save(view.session);
      return { view, challenge: a.challenge, cookie: a.cookie };
    } catch (error) {
      this.fail(
        a,
        "admission-failed",
        "Strict admission failed; monitoring was released.",
      );
      throw error;
    } finally {
      a.admitting = false;
    }
  }
  resume(
    id: string,
    cookie: string | undefined,
    proof: { pageUrl: string; configHash: string },
  ) {
    this.tick();
    const a = this.get(id);
    this.authenticated(a, cookie, proof);
    if (a.phase !== "active")
      throw new HttpError(409, "The strict attempt has ended.");
    a.browserAt = this.now();
    return {
      view: this.engine.view(this.engine.get(a.sessionId!)),
      challenge: a.challenge,
    };
  }

  private authenticated(
    a: Attempt,
    cookie: string | undefined,
    proof: { pageUrl: string; configHash: string },
  ) {
    if (!a.cookie || !cookie || !equal(a.cookie, cookie))
      throw new HttpError(
        403,
        "This request is not bound to the admitted SEB session.",
      );
    if (!this.validProof(a, proof)) {
      this.fail(
        a,
        "config-changed",
        "SEB configuration verification was lost.",
      );
      throw new HttpError(403, "SEB configuration verification failed.");
    }
  }
  heartbeat(
    id: string,
    cookie: string | undefined,
    proof: { pageUrl: string; configHash: string },
    challenge: string,
  ) {
    this.tick();
    const a = this.get(id);
    this.authenticated(a, cookie, proof);
    if (a.phase !== "active")
      return { ...this.status(id), challenge: a.challenge };
    if (!equal(a.challenge, challenge))
      throw new HttpError(
        409,
        "The browser heartbeat was replayed or is out of date.",
      );
    a.challenge = randomUUID();
    a.browserAt = this.now();
    return { ...this.status(id), challenge: a.challenge };
  }
  authorize(req: Request) {
    this.tick();
    const a = this.attempt;
    if (!a || a.phase !== "active") return;
    if (
      req.path === "/api/health" ||
      req.path.startsWith(`/api/strict/launches/${a.launch.id}/`)
    )
      return;
    const sessionPath = `/api/sessions/${a.sessionId}`;
    const allowed =
      req.path === "/api/bootstrap" ||
      (req.path === sessionPath && req.method === "GET") ||
      (req.path.startsWith(sessionPath + "/") &&
        [
          "draft",
          "answer",
          "followup",
          "hint",
          "next",
          "run",
          "finish",
        ].includes(req.path.slice(sessionPath.length + 1)) &&
        ["POST", "PUT"].includes(req.method));
    if (!allowed)
      throw new HttpError(
        423,
        "Workspace changes are locked during a strict interview. End the attempt first.",
      );
    this.authenticated(a, strictCookie(req), {
      pageUrl: String(req.headers["x-sparr-seb-page"] || ""),
      configHash: String(req.headers["x-sparr-seb-config"] || ""),
    });
  }
  cancel(id: string, ifPreflight = false) {
    const a = this.get(id);
    if (ifPreflight && a.phase !== "preflight") return;
    this.fail(a, "candidate-ended", "The candidate ended strict monitoring.");
  }
  private fail(a: Attempt, code: string, reason: string) {
    if (this.attempt !== a || a.phase === "ended") return;
    a.phase = "ended";
    a.reason = reason;
    try {
      if (a.sessionId) this.engine.terminate(a.sessionId, code, reason);
    } catch {
      a.reason =
        reason +
        " The final event could not be written to local storage; this attempt remains blocked.";
    } finally {
      if (a.pid) a.guardian?.exitSeb();
      a.guardian?.stop();
    }
  }
  clear() {
    if (this.attempt)
      this.fail(
        this.attempt,
        "workspace-cleared",
        "The workspace was cleared during strict setup.",
      );
  }

  tick() {
    const a = this.attempt;
    if (!a || a.phase === "ended") return;
    if (a.phase === "preflight") {
      if (this.now() >= a.expires)
        this.fail(
          a,
          "setup-expired",
          "Strict setup expired. Prepare a new session.",
        );
      return;
    }
    const s = this.store.get<Session>("session", a.sessionId!);
    if (s?.status !== "active") {
      a.phase = "ended";
      a.reason =
        s?.terminationReason || "Interview completed. Your report is saved.";
      a.guardian?.exitSeb();
      a.guardian?.stop();
      return;
    }
    const reasons = this.reasons(a, true);
    if (reasons.length) {
      this.fail(a, "native-policy", reasons[0]);
      return;
    }
    if (this.now() - a.browserAt > 8000) {
      this.fail(a, "browser-heartbeat", "The browser heartbeat expired.");
      return;
    }
    if (a.multipleSince !== undefined && this.now() - a.multipleSince >= 3000) {
      this.fail(
        a,
        "multiple-faces",
        "Multiple faces were visible for at least three seconds. The attempt ended; this is not a determination of cheating.",
      );
      return;
    }
    if (a.absentSince !== undefined && this.now() - a.absentSince >= 15000) {
      this.fail(
        a,
        "face-absent",
        "No face was detected for fifteen seconds. The attempt ended; review lighting and camera position before retrying.",
      );
      return;
    }
    if (
      Date.now() >= Date.parse(s.createdAt) + s.durationMinutes * 60000 &&
      !this.engine.busy
    ) {
      this.engine.finish(s);
      this.tick();
    }
  }
  close() {
    clearInterval(this.timer);
    if (this.attempt)
      this.fail(
        this.attempt,
        "server-stopped",
        "Sparr stopped before the strict attempt ended.",
      );
  }
}
export function strictCookie(req: Request) {
  return req.headers.cookie
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith("sparr-strict="))
    ?.slice("sparr-strict=".length);
}
