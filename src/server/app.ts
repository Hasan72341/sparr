import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import multer from "multer";
import { z, ZodError } from "zod";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Store, emptyProfile } from "./store.js";
import { tracks } from "./questions.js";
import { InterviewEngine, HttpError } from "./interviews.js";
import {
  extractResume,
  importArtifact,
  importRepository,
  repositorySourceFiles,
} from "./artifacts.js";
import { SebLaunches, localSebOrigin, practiceSebConfig } from "./seb.js";
import {
  StrictController,
  strictCookie,
  type StrictDependencies,
} from "./strict.js";
import { getCapabilities } from "./integrity.js";
import { runCode, runProjectFiles } from "./runner.js";
import { providerReply, validateEndpoint } from "./providers.js";
import type {
  Artifact,
  Profile,
  Settings,
  Repository,
} from "../shared/types.js";
const trackSchema = z.enum([
  "swe",
  "quant-research",
  "quant-trading",
  "quant-dev",
  "finance",
  "markets",
  "ml",
]);
const sessionSchema = z.object({
  track: trackSchema,
  difficulty: z.enum(["foundation", "intermediate", "advanced"]),
  durationMinutes: z.number().int().min(5).max(90),
  mode: z.enum(["practice", "strict"]),
  repositoryId: z.string().uuid().optional(),
  artifactId: z.string().uuid().optional(),
  company: z.string().trim().max(120).optional(),
  jobDescription: z.string().trim().max(8000).optional(),
  stage: z
    .enum(["technical", "oa", "project", "behavioral"])
    .default("technical"),
});

const draftSchema = z.object({
  answer: z.string().max(30000),
  code: z.string().max(50000),
  language: z.enum(["python", "javascript"]),
});
const profileSchema = z.object({
  name: z.string().max(120),
  email: z
    .string()
    .max(254)
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Enter a valid email or leave it empty.",
    ),
  headline: z.string().max(300),
  resumeText: z.string().max(60000),
  skills: z.array(z.string().max(80)).max(60),
  goals: z.string().max(2000),
});
const settingsSchema = z.object({
  provider: z.enum([
    "guided",
    "ollama",
    "openai-compatible",
    "codex",
    "claude",
  ]),
  model: z.string().max(200),
  baseUrl: z.string().max(500),
});
const param = (req: Request) => String(req.params.id);
export async function createApp(options: {
  dataDir: string;
  test?: boolean;
  strict?: StrictDependencies;
}) {
  const app = express();
  app.disable("x-powered-by");
  const store = new Store(options.dataDir);
  const engine = new InterviewEngine(store);
  const sebLaunches = new SebLaunches();
  const strict = new StrictController(store, engine, options.strict);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
  });
  let executing = 0;
  let importing = false;
  let deletingData = false;
  let dataGeneration = 0;
  const repositoryRuns = new Set<string>();
  app.use((req, res, next) => {
    const host = req.headers.host?.split(":")[0];
    if (!host || !["localhost", "127.0.0.1", "["].includes(host))
      return res
        .status(403)
        .json({ error: "Sparr only accepts local connections." });
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(self), microphone=(self), geolocation=()",
    });
    if (req.path.startsWith("/api")) {
      res.locals.dataGeneration = dataGeneration;
      if (deletingData)
        return res
          .status(409)
          .json({ error: "Data deletion is in progress. Try again shortly." });
      res.set("Cache-Control", "no-store");
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        const origin = req.headers.origin;
        if (
          req.headers["x-sparr-client"] !== "web" ||
          (origin &&
            origin !== `http://${req.headers.host}` &&
            origin !== `https://${req.headers.host}`)
        )
          return res.status(403).json({
            error:
              "Request origin could not be verified. Open Sparr directly on localhost.",
          });
      }
    }
    next();
  });
  app.use(express.json({ limit: "200kb" }));
  const checkDataGeneration = (
    _req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    if (
      deletingData ||
      (res.locals.dataGeneration !== undefined &&
        res.locals.dataGeneration !== dataGeneration)
    )
      return res.status(409).json({
        error:
          "Your workspace was cleared while this request was pending. Try again.",
      });
    next();
  };
  app.use(checkDataGeneration);
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) strict.authorize(req);
    res.once("finish", () => strict.tick());
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, version: "0.1.0" }),
  );
  app.get("/api/bootstrap", async (_req, res) =>
    res.json({
      profile: store.profile(),
      settings: store.settings(),
      tracks,
      sessions: store.sessions().map((s) => engine.get(s.id)),
      repositories: store.repositories(),
      artifacts: store.list<Artifact>("artifact"),
      capabilities: await getCapabilities(),
    }),
  );
  app.put("/api/profile", (req, res) => {
    const p = profileSchema.parse(req.body);
    store.put("profile", "local", p);
    res.json(p);
  });
  app.post(
    "/api/profile/resume",
    upload.single("file"),
    checkDataGeneration,
    async (req, res) => {
      if (!req.file) throw new HttpError(400, "Choose a resume file.");
      try {
        res.json(await extractResume(req.file.buffer, req.file.originalname));
      } catch (error) {
        throw new HttpError(400, (error as Error).message);
      }
    },
  );
  app.put("/api/settings", (req, res) => {
    const s = settingsSchema.parse(req.body);
    if (s.provider === "codex")
      throw new HttpError(
        409,
        "Codex adapter is disabled until tool isolation is validated. Use Claude Code, Ollama, or a compatible API.",
      );
    if (["ollama", "openai-compatible"].includes(s.provider)) {
      try {
        validateEndpoint(s.baseUrl);
      } catch (error) {
        throw new HttpError(400, (error as Error).message);
      }
      if (!s.model.trim()) throw new HttpError(400, "Enter a model name.");
    }
    store.put("settings", "local", s);
    res.json(s);
  });
  app.post("/api/settings/test", async (_req, res) => {
    const settings = store.settings();
    if (settings.provider === "guided") {
      res.json({
        ok: true,
        message: "Guided practice is ready. No model connection is required.",
      });
      return;
    }
    const p = {
      id: "probe",
      track: "swe" as const,
      title: "Connection check",
      kind: "discussion" as const,
      difficulty: "foundation" as const,
      prompt: "Ask a short interview opening question.",
      tags: [],
    };
    try {
      await providerReply(settings, {
        profile: { ...emptyProfile },
        question: p,
        session: { messages: [] } as never,
        assessment: { evidence: [], feedback: "Connection check" } as never,
      });
      res.json({
        ok: true,
        message: "Provider returned a valid structured interview response.",
      });
    } catch (error) {
      res.json({ ok: false, message: (error as Error).message });
    }
  });
  const proofSchema = z.object({
    pageUrl: z.string().max(500),
    configHash: z.string().max(128),
  });
  app.post("/api/strict/launches", (req, res) => {
    const { options: input } = z
      .object({
        consent: z.literal(true),
        options: sessionSchema.extend({ mode: z.literal("practice") }).strict(),
      })
      .strict()
      .parse(req.body);
    if (input.repositoryId && !store.get("repository", input.repositoryId))
      throw new HttpError(404, "Project not found.");
    if (input.artifactId && !store.get("artifact", input.artifactId))
      throw new HttpError(404, "Document not found.");
    res
      .status(201)
      .json(
        strict.prepare(
          input,
          localSebOrigin(req.protocol, req.headers.host || ""),
        ),
      );
  });
  app.get("/api/strict/launches/:id/config.seb", (req, res) =>
    res
      .attachment("sparr-strict.seb")
      .type("application/seb")
      .send(strict.config(param(req))),
  );
  app.get("/api/strict/launches/:id/status", (req, res) =>
    res.json(strict.status(param(req))),
  );
  app.post("/api/strict/launches/:id/admit", async (req, res) => {
    const result = await strict.admit(param(req), proofSchema.parse(req.body));
    res.cookie("sparr-strict", result.cookie, {
      httpOnly: true,
      sameSite: "strict",
      secure: req.secure,
      path: "/api",
      maxAge: 2 * 60 * 60 * 1000,
    });
    res.status(201).json({ view: result.view, challenge: result.challenge });
  });
  app.post("/api/strict/launches/:id/resume", (req, res) =>
    res.json(
      strict.resume(param(req), strictCookie(req), proofSchema.parse(req.body)),
    ),
  );
  app.post("/api/strict/launches/:id/heartbeat", (req, res) => {
    const input = proofSchema
      .extend({ challenge: z.string().max(100) })
      .parse(req.body);
    res.json(
      strict.heartbeat(param(req), strictCookie(req), input, input.challenge),
    );
  });
  app.post("/api/strict/launches/:id/cancel", (req, res) => {
    strict.cancel(
      param(req),
      z.object({ ifPreflight: z.boolean().optional() }).parse(req.body)
        .ifPreflight,
    );
    res.json({ ended: true });
  });
  app.post("/api/seb/launches", (req, res) => {
    const input = sessionSchema
      .extend({ mode: z.literal("practice") })
      .strict()
      .parse(req.body);
    const origin = localSebOrigin(req.protocol, req.headers.host || "");
    if (input.repositoryId && !store.get("repository", input.repositoryId))
      throw new HttpError(404, "Project not found. Choose another project.");
    if (input.artifactId && !store.get("artifact", input.artifactId))
      throw new HttpError(404, "Document not found. Choose another document.");
    res.status(201).json(sebLaunches.create(input, origin));
  });
  app.get("/api/seb/launches/:id/config.seb", (req, res) => {
    const launch = sebLaunches.get(param(req));
    res
      .attachment("sparr-practice.seb")
      .type("application/seb")
      .send(practiceSebConfig(launch.startUrl));
  });
  app.get("/api/seb/launches/:id", (req, res) =>
    res.json(sebLaunches.get(param(req))),
  );
  app.get("/api/sessions", (_req, res) =>
    res.json(store.sessions().map((s) => engine.get(s.id))),
  );
  app.post("/api/sessions", (req, res) => {
    const input = sessionSchema.parse(req.body);
    res.status(201).json(engine.start(input));
  });
  app.get("/api/sessions/:id", (req, res) =>
    res.json(engine.view(engine.get(param(req)))),
  );
  app.put("/api/sessions/:id/draft", async (req, res) => {
    const draft = draftSchema.parse(req.body);
    await engine.lock(param(req), async () => {
      const s = engine.get(param(req));
      engine.active(s);
      s.draft = draft;
      engine.save(s);
    });
    res.json({ saved: true });
  });
  app.post("/api/sessions/:id/answer", async (req, res) => {
    const input = draftSchema
      .extend({ requestId: z.string().min(8).max(100) })
      .parse(req.body);
    res.json(await engine.answer(param(req), input));
  });
  app.post("/api/sessions/:id/followup", async (req, res) => {
    const input = z
      .object({
        answer: z.string().min(1).max(30000),
        requestId: z.string().min(8).max(100),
      })
      .parse(req.body);
    res.json(await engine.followup(param(req), input));
  });
  app.post("/api/sessions/:id/hint", async (req, res) =>
    res.json(
      await engine.lock(param(req), async () => engine.hint(param(req))),
    ),
  );
  app.post("/api/sessions/:id/next", async (req, res) =>
    res.json(
      await engine.lock(param(req), async () => engine.next(param(req))),
    ),
  );
  app.post("/api/sessions/:id/finish", async (req, res) =>
    res.json(
      await engine.lock(param(req), async () => {
        const s = engine.get(param(req));
        engine.finish(s);
        return engine.view(s);
      }),
    ),
  );
  app.post("/api/sessions/:id/run", async (req, res) => {
    const input = draftSchema
      .pick({ code: true, language: true })
      .parse(req.body);
    if (executing >= 2)
      throw new HttpError(
        429,
        "Two executions are already running. Try again shortly.",
      );
    executing++;
    try {
      res.json(
        await engine.lock(param(req), async () => {
          const s = engine.get(param(req));
          engine.active(s);
          const result = await runCode(
            engine.problem(s),
            input.code,
            input.language,
          );
          if (s.mode === "strict") engine.active(engine.get(s.id));
          return result;
        }),
      );
    } finally {
      executing--;
    }
  });
  app.delete("/api/sessions/:id", async (req, res) => {
    await engine.lock(param(req), async () => {
      engine.get(param(req));
      const s = engine.get(param(req));
      store.transaction(() => {
        store.delete("session", param(req));
        store.delete("session-settings", param(req));
        store.deleteReceipts(param(req));
        for (const q of s.questionIds)
          if (q.startsWith("resume-") || q.startsWith("project-"))
            store.delete("problem", q);
      });
    });
    res.json({ deleted: true });
  });
  app.get("/api/sessions/:id/export", (req, res) => {
    res
      .attachment(`sparr-interview-${param(req)}.json`)
      .json(engine.view(engine.get(param(req))));
  });
  app.post(
    "/api/artifacts",
    upload.single("file"),
    checkDataGeneration,
    async (req, res) => {
      if (!req.file) throw new HttpError(400, "Choose a project document.");
      if (importing) throw new HttpError(409, "Another import is in progress.");
      importing = true;
      try {
        const artifact = await importArtifact(
          req.file.buffer,
          req.file.originalname,
        );
        store.put("artifact", artifact.id, artifact);
        res.status(201).json(artifact);
      } catch (error) {
        throw new HttpError(400, (error as Error).message);
      } finally {
        importing = false;
      }
    },
  );
  app.delete("/api/artifacts/:id", (req, res) => {
    const id = param(req);
    if (!store.get("artifact", id))
      throw new HttpError(404, "Document not found.");
    if (
      store
        .sessions()
        .some(
          (s) => s.artifactId === id && engine.get(s.id).status === "active",
        )
    )
      throw new HttpError(
        409,
        "Finish the active interview using this document before deleting it.",
      );
    store.delete("artifact", id);
    res.json({ deleted: true });
  });
  app.post("/api/repositories", async (req, res) => {
    const input = z.object({ url: z.string().min(1).max(500) }).parse(req.body);
    if (importing)
      throw new HttpError(409, "Another repository import is in progress.");
    importing = true;
    try {
      const repo = await importRepository(input.url, options.dataDir);
      store.put("repository", repo.id, repo);
      res.status(201).json(repo);
    } catch (error) {
      throw new HttpError(400, (error as Error).message);
    } finally {
      importing = false;
    }
  });
  app.post("/api/repositories/:id/run-tests", async (req, res) => {
    const id = param(req);
    const repo = store.get<Repository>("repository", id);
    if (!repo) throw new HttpError(404, "Project not found.");
    if (repositoryRuns.has(id))
      throw new HttpError(409, "Project tests are already running.");
    if (executing >= 2)
      throw new HttpError(
        429,
        "Two executions are already running. Try again shortly.",
      );
    executing++;
    repositoryRuns.add(id);
    try {
      const result = await runProjectFiles(
        await repositorySourceFiles(repo, options.dataDir),
      );
      repo.executionStatus = `${result.status}: ${result.output.slice(0, 700)}`;
      repo.evidence = repo.evidence.filter(
        (e) => e.path !== "[execution evidence]",
      );
      repo.evidence.push({
        path: "[execution evidence]",
        excerpt: result.output.slice(0, 5000),
      });
      store.put("repository", id, repo);
      res.json(repo);
    } catch (error) {
      throw new HttpError(400, (error as Error).message);
    } finally {
      executing--;
      repositoryRuns.delete(id);
    }
  });
  app.delete("/api/repositories/:id", (req, res) => {
    const id = param(req);
    if (repositoryRuns.has(id))
      throw new HttpError(
        409,
        "Wait for project tests to finish before deleting this project.",
      );
    if (!store.get("repository", id))
      throw new HttpError(404, "Project not found.");
    if (
      store
        .sessions()
        .some((s) => s.repositoryId === id && s.status === "active")
    )
      throw new HttpError(
        409,
        "Finish the active interview using this project before deleting it.",
      );
    store.delete("repository", id);
    void rm(join(options.dataDir, "repositories", id), {
      recursive: true,
      force: true,
    }).catch(() => {});
    res.json({ deleted: true });
  });
  app.get("/api/export", (_req, res) =>
    res.attachment("sparr-data.json").json({
      profile: store.profile(),
      sessions: store.sessions().map((s) => engine.get(s.id)),
      repositories: store.repositories(),
      artifacts: store.list<Artifact>("artifact"),
      exportedAt: new Date().toISOString(),
    }),
  );
  app.delete("/api/data", async (_req, res) => {
    if (importing || executing || engine.busy)
      throw new HttpError(
        409,
        "Wait for running imports and executions to finish.",
      );
    deletingData = true;
    dataGeneration++;
    try {
      strict.clear();
      store.clear();
      sebLaunches.clear();
      await rm(join(options.dataDir, "repositories"), {
        recursive: true,
        force: true,
      });
      res.json({ deleted: true });
    } finally {
      deletingData = false;
    }
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof ZodError)
        return res.status(400).json({
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        });
      if (error instanceof multer.MulterError)
        return res.status(400).json({
          error:
            error.code === "LIMIT_FILE_SIZE"
              ? "File exceeds the 5 MB limit."
              : error.message,
        });
      if (error instanceof HttpError)
        return res.status(error.status).json({ error: error.message });
      if (error instanceof SyntaxError)
        return res.status(400).json({ error: "Invalid JSON request." });
      console.error(
        "Sparr request failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
      return res.status(500).json({
        error:
          "The request could not be completed. Your saved work is preserved. Try again.",
      });
    },
  );
  return {
    app,
    store,
    engine,
    strict,
    close: () => {
      strict.close();
      store.close();
    },
  };
}
