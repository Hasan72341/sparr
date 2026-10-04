import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import type { Artifact, Profile, Repository } from "../shared/types.js";
import { boundedProcess } from "./process.js";
import { parserGate } from "./limits.js";
import { sandboxProfile, runnerCapability } from "./runner.js";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

export { parseResumeText } from "./resume-parser.js";
export function parseRepositoryUrl(value: string): {
  owner: string;
  repo: string;
  url: string;
} {
  if (
    !/^https:\/\/github\.com\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(
      value,
    )
  )
    throw new Error(
      "Use a public HTTPS GitHub repository URL, such as https://github.com/owner/project.",
    );
  const u = new URL(value);
  const [owner, raw] = u.pathname.split("/").filter(Boolean);
  const repo = raw.replace(/\.git$/, "");
  if (!repo || repo === "." || repo === "..")
    throw new Error("Invalid repository name.");
  return { owner, repo, url: `https://github.com/${owner}/${repo}.git` };
}
const ignored =
  /(^|\/)(node_modules|vendor|dist|build|\.git|\.venv|venv|\.env[^/]*|.*(?:secret|credential|private.key).*|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)(\/|$)/i;
export function safeSourcePath(path: string) {
  return (
    !path.startsWith("/") &&
    !path.split("/").includes("..") &&
    !ignored.test(path) &&
    (/(?:^|\/)(README|LICENSE)$/i.test(path) ||
      /\.(py|js|mjs|cjs|jsx|ts|tsx|json|md|txt|toml|yaml|yml|rs|go|java|cpp|c|h|html|css|ipynb|csv)$/i.test(
        path,
      ))
  );
}
export async function importRepository(
  value: string,
  dataDir: string,
): Promise<Repository> {
  const { repo, url } = parseRepositoryUrl(value);
  const id = randomUUID();
  const root = join(dataDir, "repositories");
  const dir = join(root, id);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const env = {
    PATH: process.env.PATH,
    HOME: dir,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_LFS_SKIP_SMUDGE: "1",
    LANG: "en_US.UTF-8",
  };
  try {
    const clone = await boundedProcess(
      "/usr/bin/git",
      [
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "http.followRedirects=false",
        "-c",
        "credential.helper=",
        "clone",
        "--depth",
        "1",
        "--filter=blob:limit=100k",
        "--no-checkout",
        "--",
        url,
        dir,
      ],
      {
        timeout: 30000,
        maxOutput: 8192,
        diskLimit: { path: dir, bytes: 32000000 },
        memoryLimitMb: 256,
        env,
      },
    );
    if (clone.code !== 0)
      throw new Error(
        clone.timedOut
          ? "Repository import timed out. Try a smaller repository."
          : "Could not clone this public repository. Check its URL and network access. Private repositories are not supported in this release.",
      );
    const git = (args: string[]) =>
      boundedProcess(
        "/usr/bin/git",
        [
          "-c",
          "core.hooksPath=/dev/null",
          "-c",
          "http.followRedirects=false",
          "-c",
          "credential.helper=",
          ...args,
        ],
        {
          cwd: dir,
          timeout: 12000,
          maxOutput: 400000,
          env: { ...env, GIT_NO_LAZY_FETCH: "1" },
        },
      );
    const revision = await git(["rev-parse", "HEAD"]);
    const tree = await git(["ls-tree", "-r", "-l", "HEAD"]);
    if (tree.code !== 0 || tree.limited)
      throw new Error("Repository file index exceeds the import limit.");
    const candidates = tree.stdout
      .split("\n")
      .flatMap((line) => {
        const m = line.match(/^100\d{3} blob [a-f0-9]+\s+(\d+)\t(.+)$/);
        return m && Number(m[1]) <= 100000 && safeSourcePath(m[2])
          ? [{ path: m[2], bytes: Number(m[1]) }]
          : [];
      })
      .slice(0, 300);
    const languageMap: Record<string, string> = {
      ".py": "Python",
      ".js": "JavaScript",
      ".ts": "TypeScript",
      ".tsx": "TypeScript",
      ".jsx": "JavaScript",
      ".rs": "Rust",
      ".go": "Go",
      ".java": "Java",
      ".cpp": "C++",
      ".ipynb": "Jupyter",
      ".csv": "Data",
    };
    const languages = [
      ...new Set(
        candidates.map((f) => languageMap[extname(f.path)]).filter(Boolean),
      ),
    ];
    const priority = [...candidates].sort(
      (a, b) =>
        Number(
          /readme|package\.json|pyproject|test|main|app|index/i.test(b.path),
        ) -
        Number(
          /readme|package\.json|pyproject|test|main|app|index/i.test(a.path),
        ),
    );
    const evidence: Repository["evidence"] = [];
    for (const file of priority.slice(0, 10)) {
      const content = await git(["show", `HEAD:${file.path}`]);
      if (content.code === 0 && !content.limited)
        evidence.push({
          path: file.path,
          excerpt: content.stdout.slice(0, 5000),
        });
    }
    return {
      id,
      name: repo,
      url,
      commit: revision.stdout.trim(),
      createdAt: new Date().toISOString(),
      files: candidates,
      languages,
      evidence,
      summary: `Inspected ${candidates.length} source files at ${revision.stdout.trim().slice(0, 8)}. ${languages.join(", ") || "No recognized programming language"}. Questions refer to this commit.`,
      executionStatus:
        "Inspected only. Dependency installation and arbitrary project startup are not performed on the host.",
    };
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

export async function repositorySourceFiles(
  repo: Repository,
  dataDir: string,
): Promise<Record<string, string>> {
  const dir = join(dataDir, "repositories", repo.id);
  const files: Record<string, string> = {};
  let bytes = 0;
  const env = {
    PATH: process.env.PATH,
    HOME: dir,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_NO_LAZY_FETCH: "1",
    GIT_TERMINAL_PROMPT: "0",
  };
  for (const file of repo.files) {
    if (!safeSourcePath(file.path)) continue;
    const r = await boundedProcess(
      "/usr/bin/git",
      ["-c", "core.hooksPath=/dev/null", "show", `${repo.commit}:${file.path}`],
      { cwd: dir, env, timeout: 3000, maxOutput: 100001 },
    );
    if (r.code !== 0 || r.limited)
      throw new Error(
        "Some source files are unavailable in this bounded import. Reimport a smaller repository.",
      );
    bytes += Buffer.byteLength(r.stdout);
    if (bytes > 3000000)
      throw new Error("Project source exceeds the 3 MB execution limit.");
    files[file.path] = r.stdout;
  }
  return files;
}

export async function extractResume(
  buffer: Buffer,
  filename: string,
): Promise<Profile> {
  return parseFile<Profile>(buffer, filename, "resume");
}

export async function importArtifact(
  buffer: Buffer,
  filename: string,
): Promise<Artifact> {
  const parsed = await parseFile<Omit<Artifact, "id" | "createdAt">>(
    buffer,
    filename,
    "artifact",
  );
  return { ...parsed, id: randomUUID(), createdAt: new Date().toISOString() };
}

async function parseFile<T>(
  buffer: Buffer,
  filename: string,
  mode: "resume" | "artifact",
): Promise<T> {
  return parserGate.run(async () => {
    if (buffer.length > 5 * 1024 * 1024)
      throw new Error("File exceeds the 5 MB limit.");
    if ([".docx", ".xlsx"].includes(extname(filename).toLowerCase())) {
      // Bound ZIP expansion before passing the document to the XML parser.
      let expanded = 0,
        entries = 0;
      for (let i = 0; i + 46 <= buffer.length; i++) {
        if (buffer.readUInt32LE(i) === 0x02014b50) {
          entries++;
          expanded += buffer.readUInt32LE(i + 24);
          if (expanded > 20000000 || entries > 500)
            throw new Error("Archive contents exceed the parsing limit.");
          i +=
            45 +
            buffer.readUInt16LE(i + 28) +
            buffer.readUInt16LE(i + 30) +
            buffer.readUInt16LE(i + 32);
        }
      }
      if (!entries)
        throw new Error("This file is not a valid document archive.");
    }
    const cap = await runnerCapability();
    if (!cap.available)
      throw new Error(
        "File parsing requires the macOS sandbox. You can paste and save resume text directly.",
      );
    const work = await realpath(await mkdtemp(join(tmpdir(), "sparr-parse-")));
    try {
      const allowed = [
        resolve("node_modules"),
        resolve("src/server"),
        resolve("src/shared"),
        resolve("package.json"),
        resolve("tsconfig.json"),
      ];
      const r = await boundedProcess(
        "/usr/bin/sandbox-exec",
        [
          "-p",
          sandboxProfile(work, allowed),
          process.execPath,
          "--max-old-space-size=128",
          resolve("src/server/parse-worker.ts"),
          filename,
          mode,
        ],
        {
          cwd: work,
          input: buffer,
          timeout: 10000,
          maxOutput: 180000,
          memoryLimitMb: 384,
          diskLimit: { path: work, bytes: 5000000 },
          env: {
            PATH: "/usr/bin:/bin",
            HOME: work,
            TMPDIR: work,
            OPENSSL_CONF: "/dev/null",
            TSX_DISABLE_CACHE: "1",
            TSX_TSCONFIG_PATH: resolve("tsconfig.json"),
          },
        },
      );
      if (r.code !== 0 || r.timedOut || r.limited) {
        throw new Error(
          r.timedOut
            ? "Document parsing timed out. Try a text export."
            : "This document could not be parsed within the supported limits. Try a text export.",
        );
      }
      const line = r.stdout
        .split("\n")
        .findLast((l) => l.startsWith("SPARR_PARSE_RESULT:"));
      if (!line)
        throw new Error("Document parser did not return readable text.");
      const parsed = JSON.parse(line.slice("SPARR_PARSE_RESULT:".length));
      if (parsed.error) throw new Error(parsed.error);
      return parsed.result;
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });
}
