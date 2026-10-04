import { expect, it } from "vitest";
import { gunzipSync } from "node:zlib";
import { encodeSebConfig } from "../src/server/seb";
import {
  sebConfigKey,
  sebPageHash,
  strictSebSettings,
} from "../src/server/strict-seb";

const origin = "http://127.0.0.1:4318";
const startUrl = `${origin}/strict/8f098f62-36a5-40f0-9b97-9a4cf2d981c2`;
const input = { origin, startUrl, quitUrl: `${startUrl}/quit` };

it("matches an independently hashed primary-source plist fixture", () => {
  // Moodle's simpleunencrypted.seb fixture, date already converted to ISO8601:
  // https://github.com/moodle/moodle/blob/main/public/mod/quiz/accessrule/seb/tests/fixtures/simpleunencrypted.seb
  // Expected SHA256 was computed with Python hashlib over the manually ordered
  // SEB-JSON, independently of this implementation (no originatorVersion).
  expect(
    sebConfigKey({
      aaaaaa: "1940-10-09T22:13:56Z",
      originatorVersion: "SEB_Win_2.1.1",
      startURL: "https://safeexambrowser.org/start",
      startResource: "",
      sebServerURL: "",
      hashedAdminPassword: "",
      allowQuit: true,
      ignoreExitKeys: true,
      allowUserAppFolderInstall: false,
      allowSiri: false,
      allowDictation: false,
      detectStoppedProcess: true,
      allowDisplayMirroring: false,
      allowedDisplaysMaxNumber: 1,
      allowedDisplayBuiltin: true,
    }),
  ).toBe("9e5b8d83ef8be09976c5826625e59334c47f7c70b063a675c0f143474dcf435a");
});

it("sorts nested keys without escaping SEB-JSON strings or retaining empty dictionaries", () => {
  // Hand-ordered SEB-JSON hashed independently with Python hashlib. Literal
  // quotes, backslashes and UTF8 are intentional: JSON.stringify is not SEB-JSON.
  const fixture = {
    URLFilterRules: [
      {
        regex: true,
        expression: '^https?://127\\.0\\.0\\.1/"x"$',
        active: true,
        action: 1,
      },
    ],
    startURL: "http://localhost:4318/é",
    nested: { Z: false, a: 2, empty: {} },
    originatorVersion: "irrelevant",
    unused: {},
    allowQuit: true,
  };
  const original = structuredClone(fixture);
  expect(sebConfigKey(fixture)).toBe(
    "a05be4650c6079bb812797ec756db73a74a1142430e94bbafedf56a7079eb89c",
  );
  expect(fixture).toEqual(original);
  expect(sebConfigKey({ ...fixture, originatorVersion: "new version" })).toBe(
    "a05be4650c6079bb812797ec756db73a74a1142430e94bbafedf56a7079eb89c",
  );
});

it("binds the Config Key to the exact page URL, retaining query encoding but removing fragments", () => {
  const key =
    "abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd";
  const page = "http://localhost:4318/strict/17?x=1%20two&y=%2F";
  // Independently: hashlib.sha256((page + key).encode()).hexdigest().
  const expected =
    "d1cb8338dfb57074e09850cb1559e65041fc8f9502cdfd22da02607184173f23";
  expect(sebPageHash(page, key)).toBe(expected);
  expect(sebPageHash(`${page}#editor`, key)).toBe(expected);
  expect(sebPageHash(page.replace("/17?", "/18?"), key)).not.toBe(expected);
  expect(sebPageHash(page.replace("%2F", "%2f"), key)).not.toBe(expected);
  expect(() => sebPageHash(page, "forged")).toThrow();
});

it("generates an encodable kiosk policy without browser capture or candidate application access", () => {
  const settings = strictSebSettings(input);
  expect(settings).toMatchObject({
    startURL: startUrl,
    quitURL: `${startUrl}/quit`,
    quitURLConfirm: false,
    quitURLRestart: false,
    sebConfigPurpose: 0,
    browserWindowWebView: 3,
    lockdownModePolicy: 1,
    allowVirtualMachine: false,
    allowScreenSharing: false,
    screenSharingMacEnforceBlocked: true,
    allowScreenCapture: false,
    allowWindowCapture: false,
    blockScreenShotsLegacy: true,
    browserMediaCaptureScreen: false,
    allowDisplayMirroring: false,
    allowedDisplaysMaxNumber: 1,
    allowedDisplaysIgnoreFailure: false,
    allowPreferencesWindow: false,
    allowDeveloperConsole: false,
    allowSwitchToApplications: false,
    browserMediaCaptureCamera: false,
    browserMediaCaptureMicrophone: false,
    allowDownloads: false,
    allowUploads: false,
    downloadAndOpenSebConfig: false,
    newBrowserWindowByLinkPolicy: 0,
    browserWindowAllowAddressBar: false,
    allowQuit: true,
    hashedQuitPassword: "",
    URLFilterEnable: true,
    URLFilterEnableContentFilter: false,
  });
  const gzipPayload = gunzipSync(encodeSebConfig(settings));
  expect(gzipPayload.subarray(0, 4).toString()).toBe("plnd");
  const xml = gunzipSync(gzipPayload.subarray(4)).toString();
  expect(xml).toContain(`<key>startURL</key><string>${startUrl}</string>`);
  expect(xml).toContain("<key>allowVirtualMachine</key><false/>");
  expect(xml).toContain(
    "<key>allowedDisplaysMaxNumber</key><integer>1</integer>",
  );
  expect(sebConfigKey({ ...settings, allowVirtualMachine: true })).not.toBe(
    sebConfigKey(settings),
  );
  expect(sebConfigKey({ ...settings, allowScreenSharing: true })).not.toBe(
    sebConfigKey(settings),
  );
});

it("keeps the guardian and host terminals running without exposing application switching", () => {
  const settings = strictSebSettings(input);
  expect(settings.autoQuitApplications).toBe(false);
  expect(settings.allowSwitchToApplications).toBe(false);
  expect(settings.prohibitedProcesses).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        active: false,
        os: 0,
        executable: "Terminal",
        identifier: "com.apple.Terminal",
      }),
      expect.objectContaining({
        active: false,
        os: 0,
        executable: "iTerm2",
        identifier: "com.googlecode.iterm2",
      }),
    ]),
  );
  expect(settings.permittedProcesses).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        active: true,
        executable: "sparr-guardian",
        identifier: "dev.sparr.guardian",
        os: 0,
        runInBackground: true,
        iconInTaskbar: false,
        autostart: false,
        allowManualStart: false,
      }),
    ]),
  );
});

it("allows only this launch, its controlled exit and local application resources", () => {
  const settings = strictSebSettings(input);
  const rules = settings.URLFilterRules as {
    action: number;
    active: boolean;
    regex: boolean;
    expression: string;
  }[];
  const allowed = (url: string) =>
    rules.some(
      (rule) =>
        rule.active &&
        rule.action === 1 &&
        rule.regex &&
        new RegExp(rule.expression).test(url),
    );
  for (const path of [
    startUrl,
    `${startUrl}/quit`,
    `${origin}/api/strict/hello`,
    `${origin}/assets/index-123.js`,
    `${origin}/favicon.ico`,
  ])
    expect(allowed(path), path).toBe(true);
  for (const path of [
    "https://example.com/",
    `${origin}/practice`,
    `${origin}/settings`,
    `${origin}/strict/another-launch`,
    `${startUrl}/not-quit`,
    "http://127.0.0.1:9999/assets/index.js",
    "http://127x0x0x1:4318/assets/index.js",
    "http://127.0.0.1:4318.attacker.example/assets/index.js",
    `${origin}/assets/../../settings`,
  ])
    expect(allowed(path), path).toBe(false);
});

it.each([
  { ...input, origin: "https://attacker.example" },
  { ...input, startUrl: "https://attacker.example/strict/id" },
  { ...input, quitUrl: "https://attacker.example/quit" },
  { ...input, startUrl: `${startUrl}?extra=1` },
  { ...input, quitUrl: `${startUrl}/another` },
])("rejects arbitrary handoff URLs: %j", (value) => {
  expect(() => strictSebSettings(value)).toThrow();
});
