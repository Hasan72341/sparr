# Security and deployment boundaries

Sparr runs for one user on a local Mac. There is no multi-user authentication, TLS termination, tenant isolation, or hosted deployment configuration. The server binds to 127.0.0.1, validates Host, rejects foreign-origin mutations, requires a custom request header, and sets no-store response headers for API data. Do not expose it on a public address. The SEB lab's localhost SSH tunnel is limited to a trusted test guest.

## Execution

Python and JavaScript run in disposable directories under macOS sandbox-exec with home-file content access, network access, and process creation denied. Runtime library reads and writes to the temporary workspace are permitted. Candidate environment variables exclude agent credentials. Time, output, per-process-group RSS, and workspace size are bounded. RSS and directory checks are sampled every 100 ms; these are practice safeguards, not hard kernel memory/disk quotas or a multi-tenant execution guarantee. macOS sandbox-exec is a legacy platform dependency and requires validation on each supported OS.

Hidden tests are hidden from the candidate-facing API, not cryptographically protected from a user administering the host. Test harnesses and local assessments cannot provide a tamper-proof examination service. General complexity and mathematical proofs require explanation, not just tests.

Public GitHub imports disable hooks, credential helpers, system/global Git configuration, redirects, and checkout. Imports have time, output, disk, and memory bounds. Only regular source files from the recorded commit are inspected; symlinks, known secret files, dependency trees, and oversized files are excluded. This filter cannot guarantee that a public repository contains no secrets. No project dependencies are installed on the host.

Resume and project-document parsing run in separate bounded processes under the macOS sandbox. DOCX/XLSX declared ZIP expansion, upload size, PDF page count, time, output, and memory are limited. No OCR is provided. Notebook outputs are ignored; notebook cells, spreadsheet formulas, macros, and external links are never executed. Spreadsheet cached values are unverified. Resume extraction is a suggestion that requires candidate confirmation. Raw uploaded files are not retained; extracted profile text or document excerpts are saved. Deleting a document removes its shelf record; existing interview questions keep their cited excerpts until those sessions are deleted.

## Model boundaries

Guided mode sends nothing to a model. Ollama and compatible APIs receive only supplied interview context through bounded requests and return a validated feedback schema; responses do not execute tools or alter session rules. Remote APIs require HTTPS. Claude Code runs in a temporary directory in safe/restricted mode with all built-in tools, customizations, skills, hooks, and MCP configuration disabled. It retains its trusted authentication environment. Codex remains unavailable until an equivalently verified boundary exists.

Repository instructions, document excerpts, job descriptions, and candidate text are untrusted evidence. AI feedback is labelled interpretation and cannot overwrite deterministic numeric/test observations. Models may still produce mistaken interpretations; reports retain the underlying evidence.

## Integrity and privacy

Strict interviews use a separate native guardian after explicit consent. Node, Guardian, and SEB must run on the same physical Mac. Admission requires the matching SEB configuration hash, a fresh valid native observation, one visible face, and an acknowledgement that the guardian bound to the signed SEB process's PID and launch time. The configuration restricts app switching, navigation, screen sharing/capture, additional displays, and VMs. Its classic kiosk mode allows the background server/provider workflow.

The guardian checks one display without mirroring, exactly one built-in camera, camera/microphone authorization and capture health, known prohibited applications, VM signals, and the bound foreground SEB process. Native snapshots expire after four seconds; browser liveness expires after eight seconds. The parent watchdog acts after six seconds without a ping or on pipe EOF. Multiple faces for three seconds or no detected face for fifteen seconds ends the attempt. Unknown VM status, malformed observations, unavailable capture, or a lost SEB binding fails the policy. The complete thresholds are in [Strict interviews](strict-mode.md).

On invalidation, the controller blocks the attempt and persists the reason before requesting SEB exit. Late operations cannot restore it. Native exit paths verify the original PID, launch time, signature, and supported SEB version before targeting the application. If a storage write fails, native shutdown still runs and the attempt remains blocked in the controller; the final event may not be on disk. Command-Q remains available as an emergency exit and invalidates an unfinished attempt.

Frames and audio samples stay in guardian memory and are discarded after processing. Only device/capture status and a local Vision face count cross the private stdout pipe. Raw media is never recorded, uploaded, transcribed, or sent to a provider. Latest observations live in server memory; admission and termination events are retained with saved sessions. The ordinary browser preview in Settings is also opt-in, local, and unrecorded, and is independent of strict monitoring. Identity, gaze, emotion, accent, and nervousness are not evaluated. A face-count or device event is not proof of cheating.

This is a local self-practice policy, not a tamper-proof assessment. The owner/administrator can alter the source, guardian, OS, environment, or database. VM and application detection covers specific observable signals, not every hypervisor, capture path, injected device, or recorder. Config Key is derived from public settings and is not a secret; local signed-SEB presence does not cryptographically bind an HTTP connection to that process. There is no allowlisted Browser Exam Key verification, remote attestation, remote candidate identity, or multi-user examination boundary. Do not use the practice VM tunnel as a strict deployment.

SQLite files use restrictive local permissions; newly created data directories are private. Choose a dedicated directory if overriding the data location, because existing directory permissions are preserved. Disk encryption is supplied by the operating system, not this application. Export omits secrets. Delete-all removes database records and imported repositories; this is logical deletion, not guaranteed forensic erasure from SSDs or backups. Browser draft recovery uses localStorage when available and is removed when sessions/data are deleted through the interface.

The guardian is built with an ad-hoc local signature, not a signed/notarized release package. Physical permission, capture, hot-plug, sleep/wake, and recovery behavior needs a supported-Mac test matrix. No claim of comprehensive VM or virtual-device detection is made. Private repository integration, arbitrary application startup, and Windows support remain future work.

## Generated SEB practice links

The setup screen can generate a localhost SEB configuration link. Its random identifier references setup options held in memory for 30 minutes, capped at 50 active handoffs. Restart and workspace deletion invalidate these handoffs. Download responses disable caching. The file is unencrypted, contains a local setup URL, and carries no provider credentials or resume text. It is not an admission credential.

The practice profile permits app switching, VMs, screen sharing, extra displays, and manual quit. It supports the local agent workflow without verifying admission. Strict mode has its own consent, preflight, configuration, and admission routes; changing a regular session request to `mode: strict` is rejected. Opening either launch link requires an explicit browser click; Sparr does not infer successful SEB startup from that click.
