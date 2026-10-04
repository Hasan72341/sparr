import { access } from "node:fs/promises";
import { resolve } from "node:path";
import type { Capabilities } from "../shared/types.js";
import { boundedProcess } from "./process.js";
import { guardianAvailable } from "./guardian.js";
import { runnerCapability } from "./runner.js";
export async function getCapabilities(): Promise<Capabilities> {
  const helper = resolve("native/macos/.build/sparr-inspect");
  let native: Capabilities["native"] = {
    available: false,
    notes: ["Build the macOS observation helper with npm run native:build."],
  };
  try {
    await access(helper);
    const r = await boundedProcess(helper, [], { timeout: 5000 });
    if (r.code === 0) {
      const result = JSON.parse(r.stdout);
      native = {
        available: true,
        displays: result.displays,
        cameras: result.cameras,
        notes: [
          "Device inventory only. Strict sessions use the separate consent-based guardian for continuous capture and enforcement.",
        ],
      };
    }
  } catch {}
  return {
    platform: process.platform,
    runner: await runnerCapability(),
    native,
    strict: {
      available: guardianAvailable(),
      reasons: guardianAvailable()
        ? [
            "Strict admission requires the built-in camera, microphone permissions, a single display, and signed SEB on this Mac. Device preflight runs after consent.",
          ]
        : [
            "Build the macOS guardian with npm run native:build. Strict sessions also require SEB 3.7 or newer on the same Mac.",
          ],
    },
    providers: [
      { id: "guided", available: true },
      {
        id: "ollama",
        available: true,
        reason: "Requires a running local Ollama server and installed model.",
      },
      {
        id: "openai-compatible",
        available: true,
        reason:
          "Requires a compatible endpoint, model, and optional SPARR_MODEL_API_KEY.",
      },
      {
        id: "claude",
        available:
          (await boundedProcess("/usr/bin/which", ["claude"])).code === 0,
        reason:
          "Requires a signed-in Claude Code with restricted mode. All tools and customizations are disabled.",
      },
      {
        id: "codex",
        available: false,
        reason: "Unavailable until its tool isolation is validated.",
      },
    ],
  };
}
