import { access, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Capabilities, Language, RunResult } from "../shared/types.js";
import type { Problem } from "./questions.js";
import { boundedProcess } from "./process.js";
import { executionGate } from "./limits.js";
let capabilityPromise: Promise<Capabilities["runner"]> | undefined;
let pythonPath: string;
let pythonLibrary: string;
export async function runnerCapability(): Promise<Capabilities["runner"]> {
  return (capabilityPromise ??= (async () => {
    if (process.platform !== "darwin")
      return {
        available: false,
        name: "Unavailable",
        reason: "This release supports isolated execution on macOS only.",
      };
    try {
      await access("/usr/bin/sandbox-exec");
      const locate = await boundedProcess("/usr/bin/which", ["python3"]);
      pythonPath = await realpath(locate.stdout.trim());
      const library = await boundedProcess(pythonPath, [
        "-I",
        "-S",
        "-c",
        'import sysconfig; print(sysconfig.get_path("stdlib"))',
      ]);
      if (library.code !== 0)
        throw new Error("Python standard library could not be located.");
      pythonLibrary = await realpath(library.stdout.trim());
      const test = await boundedProcess("/usr/bin/sandbox-exec", [
        "-p",
        '(version 1)(deny default)(allow process-exec)(allow file-read-metadata)(allow file-read* (literal "/") (subpath "/usr") (subpath "/System"))(allow sysctl-read)',
        "/usr/bin/true",
      ]);
      if (test.code !== 0) throw new Error("OS sandbox probe failed");
      return { available: true, name: "macOS sandbox · local practice" };
    } catch {
      return {
        available: false,
        name: "Unavailable",
        reason:
          "A working macOS sandbox and Python 3 are required. Install Python 3 and restart Sparr.",
      };
    }
  })());
}
function equivalent(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number")
    return (
      Number.isFinite(a) && Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(b))
    );
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => equivalent(v, b[i]));
  return JSON.stringify(a) === JSON.stringify(b);
}
export function sandboxProfile(
  work: string,
  extraReads: string[] = [],
): string {
  const paths = [
    "/System",
    "/usr/lib",
    "/usr/share",
    "/usr/bin",
    "/Library/Apple",
    "/opt/homebrew/Cellar",
    "/opt/homebrew/opt",
    "/opt/homebrew/lib",
    "/usr/local/Cellar",
    "/usr/local/opt",
    "/usr/local/lib",
    "/Library/Frameworks/Python.framework",
    "/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework",
    dirname(process.execPath),
    dirname(pythonPath),
    pythonLibrary,
    work,
    ...extraReads,
  ];
  return `(version 1)(deny default)(allow process-exec)(allow file-read-metadata)(allow sysctl-read)(allow mach-lookup (global-name "com.apple.system.logger"))(allow file-read* (literal "/") ${paths.map((p) => `(subpath ${JSON.stringify(p)})`).join(" ")} (literal "/dev/null") (literal "/dev/urandom") (literal "/dev/random") (literal "/private/var/db/timezone/localtime"))(allow file-write* (subpath ${JSON.stringify(work)}) (literal "/dev/null"))`;
}
async function runCodeInternal(
  problem: Problem,
  code: string,
  language: Language,
): Promise<RunResult> {
  const start = Date.now();
  const capability = await runnerCapability();
  const result: RunResult = {
    status: "unavailable",
    passed: 0,
    total: problem.tests?.length ?? 0,
    durationMs: 0,
    output: "",
    cases: [],
  };
  if (!capability.available) {
    result.output = capability.reason ?? "Execution unavailable";
    return result;
  }
  if (!problem.tests) {
    result.output = "This question does not have executable tests.";
    return result;
  }
  if (code.length > 50000) {
    result.status = "error";
    result.output = "Code exceeds the 50 KB limit.";
    return result;
  }
  const work = await realpath(await mkdtemp(join(tmpdir(), "sparr-run-")));
  try {
    const file = join(
      work,
      language === "python" ? "solution.py" : "solution.cjs",
    );
    const source =
      language === "python"
        ? "import resource\nresource.setrlimit(resource.RLIMIT_CPU, (2, 2))\nresource.setrlimit(resource.RLIMIT_FSIZE, (1048576, 1048576))\nresource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))\n" +
          code +
          '\n\nimport json as _json, sys as _sys\n_value = solve(_json.loads(_sys.stdin.read()))\nprint("SPARR_RESULT:" + _json.dumps(_value, allow_nan=False))\n'
        : '"use strict";\n' +
          code +
          '\nconst _fs = require("node:fs");\nconst _input = JSON.parse(_fs.readFileSync(0, "utf8"));\nPromise.resolve(solve(_input)).then(v => console.log("SPARR_RESULT:" + JSON.stringify(v)));\n';
    await writeFile(file, source, { mode: 0o600 });
    for (const test of problem.tests) {
      const runtime = language === "python" ? pythonPath : process.execPath;
      const args =
        language === "python"
          ? ["-I", "-S", file]
          : ["--max-old-space-size=96", file];
      const r = await boundedProcess(
        "/usr/bin/sandbox-exec",
        ["-p", sandboxProfile(work), runtime, ...args],
        {
          cwd: work,
          input: JSON.stringify(test.input),
          timeout: 3000,
          maxOutput: 32768,
          memoryLimitMb: 256,
          diskLimit: { path: work, bytes: 8000000 },
          env: {
            PATH: "/usr/bin:/bin",
            HOME: work,
            TMPDIR: work,
            LANG: "en_US.UTF-8",
            PYTHONDONTWRITEBYTECODE: "1",
            OPENSSL_CONF: "/dev/null",
          },
        },
      );
      if (r.timedOut || r.limited || r.code !== 0) {
        result.status = "error";
        result.output = r.timedOut
          ? "Time limit exceeded (3 seconds per case)."
          : r.limited
            ? "Execution resource limit exceeded (output, memory, or storage)."
            : r.stderr.slice(-3000) || "Execution failed.";
        result.cases.push({
          name: test.name,
          passed: false,
          detail: "Execution error",
        });
        break;
      }
      const raw = r.stdout
        .split("\n")
        .findLast((l) => l.startsWith("SPARR_RESULT:"))
        ?.slice(13);
      let value: unknown;
      try {
        value = JSON.parse(raw ?? "");
      } catch {
        result.status = "error";
        result.output = "solve(data) must return a JSON-compatible value.";
        break;
      }
      const passed = equivalent(value, test.output);
      if (passed) result.passed++;
      result.cases.push({
        name: test.name,
        passed,
        detail:
          !passed && test.public
            ? `Received ${JSON.stringify(value)?.slice(0, 300)}; expected ${JSON.stringify(test.output)}`
            : undefined,
      });
    }
    if (result.status !== "error") {
      result.status = result.passed === result.total ? "passed" : "failed";
      result.output = `${result.passed}/${result.total} tests passed. Tests establish behavior on these cases, not general correctness or complexity.`;
    }
    result.durationMs = Date.now() - start;
    return result;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function runProjectFilesInternal(files: Record<string, string>): Promise<{
  status: "passed" | "failed" | "error" | "unavailable";
  output: string;
}> {
  const entries = Object.entries(files);
  if (
    entries.some(
      ([p]) =>
        p.startsWith("/") ||
        p.split("/").some((s) => s === ".." || s === "") ||
        p.includes("\\"),
    )
  )
    throw new Error("Unsafe project file path.");
  if (
    entries.length > 300 ||
    entries.reduce((n, [, s]) => n + Buffer.byteLength(s), 0) > 3000000
  )
    throw new Error("Project exceeds the bounded execution snapshot.");
  const pythonTests = entries.some(([p]) => /(^|\/)test[^/]*\.py$/.test(p));
  const jsTests = entries
    .map(([p]) => p)
    .filter(
      (p) =>
        /(?:\.test|\.spec)\.(?:js|mjs|cjs)$/.test(p) ||
        /^test\/.*\.(?:js|mjs|cjs)$/.test(p),
    );
  if (!pythonTests && !jsTests.length)
    return {
      status: "unavailable",
      output:
        "No supported dependency-free Python unittest or Node node:test files were found. Build and dependency installation were not attempted.",
    };
  const capability = await runnerCapability();
  if (!capability.available)
    return { status: "unavailable", output: capability.reason! };
  const work = await realpath(await mkdtemp(join(tmpdir(), "sparr-project-")));
  try {
    const { mkdir } = await import("node:fs/promises");
    for (const [path, content] of entries) {
      await mkdir(dirname(join(work, path)), { recursive: true });
      await writeFile(join(work, path), content, { mode: 0o600 });
    }
    let args: string[];
    let runtime: string;
    if (pythonTests) {
      runtime = pythonPath;
      const bootstrap = join(work, "__sparr_runner__.py");
      await writeFile(
        bootstrap,
        'import sys, unittest, resource\nresource.setrlimit(resource.RLIMIT_CPU,(4,4))\nresource.setrlimit(resource.RLIMIT_FSIZE,(1048576,1048576))\nsys.path.insert(0,".")\nsuite=unittest.defaultTestLoader.discover(".")\nif suite.countTestCases()==0:\n    print("No discoverable unittest cases. Check package imports and test layout."); sys.exit(2)\nresult=unittest.TextTestRunner(verbosity=2).run(suite)\nsys.exit(0 if result.wasSuccessful() else 1)\n',
      );
      args = ["-I", "-S", bootstrap];
    } else {
      runtime = process.execPath;
      args = [
        "--max-old-space-size=128",
        "--test",
        "--test-isolation=none",
        "--test-timeout=4000",
        ...jsTests,
      ];
    }
    const r = await boundedProcess(
      "/usr/bin/sandbox-exec",
      ["-p", sandboxProfile(work), runtime, ...args],
      {
        cwd: work,
        timeout: 6000,
        maxOutput: 32768,
        memoryLimitMb: 256,
        diskLimit: { path: work, bytes: 8000000 },
        env: {
          PATH: "/usr/bin:/bin",
          HOME: work,
          TMPDIR: work,
          OPENSSL_CONF: "/dev/null",
          PYTHONDONTWRITEBYTECODE: "1",
        },
      },
    );
    if (r.timedOut || r.limited)
      return {
        status: "error",
        output: r.timedOut
          ? "Project tests exceeded the 6-second limit."
          : "Project test output exceeded the 32 KB limit.",
      };
    return {
      status: r.code === 0 ? "passed" : "failed",
      output:
        (r.stdout + "\n" + r.stderr).trim() ||
        "The process exited without test output.",
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export async function runCode(...args: Parameters<typeof runCodeInternal>) {
  return executionGate.run(() => runCodeInternal(...args));
}
export async function runProjectFiles(
  ...args: Parameters<typeof runProjectFilesInternal>
) {
  return executionGate.run(() => runProjectFilesInternal(...args));
}
