import { createHash } from "node:crypto";
import { localSebOrigin, type PlistValue } from "./seb.js";

const regexEscape = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Settings and enum values are from SEB macOS 3.7 SEBSettings.m / Constants.h:
// https://github.com/SafeExamBrowser/seb-mac/tree/3.7/Classes/ConfigFiles
// Classic kiosk keeps the separate guardian and local provider alive. Native
// foreground/process monitoring complements SEB's application-switching block.
export function strictSebSettings({
  startUrl,
  quitUrl,
  origin,
}: {
  startUrl: string;
  quitUrl: string;
  origin: string;
}): Record<string, PlistValue> {
  const base = new URL(origin);
  const start = new URL(startUrl);
  if (
    origin !== localSebOrigin(base.protocol.slice(0, -1), base.host) ||
    startUrl !== `${origin}${start.pathname}` ||
    !/^\/strict\/[A-Za-z0-9_-]+$/.test(start.pathname) ||
    quitUrl !== `${startUrl}/quit`
  )
    throw new Error("Strict SEB requires a fixed local launch and quit URL.");

  const filter = (expression: string) => ({
    action: 1,
    active: true,
    regex: true,
    expression,
  });
  return {
    startURL: startUrl,
    quitURL: quitUrl,
    quitURLConfirm: false,
    quitURLRestart: false,
    sebConfigPurpose: 0,
    lockdownModePolicy: 1,
    allowQuit: true,
    hashedAdminPassword: "",
    hashedQuitPassword: "",
    allowPreferencesWindow: false,
    allowDeveloperConsole: false,
    allowSwitchToApplications: false,
    autoQuitApplications: false,
    // These are otherwise active SEB presets even when the array is empty.
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
    permittedProcesses: [
      {
        active: true,
        executable: "sparr-guardian",
        identifier: "dev.sparr.guardian",
        os: 0,
        runInBackground: true,
        iconInTaskbar: false,
        autostart: false,
        allowManualStart: false,
        allowUserToChooseApp: false,
        allowNetworkAccess: false,
        allowAccessibility: false,
        strongKill: false,
      },
    ],
    allowVirtualMachine: false,
    allowScreenSharing: false,
    screenSharingMacEnforceBlocked: true,
    allowScreenCapture: false,
    allowWindowCapture: false,
    blockScreenShotsLegacy: true,
    allowDisplayMirroring: false,
    allowedDisplaysMaxNumber: 1,
    allowedDisplaysIgnoreFailure: false,
    allowedDisplayBuiltin: true,
    allowedDisplayBuiltinEnforce: true,
    allowedDisplayBuiltinExceptDesktop: true,
    detectAccessibilityApps: true,
    detectStoppedProcess: true,
    enableAppSwitcherCheck: true,
    browserMediaCaptureCamera: false,
    browserMediaCaptureMicrophone: false,
    browserMediaCaptureScreen: false,
    allowDownloads: false,
    allowUploads: false,
    allowDownUploads: false,
    allowOpenAndSavePanel: false,
    allowShareSheet: false,
    allowPrint: false,
    allowSiri: false,
    allowDictation: false,
    allowDictionaryLookup: false,
    allowSpellCheck: false,
    enablePrivateClipboard: true,
    enablePrivateClipboardMacEnforce: true,
    downloadAndOpenSebConfig: false,
    backgroundOpenSEBConfig: false,
    enableJavaScript: true,
    browserWindowWebView: 3,
    sendBrowserExamKey: true,
    enableBrowserWindowToolbar: false,
    browserWindowAllowReload: true,
    browserWindowAllowAddressBar: false,
    allowBrowsingBackForward: false,
    newBrowserWindowByLinkPolicy: 0,
    newBrowserWindowByLinkBlockForeign: true,
    newBrowserWindowAllowAddressBar: false,
    newBrowserWindowNavigation: false,
    blockPopUpWindows: true,
    URLFilterEnable: true,
    // Content filtering forces legacy WebView, disabling the JS Config Key API.
    // The app's CSP additionally restricts subresources to this local origin.
    URLFilterEnableContentFilter: false,
    URLFilterRules: [
      filter(`^${regexEscape(startUrl)}(?:/quit)?(?:#.*)?$`),
      filter(`^${regexEscape(origin)}/api/[A-Za-z0-9_/-]+(?:\\?[^#]*)?$`),
      filter(
        `^${regexEscape(origin)}/assets/[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)+(?:\\?[^#]*)?$`,
      ),
      filter(`^${regexEscape(origin)}/favicon\\.ico$`),
    ],
  };
}

// SEB-JSON is intentionally NOT JSON: strings are wrapped in quotes without
// escaping. Keys are ordinal case-insensitive sorted, including nested objects.
// Only settings present in the generated plist participate, never SEB defaults.
// https://safeexambrowser.org/developer/seb-config-key.html
function sebJson(value: PlistValue): string {
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new Error("Generated SEB settings require safe integer numbers.");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(sebJson).join(",")}]`;
  const keys = Object.keys(value).filter((key) => key !== "originatorVersion");
  keys.sort((a, b) => {
    const lowerA = a.toLowerCase(),
      lowerB = b.toLowerCase();
    return lowerA < lowerB
      ? -1
      : lowerA > lowerB
        ? 1
        : a < b
          ? -1
          : a > b
            ? 1
            : 0;
  });
  return `{${keys
    .flatMap((key) => {
      const item = value[key];
      const encoded = sebJson(item);
      // Empty dictionary values are omitted; array dictionaries retain position.
      return encoded === "{}" ? [] : [`"${key}":${encoded}`];
    })
    .join(",")}}`;
}

export function sebConfigKey(settings: Record<string, PlistValue>): string {
  return createHash("sha256").update(sebJson(settings), "utf8").digest("hex");
}

export function sebPageHash(pageUrl: string, configKey: string): string {
  if (!/^[a-f0-9]{64}$/.test(configKey))
    throw new Error("Invalid SEB Config Key.");
  const url = new URL(pageUrl);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Invalid SEB page URL.");
  // Preserve the browser's exact URL spelling, including query/percent escapes.
  return createHash("sha256")
    .update(pageUrl.split("#", 1)[0] + configKey, "utf8")
    .digest("hex");
}
