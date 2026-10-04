# Local model setup and evidence

Sparr can use an open-weight model for interview feedback while its controller runs tests, checks numeric answers, and saves the session. The provider receives the question, answer, selected resume/project context, and observed results. Its response supplies feedback and a follow-up; it cannot execute code or override the checks.

## Setup

1. Install and start [Ollama for macOS](https://docs.ollama.com/macos).
2. Download the tested model with `ollama pull qwen2.5:7b`. The [Ollama model listing](https://ollama.com/library/qwen2.5:7b) gives a roughly 4.7 GB download; the [original model card](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct) identifies the Apache-2.0 license.
3. In **Settings**, select **Ollama**, model `qwen2.5:7b`, and base URL `http://127.0.0.1:11434`. Save and test the connection, then start a new session.
4. For local-only operation, disable Ollama Cloud using the [official configuration instructions](https://docs.ollama.com/faq#how-do-i-disable-ollama-cloud-features). A standalone server can be started with `OLLAMA_NO_CLOUD=1 ollama serve`; restart an existing server to apply configuration changes.

The one-time runtime/model downloads need internet access and disk space. Guided practice remains available without either. Other installed models can be selected by name, but their quality and resource needs require separate checks.

## Repeat the live check

With the local server running and the model installed:

```sh
npm run verify:local-model
```

This starts a temporary Sparr API and database, submits a probability answer and a Python solution, requires real model feedback and a follow-up, and checks that completed reports reload. It treats Guided fallback as a failure. It cleans up its temporary database and writes synthetic evidence to the ignored `.data/local-ai/verification.json` file.

To test a different installed model or loopback port:

```sh
SPARR_LOCAL_MODEL=your-installed-model SPARR_OLLAMA_URL=http://127.0.0.1:11434 npm run verify:local-model
```

`SPARR_VERIFY_REPORT` can override the evidence output path. The script does not download models or change your normal workspace settings. It is opt-in and is not part of the network-free fixture suite.

## Recorded run

Checked **5 October 2026 (IST)**:

| Item | Observation |
| --- | --- |
| Runtime | Ollama 0.35.1, official standalone macOS distribution |
| Model | `qwen2.5:7b`, 7.6B parameters, Q4_K_M |
| Model digest | `845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e` |
| Model size | 4,683,087,332 bytes in the local inventory |
| Hardware | Apple M3, 24 GB unified memory, macOS 26.6.1 |
| Inference | Loopback server, cloud features disabled; model loaded on the Metal GPU |
| Probability | Reference value matched, model feedback and follow-up returned, report persisted |
| Coding | Six of six cases passed, model feedback and follow-up returned, report persisted |
| Observed answer latency | 7.02 seconds for probability; 8.29 seconds for coding, after a connection probe |

These two synthetic responses verify integration, not general model quality or performance. Qwen 7B accepted the correct probability explanation and coding approach in these runs, but also made an unnecessary observation about supplying a decimal equivalent of a fraction. In the browser demo, its finance follow-up also referred to a 1% margin increase where the source moves from 20% to 22% (two percentage points). Review its suggestions against the source and execution evidence. The controller keeps numeric matches separate from a judgment about reasoning, and code tests establish behavior only on their cases.

The first run exposed a missing-field failure with unconstrained JSON output. Sparr now sends a [JSON schema to Ollama](https://docs.ollama.com/capabilities/structured-outputs), requiring `feedback`, `followup`, and `observation`, and still validates the response before saving it. Connection or validation failures retain the candidate's answer and label the guided fallback.

## Why the default changed

The earlier `qwen2.5:1.5b` model (about 986 MB) passed the transport and persistence checks. In a separate browser run, however, it recommended replacing a map of values to indices with a set, losing the indices required by the problem. It also repeated questions already answered. That model is not the suggested default. The 7B model was then checked with the same integration flow and used for the recorded demo; this is a practical setup choice, not a comparative benchmark.

The provider prompt now supplies execution and numeric evidence without the controller's canned Guided judgment. Follow-up responses carry an explicit phase instruction so the original numeric reference is not used to judge a changed scenario. Regression tests cover both the prompt and the controller handoff.
