# Recorded demo

[Watch Sparr (MP4)](sparr.mp4)

Silent browser recording from 5 October 2026, using synthetic candidate data and real local inference with Qwen2.5 7B through Ollama 0.35.1. The recording shows the macOS web application; it does not demonstrate native SEB lockdown.

## Walkthrough

| Time | Action |
| --- | --- |
| 0:00 | Overview |
| 0:02 | Import and review a sample resume |
| 0:06 | Configure a local open model |
| 0:12 | Choose Joveo preparation and customize the session |
| 0:16 | Run a Python solution against actual cases |
| 0:18 | Receive real Qwen feedback and a follow-up |
| 0:34 | Save and reopen the session report |
| 0:36 | Import a sample financial model |
| 0:38 | Explain assumptions in a finance project |
| 0:55 | Review saved practice history |

The resume, forecast, and answers are demonstration fixtures. The code is executed by Sparr, and feedback is returned by the local model. Company templates supply editable study context; they do not reproduce company questions.

## What to inspect

- Resume text is reviewed before it becomes part of the profile.
- The configured Ollama model passes a real connection check.
- Joveo context stays editable before the session begins.
- The Python solution passes all six cases; model feedback appears separately from the execution result.
- The completed report survives a reload.
- A financial-model upload is used in a Goldman Sachs finance preparation session.
- Both finished sessions appear in history.

See [local-model evidence](../local-model.md) for runtime details and observed limitations, and [Verification](../verification.md) for the broader test record.
