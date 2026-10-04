import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { SebLaunch, PracticeOptions } from "../shared/types.js";
import { HttpError } from "./interviews.js";

// Temporary handoffs, not sessions or evidence of SEB admission.
export class SebLaunches {
  private launches = new Map<string, SebLaunch>();

  constructor(private now: () => number = Date.now) {}

  private prune() {
    for (const [id, launch] of this.launches)
      if (Date.parse(launch.expiresAt) <= this.now()) this.launches.delete(id);
  }

  create(options: PracticeOptions, origin: string): SebLaunch {
    this.prune();
    if (this.launches.size >= 50)
      throw new HttpError(
        429,
        "Too many SEB links. Wait for an existing link to expire.",
      );
    const id = randomUUID();
    const configUrl = `${origin}/api/seb/launches/${id}/config.seb`;
    const launch: SebLaunch = {
      id,
      options,
      expiresAt: new Date(this.now() + 30 * 60 * 1000).toISOString(),
      configUrl,
      launchUrl: configUrl
        .replace(/^http:/, "seb:")
        .replace(/^https:/, "sebs:"),
      startUrl: `${origin}/practice?seb=${id}`,
    };
    this.launches.set(id, launch);
    return launch;
  }

  get(id: string) {
    this.prune();
    const launch = this.launches.get(id);
    if (!launch)
      throw new HttpError(
        404,
        "This SEB link expired or Sparr restarted. Generate a new link from Practice.",
      );
    return launch;
  }

  clear() {
    this.launches.clear();
  }
}

// Used only with a request's direct Host/protocol, never forwarded headers or
// caller-supplied start URLs. This application serves one local workspace.
export function localSebOrigin(protocol: string, host: string): string {
  if (
    !/^(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/.test(host) ||
    !["http", "https"].includes(protocol)
  )
    throw new HttpError(403, "SEB links require a localhost address.");
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    throw new HttpError(400, "Invalid local server address.");
  }
}

export type PlistValue =
  string | number | boolean | PlistValue[] | { [key: string]: PlistValue };

export function encodeSebConfig(settings: Record<string, PlistValue>) {
  const escape = (s: string) =>
    s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const encode = (value: PlistValue): string => {
    if (Array.isArray(value))
      return `<array>${value.map(encode).join("")}</array>`;
    if (typeof value === "boolean") return `<${value}/>`;
    if (typeof value === "number") return `<integer>${value}</integer>`;
    if (typeof value === "string") return `<string>${escape(value)}</string>`;
    return `<dict>${Object.entries(value)
      .map(([key, item]) => `<key>${escape(key)}</key>${encode(item)}`)
      .join("")}</dict>`;
  };
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0">' +
    encode(settings) +
    "</plist>";
  // SEB's unencrypted format: gzip('plnd' + gzip(XML plist)). Practice only.
  return gzipSync(Buffer.concat([Buffer.from("plnd"), gzipSync(xml)]));
}

export function practiceSebConfig(startUrl: string) {
  return encodeSebConfig({
    startURL: startUrl,
    sebConfigPurpose: 0,
    allowQuit: true,
    hashedAdminPassword: "",
    hashedQuitPassword: "",
    allowPreferencesWindow: true,
    allowSwitchToApplications: true,
    // SEB merges its preset list even when this array is empty. Explicitly
    // deactivate the preset terminal entries so Sparr's host stays running.
    prohibitedProcesses: [
      {
        active: false,
        executable: "Terminal",
        identifier: "com.apple.Terminal",
        os: 0,
      },
      {
        active: false,
        executable: "iTerm2",
        identifier: "com.googlecode.iterm2",
        os: 0,
      },
    ],
    allowVirtualMachine: true,
    allowScreenSharing: true,
    screenSharingMacEnforceBlocked: false,
    allowScreenCapture: true,
    allowWindowCapture: true,
    blockScreenShotsLegacy: false,
    detectAccessibilityApps: false,
    detectStoppedProcess: false,
    enableAppSwitcherCheck: false,
    allowDisplayMirroring: true,
    allowedDisplaysMaxNumber: 10,
    allowedDisplayBuiltinEnforce: false,
    browserMediaCaptureMicrophone: true,
    browserMediaCaptureCamera: true,
    allowDownloads: true,
    allowUploads: true,
    enableJavaScript: true,
    browserWindowWebView: 3,
    enableBrowserWindowToolbar: true,
    browserWindowAllowReload: true,
    browserWindowAllowAddressBar: false,
    allowBrowsingBackForward: true,
    URLFilterEnable: false,
  });
}
