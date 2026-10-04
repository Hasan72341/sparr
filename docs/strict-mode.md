# Strict interviews on macOS

Strict mode enforces a local interview policy using SEB, Sparr's Node server, and Sparr Guardian on the same Mac. It is intended for self-practice. The machine's owner and administrator are outside the tamper boundary: they can modify the code, stored results, native helper, or OS. This is not a hosted or remotely attested examination service.

The implementation is available as a local source build. It is not a notarized distribution. Automated policy tests and the existing VM lab do not establish physical camera, hot-plug, permission, or recovery behavior on every Mac. See [Verification](verification.md) for completed checks and remaining hardware validation.

## Starting a strict interview

Install SEB 3.7 or newer and build the guardian with `npm run native:build` using Xcode Command Line Tools. The helper targets macOS 14 or newer. Start Sparr, choose interview settings in Practice, read the disclosure, and select **Prepare strict interview** after consenting. This starts native monitoring and may request macOS camera/microphone permissions. The ordinary Settings preview is separate and does not start strict monitoring.

Preflight reports device and capture readiness. It requires one visible face but does not start the interview timer or establish SEB admission. Resolve any displayed reasons, keep the setup page open, and choose **Launch strict SEB** or **Download strict .seb**. Quit any earlier SEB session before opening the new configuration.

Inside SEB, **Start strict interview** performs admission. Sparr compares SEB's page-bound Config Key hash with the generated settings, checks fresh native observations, verifies the official SEB signature/version, and waits for the guardian to bind to that process's PID and original launch time. Only then is a strict session created and its timer started. Direct `POST /api/sessions` requests with `mode: strict` remain rejected.

There can be one strict setup or interview at a time. Unused setups expire after ten minutes. Canceling, changing the prepared selection, leaving the setup page before admission, or clearing workspace data releases preflight monitoring. Reloading the active SEB page resumes the same session using its existing cookie and configuration proof; it does not create another attempt.

## Device and liveness policy

| Observation | Required behavior |
| --- | --- |
| Displays | Exactly one online display reported by macOS; no mirroring. SEB also enables its single-display policy. |
| Cameras | Exactly one discovered camera, with capture from the built-in wide-angle device. External, Continuity, Desk View, and virtual devices are not accepted. A Mac without a built-in camera cannot enter strict mode. |
| Microphone | The default audio input must be available, authorized, and supplying samples. No speech content is assessed. |
| Capture | Camera and microphone remain authorized and running. Each stream's latest sample must be no more than three seconds old. An unavailable face observation fails the check. |
| Native observations | Monotonically increasing snapshots, normally once per second; an observation older than four seconds ends the attempt. Malformed observations, replay, or guardian failure also end it. |
| Browser heartbeat | The admitted client supplies its cookie, configuration proof, and rotating challenge. A heartbeat older than eight seconds ends the attempt. |
| Parent heartbeat | Node pings the guardian every second. After more than six seconds without a ping, or on pipe EOF, the guardian releases media and requests exit of its bound SEB process. |
| SEB | Official signature pinned to the upstream macOS signing identity, version 3.7 or newer, same PID and launch time, and foreground application. A lost or changed binding ends the attempt. |
| Virtual machine | Positive signals from the hypervisor flag, machine model, or virtual-device registry are rejected. Unknown status is also rejected. These checks are not comprehensive VM attestation. |
| Other applications | Known recording, conferencing, and remote-access bundle IDs are blocked. Examples include OBS, QuickTime Player, TeamViewer, AnyDesk, Screen Sharing, Zoom, Teams, and Discord. The maintained list is in `Guardian.swift`; this is not detection of every possible recorder or process. |
| Faces | One face is required at admission. During the interview, continuously observed multiple faces for three seconds, or no detected face for fifteen seconds, end the attempt. A return to one face resets the corresponding grace period. |

Device and process changes take effect when observed; this is sampled monitoring, not instantaneous hardware interception. There is no grace period for an extra camera/display, revoked permission, missing capture, detected VM, prohibited app, or invalid SEB process. Startup is handled by waiting in preflight rather than admitting with incomplete capture evidence.

After a failed heartbeat request, the browser attempts its quit URL when its last successful acknowledgement is more than six seconds old. The server and native watchdog remain independent of that UI action.

## Exit and saved work

On a policy violation, Sparr invalidates the session, preserves saved work, and records the reason and event in the session report. Later answer, code, and provider results cannot reactivate an invalidated attempt. A server restart invalidates any persisted strict session left active. A storage failure may prevent the final event from being written; the controller still blocks the attempt and releases monitoring.

Normal completion saves a report, stops capture, and requests SEB exit. **End strict attempt** ends early. **Command-Q is an emergency escape** and invalidates an unfinished session; no quit password is needed. Review the report from Session history in the ordinary browser afterward.

The browser uses the configured quit URL. The guardian also requests application termination, with a force-termination attempt after about two seconds. Both streaming and standalone fallback paths verify the pinned signature, PID, and original launch time before targeting SEB. They do not terminate arbitrary applications. Independent deadlines bound guardian teardown if capture or signature APIs stall. OS failures can still prevent a clean exit; native deadlines are not a guarantee that every OS operation succeeds.

## Background agent and privacy

The strict configuration uses SEB's classic kiosk mode with app switching disabled. It permits the guardian in the background and disables SEB's default Terminal/iTerm2 prohibitions so the local server and configured provider can keep running. The candidate's code still runs through the separate sandbox. Providers do not receive the guardian's media or control its policy.

Camera frames and microphone samples are processed in memory and discarded. Vision counts faces locally; there is no recording, transcription, face identity recognition, gaze tracking, emotion inference, or analysis of speech content. The server keeps the latest observation in memory and retains admission/termination events with the session. Observations are reasons for ending a practice attempt, not a cheating verdict.

## Admission boundary

The downloaded configuration is unencrypted. Its Config Key is derived from settings and is not a secret or proof of an untampered client. Sparr combines that consistency check with local signed-SEB observations, a session cookie, and rotating browser challenges. It does not validate an allowlisted Browser Exam Key, authenticate a remote candidate, or cryptographically attest which process owns an HTTP connection.

Keep Node, Guardian, and SEB on one physical Mac. The presence of a signed local SEB process is required; hardware on a server cannot describe a remote candidate's environment. Forwarded connections and the permissive VM lab are development tools for practice, not supported strict deployments.

## Implementation

- `native/macos/Guardian.swift`: device/capture observations, signature and process identity checks, parent watchdog, bounded exit.
- `src/server/guardian.ts`: private pipe protocol, snapshot validation, parent pings, process-exit fallback.
- `src/server/strict-seb.ts`: strict SEB settings and Config Key hashing.
- `src/server/strict.ts`: preflight, single-use admission, session binding, continuous policy, and termination.
- `src/client/strict.tsx`: disclosure, consent, launch, heartbeat, emergency end, and quit navigation.

The native stdin protocol accepts `ping`, `arm` with `pid` and `startedAt` (Unix epoch seconds), `stop`, and `exit-seb`. Each stdout snapshot includes a sequence number and `armedPid`; neither pipe is an HTTP endpoint. `--inspect` reports inventory without requesting access or starting capture. `--self-test` exercises pure validation and lifecycle decisions without devices. The standalone `--exit-seb PID STARTED_AT` path requires the original process identity and revalidates it before exit.
