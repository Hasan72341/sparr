# Remaining work

The local application includes regular practice and a strict macOS policy with native monitoring, SEB admission, and controlled exit. The source build is not a notarized release or a validated high-stakes examination service. [Verification](verification.md) records what has been tested.

## macOS strict sessions

The implementation now includes consent/preflight, Config Key consistency checks, binding to an officially signed SEB process and its launch time, ongoing native/browser liveness, device/process policy, face-count grace periods, invalidation, and exit. These release-validation tasks remain:

| Work | Completion criterion |
| --- | --- |
| Physical device matrix | Exercise real capture, camera/display hot-plug, mirroring/Sidecar, Continuity/virtual cameras, lighting, and multiple/no-face transitions on supported Macs. Record observed timing and false terminations. |
| Permissions and recovery | Validate first consent, revoked TCC permissions, unavailable devices, sleep/wake, guardian/server crashes, and Command-Q recovery on each supported OS version. |
| VM and process coverage | Maintain the known signal/application list and verify rejection paths. State unsupported detection explicitly; do not claim comprehensive VM or recorder detection. |
| Background provider operation | Exercise the complete strict policy with supported terminal launchers and providers on physical Macs, while candidate code remains sandboxed. |
| Exit and storage failures | Verify signature-bound exit and recovery with physical SEB sessions, including slow OS APIs and local disk failures. Preserve the distinction between blocked work and events successfully written to disk. |
| Distribution | Ship a signed and notarized package with installation, update, removal, and recovery instructions. |

Strict mode currently requires a built-in camera and therefore excludes Macs without one. Supporting external cameras would require an explicit device policy and hardware validation rather than simply relaxing the check.

Camera and microphone access cannot establish cheating. Current monitoring is disclosed, keeps raw media only in memory, and stores policy events instead of recordings. No identity, gaze, emotion, accent, or nervousness inference is part of the policy. Local administrator tampering is outside scope; remote candidate identity, Browser Exam Key allowlisting, and remote attestation are not provided.

The existing VM lab checks application integration and normal SEB exit. Its practice configuration permits a VM and remote automation; it cannot establish the physical capture/rejection guarantees required for a release.

## Interview coverage

- Expand the question bank with checked solutions, domain review, and more cases at each difficulty.
- Add project execution adapters for specific build systems before offering dependency installation or full application startup.
- Add an isolated Codex adapter before enabling its settings option.
- Extend history into topic-level practice planning. The current dashboard reports completed sessions and observed checks; it does not claim a calibrated ability score.

## Windows

Windows support will be added after the macOS release. It needs its own runner, continuous guardian, SEB configuration, installer, and test matrix. The TypeScript interview controller and provider contracts can be shared. Linux support is not planned.
