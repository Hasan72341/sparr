# Verification

## Update: 5 October 2026

After adding editable company preparation templates and fixing the Ollama output contract, the local suite passed **102 unit/integration tests across 14 files** and **44 browser tests (22 each in Chromium and WebKit)**. TypeScript and the production build also passed. The new browser scenario checks template application, custom context, preservation of difficulty/duration/format/attachments, and session persistence after reload.

A real **Ollama 0.35.1 / Qwen2.5 7B Q4_K_M** run on the Apple M3 Mac completed probability and coding interviews. The probability answer matched its reference; the code passed 6/6 cases. Both received structured model feedback and a follow-up, with no Guided fallback, then saved and reloaded their reports. Observed answer-request durations were 7.02 and 8.29 seconds after the connection probe. These include application work and are not cold-start or latency benchmarks.

This found a real adapter issue: `format: "json"` could produce JSON without the required `followup`. Ollama now receives the feedback JSON schema also used by the Claude adapter; runtime validation remains in place. A protocol regression test failed before the fix and passed afterward. `npm run verify:local-model` reproduces the real check in a temporary database without changing normal settings.

Ollama ran on loopback with `OLLAMA_NO_CLOUD=1`; its log confirmed cloud features were disabled and `/api/ps` showed the model loaded into Metal GPU memory. The tested 7B model files occupy about 4.7 GB. This demonstrates local inference for these runs, not an independent network audit. An earlier 1.5B model returned incorrect coding advice despite passing the integration check; it is not the suggested default. The 7B model also made an unnecessary observation about decimal notation and misstated the margin change in the finance demo follow-up. Passing the integration check is not a reasoning-quality benchmark. See [local-model details](local-model.md).

A second prompt fix excludes canned Guided judgments from the model input while preserving a trusted instruction for follow-up scenarios. Provider-contract and controller-integration tests verify that the original answer is not regraded against a changed assumption. A discussion-feedback regression also ensures a successful model response no longer tells the candidate to connect a model. The browser demo uses the real 7B model for coding and a financial-model discussion, with synthetic candidate data.

The [remote macOS verification run](https://github.com/Hasan72341/sparr/actions/runs/37232628940) passed for source commit `0ba5a0a` on the `macos-15` runner with Node 24 and Python 3.12. It covers clean dependency installation, typecheck, all unit/integration tests, production build, native build/self-checks, Chromium and WebKit journeys, and dependency audit. The first remote run exposed a test that used a development-machine home path; the fixed test creates and cleans up its own synthetic host file and requires permission denial from both Python and JavaScript.

The earlier checks below remain dated to their original runs. The maintainer's physical-device result is recorded separately below.

## Physical-device validation

On **5 October 2026**, the maintainer reported that physical-device validation **passed**. Device and software versions, per-scenario results, and logs were not included in that report. This records the maintainer's result separately from the automated and VM checks; broader compatibility coverage remains in [the roadmap](roadmap.md).

## Local environment: 4 October 2026

Local checks were run on **4 October 2026**, on Apple silicon with macOS 26.6.1, Node 26.7, Python 3.14, and Swift 6.3.3. This is the tested environment, not a compatibility matrix for all Macs.

## Automated checks

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| Unit/integration tests | 97 passed across 14 files |
| Production build | Passed |
| Browser tests | 42 passed: 21 each in Chromium and WebKit |
| Dependency audit | No known vulnerabilities reported at the time of the check |
| Swift observer and guardian | Built and signature checked; 54 guardian self-checks passed, without capture |

Coverage includes session persistence, answer retries, adaptive selection, timer expiry during model requests, stale drafts and bootstrap responses after deletion, deletion during pending uploads, worker shutdown, and strict admission/enforcement. Strict tests cover wrong configuration keys, cookie binding, heartbeat replay/expiry, device and VM failures, face grace periods, admission races, storage failures, server restart, and late provider results after termination. Runner tests execute Python/JavaScript reference solutions and check host-file denial, network denial, timeouts, and project test execution.

Parser tests use PDF, DOCX, XLSX, CSV, and notebook fixtures. Browser tests cover resume review, code/numeric answers, follow-ups, all track categories, company/stage settings, financial-model discussion, reports, export/deletion, mobile navigation, and camera permission/release behavior, SEB configuration downloads, preserved setup across independent browser contexts, and expired-link recovery. Automated media tests use controlled streams; they do not test physical hardware.

SEB backend checks cover nested gzip/plist encoding, practice-only input, localhost URL validation, cross-origin rejection, forwarding-header isolation, expiry, bounded handoff storage, deletion, and restart invalidation. The generated profile explicitly deactivates SEB’s preset restrictions on Terminal and iTerm2 so the local server can stay running. An empty prohibited-app array does not remove SEB’s presets.

At the time of the 4 October local checks, the remote GitHub Actions run had not yet been verified. The 5 October update above records the successful remote run.

## Local application checks

- Started, stopped, and restarted the app through `Sparr.command`; checked that stopping it closes the listener.
- Imported a public GitHub repository, inspected its source, and started a project interview. Unsupported project test layouts report a limitation rather than a pass.
- Used the installed, authenticated Claude Code from a browser interview. The Python submission passed 6/6 cases, feedback and a follow-up returned, and the report persisted. The synthetic session was removed from the main workspace afterward.
- Inspected the overview, setup, and interview at desktop and narrow widths. Screenshots in [screenshots/](screenshots/) use synthetic or empty workspace data.
- After the copy cleanup, checked seven pages at 390px width without horizontal overflow or page errors. A live Claude Code response accepted a correct informal probability explanation and asked about a changed assumption; provider contract tests also passed.

## SEB integration

The existing `mac-vm` guest ran macOS 26.6.2 and SEB **3.7 (1591F)**. Sparr and Claude Code ran on the host through a localhost reverse SSH tunnel. The final setup uses no additional VM image or snapshot.

| Check | Observation |
| --- | --- |
| SEB API | JavaScript API and Config Key / Browser Exam Key values present; key values were not logged |
| Code and model | Two-sum passed 6/6; a later sliding-window check passed 4/4, with real Claude Code feedback and a completed report |
| Media | One video and one audio track acquired; both reached `ended` after release; no recording |
| Workspace | The React application rendered inside SEB |
| Exit | Session/report saved before the quit URL was invoked; SEB exited without a confirmation dialog |
| Strict admission at that stage | Direct strict creation returned HTTP 409; strict enforcement was implemented afterward |

Two integration issues were fixed during this run: SEB 3.7 required its current media-capture setting names, and repeated coding checks needed to select a fixture matching the adapted question. Logs are stored under `.data/seb-lab`; the [lab guide](seb-vm-lab.md) documents the procedure. The [SEB screenshot](screenshots/seb-vm.png) records that run before the later interface copy cleanup.

This lab permits a VM, application switching, screen sharing, and remote automation. It checks integration and normal session completion. It does **not** verify key authentication, VM rejection, device enforcement, or invalidation on an integrity violation. No SEB lockdown was launched on the host.

## Site-generated SEB link

The Practice screen generated a fresh `seb://` link against the isolated lab workspace. Opening that URL in the existing `suoer-vm` launched SEB 3.7, downloaded the configuration, and opened the React setup page. The finance track, company, difficulty, duration, and configured Claude Code provider carried into the session created by **Start practice** inside SEB.

A finance answer entered and submitted through SEB matched the numeric reference and received live Claude Code interpretation from the host. The guest Terminal process kept the same PID across startup after explicitly deactivating SEB's preset Terminal restriction. The matching iTerm2 exception is generated and covered by configuration tests, but iTerm2 itself was not exercised. The four new browser scenarios also passed again after this correction.

The check used the existing VM and a local reverse SSH tunnel, without another image or snapshot. The [launch-control screenshot](screenshots/seb-launch.png) shows the web UI; it is not a native SEB screenshot. Browser permission prompts and physical-host SEB startup vary by installation and were not tested on the host.

## Strict enforcement checks

The new controller has 28 tests; strict SEB configuration has 11. Browser tests exercise consent and blocked preflight, admission, cookie-bound reload, draft preservation after additional-display/additional-camera/capture failures, normal completion, and emergency exit with a hung cancellation request. These tests use explicit native and SEB API fixtures with the real controller, persistence, and UI. They do not claim to identify physical devices.

Native self-checks cover device/process classification, SEB identity and version validation, watchdog decisions, and bounded exit decisions including slow signature validation. Host `--inspect` observed one display and three cameras without capture. That hardware configuration is correctly ineligible for strict admission.

### Real SEB and guardian checks in the existing VM

SEB 3.7 loaded the strict laboratory configuration and supplied a Config Key matching the generated settings. Admission succeeded and browser heartbeats kept the session active. An answer typed in SEB was saved; injecting a synthetic second camera then terminated the attempt, preserved that draft and the policy event, and caused the actual SEB process to exit through its quit URL.

Separately, the real guardian's inspection in the guest reported `virtualMachine: true` and `physicalCamera: false`, both admission blockers. It verified the installed SEB signature and original process start time. Its `--exit-seb` recovery command closed that exact SEB process; a subsequent process check confirmed it was absent. Inspection and recovery did not request camera or microphone permissions or start capture.

This run found a real browser integration bug: waiting for the legacy `updateKeys` callback timed out although modern SEB had already populated the key. The client now reads the current page's key directly, with a bounded readiness wait. Four regression tests cover this behavior. See [SEB's Config Key API](https://safeexambrowser.org/developer/seb-config-key.html).

The lab uses synthetic clean native observations for admission and permits the VM. It proves the actual key handoff and violation-to-quit flow, not admission of a physical Mac. The real native VM observation was evaluated separately. No new image or snapshot was created; SEB, the tunnel, laboratory server, and VM were stopped afterward.

## Untested or incomplete

- Broader physical-device compatibility and recorded scenario coverage beyond the maintainer-reported pass. Record additional-camera/display hot-plug, face/audio processing, prohibited-process handling, and recovery results with their hardware and software versions.
- Signed/notarized distribution and support across macOS/hardware/SEB combinations.
- Codex isolation. Ollama has the live-model check described above; other model sizes and hosted compatible providers remain unverified. Adapter fixture tests do not establish their quality or compatibility.
- Private repositories, arbitrary dependency installation/application startup, notebook execution, and spreadsheet recalculation.
- Windows support, which follows macOS. Linux is not planned.

These limits are tracked in [the roadmap](roadmap.md). They are not resolved by the passing local test suite.
