# SEB integration in the existing mac-vm

This lab runs Safe Exam Browser in an existing macOS VM while Sparr, the code runner, and Claude Code run on the host. It uses no cloned VM, snapshot, or extra OS image. The normal workspace at port 4318 is unaffected; lab sessions use `.data/seb-lab/app-data` on port 4352.

**This is a development configuration. It explicitly permits a VM, application switching, screen sharing, and remote automation. It does not verify strict admission, VM rejection, proctoring, or device policy enforcement.** Reference solutions are available to the lab harness. These routes and exceptions are absent from `npm start`, and strict sessions remain rejected by both servers.

## Prerequisites

- Complete the normal macOS setup and `npm run build`.
- Install and authenticate Claude Code on the host; confirm the provider works in Sparr Settings. Clicking the coding check invokes the real provider and may consume account usage.
- Have an existing macOS VM with SEB installed, a logged-in desktop, and SSH key access. The local verification used the existing `mac-vm` wrapper, VM `suoer-vm`, guest user `hasan`, and SEB 3.7 (1591F). `mac-vm` is an external local tool, not bundled with Sparr.
- The guest needs its own available camera/microphone or an explicitly configured media relay. SEB and macOS media permissions must allow access. No media is recorded by this lab.

## Run

Start the existing VM with `mac-vm start --detach` if it is stopped. Use `mac-vm status` and `mac-vm ip` to obtain its current state and address. Do not use clone, snapshot, or disposable commands for this workflow.

In a host terminal, from the repository:

```bash
npm run test:seb:lab
```

The command generates `.data/seb-lab/sparr-lab.seb` and prints a unique JSONL results path. It selects Claude Code for the isolated lab workspace. `SPARR_SEB_LAB_PORT` can change the port; update the forwarding command to match.

In a second host terminal, substitute your actual SSH key, guest user, and the address reported by `mac-vm ip`:

```bash
ssh -i /path/to/guest-key -o ExitOnForwardFailure=yes \
  -N -R 127.0.0.1:4352:127.0.0.1:4352 guest-user@guest-ip
```

Keep this terminal open. Verify the SSH host identity when connecting for the first time. This reverse tunnel makes guest localhost reach the host's localhost service without a LAN listener or copying model credentials into the VM.

From another host terminal:

```bash
scp -i /path/to/guest-key .data/seb-lab/sparr-lab.seb guest-user@guest-ip:/tmp/sparr-lab.seb
ssh -i /path/to/guest-key guest-user@guest-ip 'open /tmp/sparr-lab.seb'
```

Finish an existing SEB session before opening a replacement configuration. SEB blocks configuration replacement during an exam; the lab does not circumvent that protection.

## Exercise the integration

1. The lab page records SEB's JavaScript API, version, and the presence of Browser Exam Key and Config Key values. It does not store the keys or claim to authenticate them.
2. **Run coding-agent check** starts a timed SWE practice exercise, selects its matching reviewed Python implementation, executes its tests, requests real Claude Code feedback and a follow-up, then saves the report. Repeat runs may select a different exercise through adaptation. The check reports failure if tests or the provider fail; fallback feedback alone is not a pass.
3. **Check camera and microphone** acquires one video and one audio stream, reports track counts, immediately stops the tracks, and records their final states. This checks media access and release, not picture/audio quality or suspicious behavior.
4. **Open Sparr workspace** displays the actual React application with the isolated lab database. Use SEB's back navigation to return to the lab; the exit polling below is active only on the lab page.
5. **Finish and exit SEB** finishes the lab-created session, saves an exit-request event, and navigates to the configured quit URL. The configuration requests exit without a confirmation dialog.

The host can request the same controlled exit while the lab page is open:

```bash
curl -fsS -X POST -H 'X-Sparr-Client: web' http://127.0.0.1:4352/__seb_lab/quit
```

Check that the guest SEB process has ended, and inspect the JSONL events plus the saved report. This normal completed-session exit is not the production requirement to invalidate a session on a confirmed integrity violation.

After testing, close the SSH tunnel and stop the lab with Control-C. Stop `mac-vm` if it was started only for this test. The normal Sparr server can keep running. Logs, lab data, and the generated configuration are ignored by Git; no VM password belongs in repository files or configuration.

## Format and compatibility

The generated file uses SEB's documented `plnd` configuration envelope. For SEB 3.7, media access uses `browserMediaCaptureCamera` and `browserMediaCaptureMicrophone`; the older `allowVideoCapture`/`allowAudioCapture` settings have been removed. Modern WebView selection enables SEB's JavaScript API. Refer to the [SEB file format](https://safeexambrowser.org/developer/seb-file-format.html), [browser integration documentation](https://safeexambrowser.org/developer/seb-integration.html), and [SEB 3.7 settings source](https://github.com/SafeExamBrowser/seb-mac/blob/3.7/Classes/ConfigFiles/SEBSettings.m).

Actual observations and remaining production gates are recorded in [verification.md](verification.md). Windows support will be added after macOS; this lab does not establish Windows compatibility.

## Check the site's generated launch link

With the lab server running and its port forwarded into the existing VM, open `/practice` in the host browser. Choose options and select **Generate SEB link**. The new `seb://127.0.0.1:4352/api/seb/launches/:id/config.seb` URL refers to the ordinary application endpoint; the lab server supplies a separate workspace for the check.

Quit any existing SEB session, then open the generated link inside the guest (for example, `open 'seb://…'` over the existing SSH connection). Check that the setup retains the selections, that **Start practice** creates the session only then, and that the configured provider responds through the host server. Start Terminal before launching SEB and confirm that the same process survives. The practice configuration explicitly deactivates the preset Terminal and iTerm2 restrictions; an empty prohibited-app list is insufficient because SEB merges its built-in presets.

This check requires no additional VM image or snapshot. It tests URL registration, configuration decoding, and the site's handoff, not strict exam admission. Quit SEB, close the forwarding connection, and stop the VM when done. See [SEB’s documentation on preset processes](https://safeexambrowser.org/macosx/mac_usermanual_en.html).

## Strict controller laboratory

`npm run test:strict:lab` starts a separate server on port **4353**, with a new data directory under `.data/strict-lab` and a generated `sparr-strict-lab.seb`. It uses the production strict controller and React page with **synthetic native observations**. Its configuration permits a VM and remote automation. Neither this server nor its telemetry/proof endpoints are part of `npm start`.

Forward port 4353 into the existing guest using the same SSH procedure above, then open the generated file in guest SEB. Start the interview using the page's **Start strict interview** button. Admission checks the Config Key supplied by the real SEB JavaScript API against the key calculated from the transmitted settings. The lab's `GET /__strict_lab/status` reports the current attempt and synthetic guardian events. It also exposes a fixture proof for automated browser tests; that value is not a secret or a production endpoint.

After saving an answer draft, inject a device observation:

```bash
curl -fsS -X POST -H 'Content-Type: application/json' \
  -H 'X-Sparr-Client: web' -d '{"kind":"camera"}' \
  http://127.0.0.1:4353/__strict_lab/violation
```

Supported fixtures are `camera`, `display`, `capture`, `vm`, and `face`. Check that the stored attempt is terminated, its existing draft is preserved, and SEB visits its quit URL. Native force-exit calls are recorded as simulated events here. They do not kill host applications. `POST /__strict_lab/prepare` ends the previous attempt and writes a fresh config for the next test. Stop with Control-C to save `latest-results.json` and release the lab.

Playwright starts the same laboratory on port **4354** for Chromium/WebKit tests, where the SEB JavaScript API is also a fixture. These browser tests prove controller/UI integration, not that an ordinary browser is trusted. Real device discovery, capture, physical hot-plug, and native forced termination require separate tests on the supported Mac or guest. Never admit a candidate from this lab or describe its synthetic admission as a hardware validation.
