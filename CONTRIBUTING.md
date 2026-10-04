# Contributing

Use macOS with Node.js 24+, Python 3, and Git. Run `npm ci`, then `npm run dev`. Guided practice lets you work without a model account.

## Repository layout

```text
src/client/           React pages, API client, styles
src/server/app.ts     HTTP validation and routes
src/server/interviews.ts  Session state, assessment, question selection
src/server/questions.ts  Built-in questions and reference solutions
src/server/providers.ts  Claude Code, Ollama, compatible HTTP adapters
src/server/runner.ts  Code and project test execution
src/server/store.ts   SQLite persistence
src/shared/types.ts  Browser/API types
native/macos/        Swift device observer and strict guardian
scripts/             Launch, native build, and SEB laboratories
tests/              Unit, API, parser, runner, and browser tests
```

## Making changes

Keep a change focused on a specific behavior. Describe the problem, the resulting behavior, and how you checked it. Screenshots help for interface changes; error messages and reproduction steps help for bug fixes.

Run the checks relevant to your change:

```sh
npm run check
npm test
npm run build
npm run test:e2e
```

Install browser binaries first with `npx playwright install chromium webkit`. The browser suite uses `.data/e2e` on port 4349 and the synthetic strict laboratory on port 4354. Both use disposable workspaces and clear their own records. They must not be pointed at your normal data directory. Run `npm audit` when changing dependencies.

Use `npm run format` to format source and tests. Do not commit `.data`, `.env`, API keys, VM credentials, resumes, or private repository content. Test fixtures should be synthetic.

## Adding a question

Questions live in `src/server/questions.ts`. Include a prompt, track, difficulty, hints, follow-ups, and assessment criteria.

- Numeric questions need a reference value, tolerance, and enough information to derive the result.
- Coding questions need Python and JavaScript reference solutions, public examples, and tests for edge cases. `tests/runner.test.ts` executes every reference solution against its cases.
- Discussion questions need criteria for a useful answer. Guided mode records these responses without assigning a correctness score.

Check the question's assumptions and explanation, not just the expected value. Do not label practice material as a company's actual interview question without a source and permission to include it.

## Interface and provider changes

Use direct labels and errors that tell the user what to do next. Counts, progress, and availability must come from application state. Update screenshots when the screens they show change.

Provider responses must pass schema validation. A provider may add feedback and a follow-up; it cannot alter timing, test results, session state, or execution permissions. Treat resumes, code, documents, and model output as untrusted input. See [the architecture](docs/architecture.md) and [security boundaries](docs/security.md).

## Platform work

macOS is the current target; Windows support follows later. Keep Windows work behind a separate platform implementation and document which checks were actually run. Strict SEB admission, monitoring, interruption handling, and exit are implemented. Physical capture, hot-plug, and recovery validation remain outstanding. The VM lab tests integration with synthetic admission observations; it does not establish physical-hardware enforcement. See [the verification record](docs/verification.md) before making compatibility claims.

## Useful contributions

- Add edge cases and explain assumptions in coding, quant, and finance questions.
- Reproduce resume or document parsing failures with synthetic fixtures.
- Exercise keyboard navigation and report specific accessibility problems.
- Validate a real local-model interview, recording the model, runtime, hardware, and any fallback or failure. Do not include personal interview material.

Sparr is distributed under the [MIT license](LICENSE). Company preparation templates are suggested study contexts; cite public sources for company facts and keep the user's job description editable.
