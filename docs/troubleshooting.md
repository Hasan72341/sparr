# Troubleshooting

## Startup

**Node version error:** Check `node --version` and `npm --version` in the terminal used to start Sparr. Node 24 or newer is required. Reopen the terminal after installing Node.

**Missing packages or build output:** Run `npm ci` and `npm run build` from the repository, then `npm start`. Keep that terminal open. The default address is `http://127.0.0.1:4318`.

**Port already in use:** Check whether Sparr is already open at that address. Otherwise set `SPARR_PORT` in `.env` to another free port and restart. The browser test suite needs port 4349; the SEB lab defaults to 4352.

**Code runner unavailable:** The runner needs macOS, Python 3, Node, and the macOS sandbox. Check `python3 --version` and the capability message in Settings. Windows and Linux execution are not supported in this release.

## Imports

**Empty or inaccurate resume extraction:** PDF extraction needs a text layer. Use DOCX, TXT, or Markdown if the PDF is scanned. Edit the extracted fields before saving; importing a resume does not save the profile automatically.

**GitHub import fails:** Use a public `https://github.com/owner/repository` URL. Private repositories, non-GitHub hosts, subdirectory URLs, and imports exceeding the limits are not supported.

**Project tests cannot run:** Only dependency-free Python `unittest` and Node `node:test` layouts are supported. A repository can still be used for source discussion when its tests need other runtimes or packages.

**Spreadsheet values look stale:** Sparr reads cached values and formulas; it does not recalculate the workbook. Recalculate and save it in your spreadsheet application before uploading again.

## Feedback providers

Save the provider settings before clicking **Test connection**. Existing sessions keep the settings with which they started; start a new session after changing providers.

- **Claude Code:** Confirm the installed CLI is signed in and supports restricted mode. Model may be blank to use the CLI default. Run Sparr from a terminal that can find the CLI.
- **Ollama:** Start the server and confirm the configured model is installed. Use the service's base URL without `/v1`.
- **Compatible API:** Use an HTTPS URL ending in `/v1`, the provider's model identifier, and `SPARR_MODEL_API_KEY` in `.env` if required. Restart Sparr after changing the environment.
- **Codex:** Disabled in this release; installing it does not enable the adapter.

A failed model request leaves your answer saved and labels the fallback feedback. Guided practice remains available without a model.

## Devices and SEB

The camera/microphone preview in Settings is separate from strict monitoring. Allow browser and macOS permissions when prompted. If a device is busy, close the application using it and retry. Stopping the preview or leaving Settings releases its tracks.

**Strict setup is unavailable:** Install Xcode Command Line Tools and run `npm run native:build` from the repository. This builds both the inventory helper and `native/macos/.build/Sparr Guardian.app`. Reload Sparr afterward. The guardian targets macOS 14 or later; SEB 3.7 or newer must be installed on the same Mac.

**Native SDK/compiler mismatch:** Set `SPARR_MACOS_SDK` to the path of a compatible installed macOS SDK, then rerun `npm run native:build`. This is an ad-hoc local build, not a notarized installer.

**Camera or microphone permission denied:** Cancel strict setup, check the app's access under macOS System Settings → Privacy & Security → Camera/Microphone, then prepare again. Strict setup asks for native access after consent; browser preview permission alone is not sufficient. A rebuilt helper may require access to be granted again. Do not run its default executable manually for diagnosis: that starts capture.

**More than one camera detected:** Disconnect external cameras and disable/disconnect Continuity Camera, Desk View, or virtual camera providers before retrying. A device can appear in macOS discovery without an open preview. Strict mode requires exactly one discovered camera and uses only the built-in wide-angle camera. It does not offer a camera selector. Macs without a built-in camera must use practice mode.

**Extra display or mirroring:** Disconnect the additional display and turn off mirroring or Sidecar before preparing a strict interview. Closing a window on that display does not remove it from the device inventory.

**Blocked application or unavailable capture:** Close recording, remote access, and conferencing apps, including OBS, QuickTime Player, TeamViewer, AnyDesk, Zoom, Teams, or Discord. Close the Settings preview before beginning strict monitoring. Keep the built-in camera uncovered and use adequate lighting. Cancel and prepare again after correcting access or device problems.

**VM status is unknown or a VM is detected:** Strict admission is refused. Use a physical Mac for strict sessions. The [existing-VM lab](seb-vm-lab.md) uses a permissive practice configuration; its successful launch does not validate strict admission or device rejection.

**SEB configuration verification fails:** Quit SEB and prepare a fresh strict launch. Open the strict `.seb` file generated by the current server, not the ordinary practice configuration or an edited settings file. Keep Node, Guardian, and SEB on the same Mac. Check that the official signed SEB release is 3.7 or newer. A VM guest with a host-side server is not a supported strict arrangement.

**The interview ended unexpectedly:** Read the termination reason in Session history. Strict monitoring ends on lost devices, stale native/browser evidence, a blocked application, or a changed/background SEB process. Multiple faces for three seconds or no detected face for fifteen seconds also end the attempt; these events are not a cheating verdict. Correct the issue and start a new session. An invalidated session cannot resume.

**Need to leave SEB immediately:** Choose **End strict attempt** or press **Command-Q**. An unfinished strict session is invalidated and saved work remains available afterward. Normal completion also requests SEB exit. Physical recovery behavior is still subject to the validation limits in [Verification](verification.md).

## SEB does not open from the launch link

Install SEB for macOS, generate a link in Practice, and click Launch Safe Exam Browser. Accept the browser's request to open SEB. If nothing opens, use Download .seb and open the downloaded file in Finder. Quit any existing SEB session before applying a different configuration.

Keep Sparr's terminal running. Practice links expire after 30 minutes; strict setups expire after ten minutes. Both refer to the running local server and become invalid after a server restart or Delete all data. A file downloaded earlier still needs its live handoff. Strict launches also need the original preflight guardian. A different machine is not supported for strict mode; local forwarding is only a practice development arrangement.

Practice links restore company, role, and attachment choices when setup loads. The provider and resume come from the current workspace. If an attachment was deleted after generation, choose a replacement before starting. For strict mode, choose the settings before preparing, keep the setup page open during launch, and prepare again after changing the selection. Command-Q exits either generated configuration; leaving an unfinished strict session invalidates that attempt.
