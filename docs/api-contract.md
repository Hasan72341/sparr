# Local API

The server binds to `127.0.0.1`, port 4318 by default. Routes below are relative to `/api`. Requests and responses use JSON unless noted. Mutations require `X-Sparr-Client: web`; browser requests must have a matching origin. JSON bodies are limited to 200 KB. Errors return `{ "error": "message" }`.

Response types are defined in [src/shared/types.ts](../src/shared/types.ts). This API has no multi-user authentication and is intended for the local client.

## Workspace

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| GET | `/health` | — | `{ok, version}` |
| GET | `/bootstrap` | — | `Bootstrap`: profile, settings, tracks, sessions, repositories, artifacts, capabilities |
| PUT | `/profile` | `Profile` | Saved `Profile` |
| POST | `/profile/resume` | Multipart field `file` | Suggested `Profile`; does not save it |
| PUT | `/settings` | `Settings` | Saved `Settings` |
| POST | `/settings/test` | `{}` | `{ok, message}` |
| GET | `/export` | — | Profile, sessions, repositories, artifacts, export timestamp |
| DELETE | `/data` | — | `{deleted: true}` |

Resume files support PDF, DOCX, TXT, and Markdown up to 5 MB. Save extracted details with `PUT /profile` after review. Provider credentials are read from the server environment and excluded from responses and exports. Clearing workspace data also resets settings and removes imported repositories.

## Sessions

`POST /sessions` creates a session and returns `SessionView` with HTTP 201:

```json
{
  "track": "quant-research",
  "difficulty": "foundation",
  "durationMinutes": 20,
  "mode": "practice",
  "stage": "technical"
}
```

| Field | Accepted value |
| --- | --- |
| `track` | `swe`, `quant-research`, `quant-trading`, `quant-dev`, `finance`, `markets`, `ml` |
| `difficulty` | `foundation`, `intermediate`, `advanced` |
| `durationMinutes` | Integer, 5–90 |
| `mode` | `practice`; direct `strict` requests return HTTP 409 and must use the admission flow below |
| `stage` | Optional: `technical` (default), `oa`, `project`, `behavioral` |
| `repositoryId` | Optional repository UUID |
| `artifactId` | Optional document UUID; mutually exclusive with `repositoryId` |
| `company` | Optional text, up to 120 characters |
| `jobDescription` | Optional text, up to 8,000 characters |

OA sessions use numeric/coding questions, reject attachments, and disable hints. Project defense requires a confirmed resume or an attachment. Company and job-description text is supplied to the model as context.

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| GET | `/sessions` | — | `Session[]` |
| GET | `/sessions/:id` | — | `SessionView` |
| PUT | `/sessions/:id/draft` | `{answer, code, language}` | `{saved: true}` |
| POST | `/sessions/:id/answer` | `{answer, code, language, requestId}` | `SessionView` |
| POST | `/sessions/:id/followup` | `{answer, requestId}` | `SessionView` |
| POST | `/sessions/:id/hint` | `{}` | `SessionView` |
| POST | `/sessions/:id/next` | `{}` | `SessionView` |
| POST | `/sessions/:id/run` | `{code, language}` | `RunResult` |
| POST | `/sessions/:id/finish` | `{}` | `SessionView` with report |
| GET | `/sessions/:id/export` | — | Downloadable `SessionView` JSON |
| DELETE | `/sessions/:id` | — | `{deleted: true}` |

`answer` is limited to 30,000 characters, `code` to 50,000, and `language` is `python` or `javascript`. Draft saves and answer submissions require all three fields; use an empty string for unused text. Code runs need only `code` and `language`. `requestId` is an 8–100 character identifier for retries, usually a UUID.

Submitting an answer adds an assessment and follow-up without advancing. Follow-up responses are stored separately and are not checked against the original numeric reference. **Next** selects another question or finishes when none remain. Per-session operations are serialized. Deadlines are enforced by the server, including when a model request finishes after time expires.

Coding exercises implement `solve(data)` and return JSON-compatible values. The browser receives case results, but hidden case inputs and expected outputs are omitted. Running code alone does not submit an answer.

## SEB practice links

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| POST | `/seb/launches` | Session options above; `mode` must be `practice` | `SebLaunch` (201): ID, options, expiry, config URL, launch URL, start URL |
| GET | `/seb/launches/:id` | — | Saved `SebLaunch` |
| GET | `/seb/launches/:id/config.seb` | — | `application/seb` attachment, `sparr-practice.seb` |

Creation does not create a session or start a timer. The start URL loads `/practice?seb=:id`, where the candidate reviews the preserved setup and starts normally. Links use `seb://` for HTTP and `sebs://` for HTTPS. Their origin comes from the direct local request; forwarded headers and caller-supplied settings/redirects are not accepted.

Handoffs live in server memory for 30 minutes, with at most 50 unexpired links (HTTP 429 at capacity). Restarting Sparr or deleting all data invalidates them. Missing or expired handoffs return 404, including configuration downloads. Responses use `Cache-Control: no-store`. No timer/session history is retained for an unused link. Resume contents and provider credentials are not embedded in the config.

These links open a permissive practice configuration; they do not enable strict mode or verify a client. Windows remains untested.

## Strict SEB interviews

Node, the native guardian, and SEB must run on the same physical Mac. Strict setup starts native camera/microphone monitoring and therefore requires `consent: true`. The request's `options` uses the session fields above with `mode: practice`; the server creates `mode: strict` only after admission. Other session validation still applies.

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| POST | `/strict/launches` | `{options, consent: true}` | `StrictLaunch` (201): ID, options, start/quit/config/launch URLs, expiry |
| GET | `/strict/launches/:id/config.seb` | — | `application/seb` attachment, `sparr-strict.seb` |
| GET | `/strict/launches/:id/status` | — | `StrictStatus`: phase, ready, reasons, optional session ID/observation, quit URL |
| POST | `/strict/launches/:id/admit` | `{pageUrl, configHash}` | `{view: SessionView, challenge}` (201), plus session cookie |
| POST | `/strict/launches/:id/resume` | `{pageUrl, configHash}` | Existing `{view: SessionView, challenge}`; requires admission cookie |
| POST | `/strict/launches/:id/heartbeat` | `{pageUrl, configHash, challenge}` | `StrictStatus` plus next challenge; requires admission cookie |
| POST | `/strict/launches/:id/cancel` | `{}` or `{ifPreflight: true}` | `{ended: true}`; `ifPreflight` leaves an already admitted attempt running |

One strict setup or interview may be open at a time. Setup expires after ten minutes and does not start the timer. Its phase is `preflight`, `active`, or `ended`. `ready` reports preflight device readiness; it does not prove SEB admission. The optional status observation exposes display/camera/face counts and permission states, not raw media or device identifiers. Config downloads are available only during preflight. Restart invalidates in-memory launches and terminates persisted strict sessions left active; clearing the workspace cancels pending setup and releases capture.

`pageUrl` must be the exact launch start URL. `configHash` is SEB's lowercase, 64-character page-bound Config Key hash, obtained through its JavaScript API. Admission checks this against the generated configuration, validates fresh native observations, and waits for the guardian's acknowledgement of the specific signed SEB process and launch time. A configuration hash alone is insufficient. Admission is single-use; invalid proof returns 403, and missing native readiness or repeated/ended admission returns 409. Unknown launch IDs return 404.

Successful admission sets `sparr-strict`, an HttpOnly, SameSite=Strict cookie scoped to `/api`, with a two-hour maximum age and Secure enabled when served over HTTPS. The admitted browser supplies that cookie and the following headers on ordinary session API requests:

```text
X-Sparr-SEB-Page: <exact launch start URL>
X-Sparr-SEB-Config: <page-bound Config Key hash>
```

The heartbeat body must use the most recently issued challenge; an accepted heartbeat rotates it. A replayed/out-of-date challenge returns 409 without refreshing liveness. Resume recovers the current session and challenge after a page reload, with the existing cookie and proof. It cannot recreate an ended session. Live native snapshots arrive only through the guardian pipe; there is no HTTP route for supplying them.

During an active strict attempt, bootstrap and the admitted session's view/draft/answer/follow-up/hint/next/run/finish routes require the binding. Other workspace operations return 423. Health and the current strict launch routes remain reachable; cancel is a local emergency-stop operation. On policy failure, the session becomes `terminated`, preserves saved work, and includes `terminationReason` and integrity events. Subsequent work is rejected, and late results cannot overwrite termination. Normal completion saves a report and requests SEB exit.

The unencrypted configuration and Config Key do not supply Browser Exam Key validation, remote attestation, or authentication against the host owner. See [the strict policy](strict-mode.md) and [security boundary](security.md).

## Project material

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| POST | `/repositories` | `{url}` | `Repository` (201) |
| POST | `/repositories/:id/run-tests` | `{}` | Updated `Repository` |
| DELETE | `/repositories/:id` | — | `{deleted: true}` |
| POST | `/artifacts` | Multipart field `file` | `Artifact` (201) |
| DELETE | `/artifacts/:id` | — | `{deleted: true}` |

Repository imports accept public HTTPS GitHub repository URLs. Imports are bounded and do not run hooks or install dependencies. Project execution supports dependency-free Python `unittest` and Node `node:test` suites.

Document uploads accept PDF, DOCX, TXT, Markdown, IPYNB, XLSX, and CSV up to 5 MB. Notebook cells and spreadsheet formulas are not executed. Deleting an attachment used by an active session returns HTTP 409. Deletion removes the import record; existing session questions retain their cited excerpts.

## Browser routes

| Path | Page |
| --- | --- |
| `/` | Overview |
| `/practice` | Interview setup |
| `/profile` | Resume and goals |
| `/projects` | Repositories and documents |
| `/settings` | Provider, device checks, data controls |
| `/history` | Session history |
| `/sessions/:id` | Interview |
| `/sessions/:id/report` | Report |
| `/strict/:launchId` | Strict SEB admission and active interview |
| `/strict/:launchId/quit` | Configured SEB quit URL; fallback exit page in an ordinary browser |

The development-only `/__seb_lab` routes are documented separately in [the SEB lab guide](seb-vm-lab.md). They are not part of the normal application server.
