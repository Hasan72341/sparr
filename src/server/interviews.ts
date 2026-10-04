import { randomUUID } from "node:crypto";
import type {
  Assessment,
  Artifact,
  Difficulty,
  Language,
  Message,
  Profile,
  Report,
  Repository,
  Session,
  SessionView,
  Settings,
  TrackId,
} from "../shared/types.js";
import {
  chooseProblems,
  getProblem,
  publicQuestion,
  type Problem,
} from "./questions.js";
import { Store } from "./store.js";
import { runCode } from "./runner.js";
import { providerReply } from "./providers.js";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const message = (role: Message["role"], content: string): Message => ({
  id: randomUUID(),
  role,
  content,
  createdAt: new Date().toISOString(),
});
export function parseNumericAnswer(text: string): number | undefined {
  const m = text
    .replace(/,/g, "")
    .match(
      /[-+]?(?:\d+\.?\d*|\.\d+)\s*(?:\/\s*[-+]?(?:\d+\.?\d*|\.\d+))?\s*%?/,
    );
  if (!m) return undefined;
  const match = m[0].trim();
  let value: number;
  if (match.includes("/")) {
    const [a, b] = match.split("/").map(Number);
    value = a / b;
  } else value = parseFloat(match) / (match.endsWith("%") ? 100 : 1);
  return Number.isFinite(value) ? value : undefined;
}
export class InterviewEngine {
  private locks = new Set<string>();
  private invalidStrict = new Set<string>();
  constructor(private store: Store) {}
  get busy() {
    return this.locks.size > 0;
  }
  async lock<T>(id: string, action: () => Promise<T>): Promise<T> {
    if (this.locks.has(id))
      throw new HttpError(
        409,
        "An operation is already in progress. Wait for it to finish.",
      );
    this.locks.add(id);
    try {
      return await action();
    } finally {
      this.locks.delete(id);
    }
  }
  get(id: string) {
    const s = this.store.get<Session>("session", id);
    if (!s) throw new HttpError(404, "Interview not found.");
    if (s.status === "active" && this.invalidStrict.has(s.id))
      throw new HttpError(409, "This strict attempt was invalidated.");
    if (
      s.status === "active" &&
      !this.locks.has(id) &&
      Date.now() >= Date.parse(s.createdAt) + s.durationMinutes * 60000
    )
      this.finish(s);
    return s;
  }
  problem(s: Session): Problem {
    return (
      this.store.get<Problem>("problem", s.questionIds[s.questionIndex]) ??
      getProblem(s.questionIds[s.questionIndex])
    );
  }
  active(s: Session) {
    if (this.invalidStrict.has(s.id))
      throw new HttpError(409, "This strict attempt was invalidated.");
    if (
      s.status === "active" &&
      Date.now() >= Date.parse(s.createdAt) + s.durationMinutes * 60000
    )
      this.finish(s);
    if (s.status !== "active")
      throw new HttpError(
        409,
        "This interview has ended. Start a new practice session.",
      );
  }
  save(s: Session) {
    if (this.invalidStrict.has(s.id))
      throw new HttpError(409, "This strict attempt was invalidated.");
    if (s.mode === "strict") {
      const persisted = this.store.get<Session>("session", s.id);
      if (
        persisted &&
        persisted.status !== "active" &&
        s.status !== persisted.status
      )
        throw new HttpError(
          409,
          "This strict attempt has ended. Late results were discarded.",
        );
    }
    this.store.put("session", s.id, s);
  }
  terminate(id: string, code: string, reason: string) {
    const s = this.store.get<Session>("session", id);
    if (!s || s.status !== "active") return;
    try {
      this.store.transaction(() => {
        // Persist synchronously even while a model/runner operation holds its lock.
        this.finish(s);
        s.status = "terminated";
        s.terminationReason = reason;
        s.integrity ??= { policy: "macos-strict-v1", events: [] };
        s.integrity.events = [
          ...s.integrity.events,
          { at: new Date().toISOString(), code, detail: reason },
        ].slice(-100);
        if (s.report)
          s.report.limitations.push(
            "This strict attempt was invalidated: " + reason,
          );
        this.store.put("session", s.id, s);
      });
    } finally {
      this.invalidStrict.add(id);
    }
  }

  view(s: Session, providerNotice?: string): SessionView {
    return {
      session: s,
      question: publicQuestion(this.problem(s)),
      remainingSeconds:
        s.status === "active"
          ? Math.max(
              0,
              Math.ceil(
                (Date.parse(s.createdAt) +
                  s.durationMinutes * 60000 -
                  Date.now()) /
                  1000,
              ),
            )
          : 0,
      providerNotice,
    };
  }
  start(
    input: {
      track: TrackId;
      difficulty: Difficulty;
      durationMinutes: number;
      mode: "practice" | "strict";
      repositoryId?: string;
      artifactId?: string;
      company?: string;
      jobDescription?: string;
      stage?: Session["stage"];
    },
    strictVerified = false,
  ) {
    if (input.mode === "strict" && !strictVerified)
      throw new HttpError(
        409,
        "Strict sessions require the SEB admission flow and live native monitoring.",
      );
    const stage = input.stage ?? "technical";
    const profile = this.store.profile();
    if (input.repositoryId && input.artifactId)
      throw new HttpError(
        400,
        "Choose one repository or document per interview.",
      );
    if (stage === "oa" && (input.repositoryId || input.artifactId))
      throw new HttpError(
        400,
        "OA rounds use timed exercises. Choose technical or project defense to attach evidence.",
      );
    if (
      stage === "project" &&
      !input.repositoryId &&
      !input.artifactId &&
      !profile.resumeText.trim()
    )
      throw new HttpError(
        400,
        "Project defense requires a confirmed resume, repository, or document.",
      );
    const artifact = input.artifactId
      ? this.store.get<Artifact>("artifact", input.artifactId)
      : undefined;
    if (input.artifactId && !artifact)
      throw new HttpError(404, "Selected document was not found.");
    if (input.repositoryId && !this.store.get("repository", input.repositoryId))
      throw new HttpError(404, "Selected project was not found.");
    const previous = this.store
      .sessions()
      .filter((s) => s.track === input.track)
      .flatMap((s) => s.assessments.map((a) => a.questionId));
    const ids =
      stage === "project" || stage === "behavioral"
        ? []
        : chooseProblems(input.track, input.difficulty, previous).filter(
            (id) => stage !== "oa" || getProblem(id).kind !== "discussion",
          );
    if (stage === "oa" && !ids.length)
      throw new HttpError(400, "This track has no timed exercises available.");
    if (input.repositoryId && stage !== "behavioral") {
      const repo = this.store.get<Repository>("repository", input.repositoryId);
      if (!repo) throw new HttpError(404, "Selected project was not found.");
      const evidence = repo.evidence[0];
      const p: Problem = {
        id: "project-" + randomUUID(),
        track: input.track,
        kind: "discussion",
        title: `Defend ${repo.name}`,
        difficulty: input.difficulty,
        tags: ["Project defense", "Ownership"],
        prompt: `You attached ${repo.name} at commit ${repo.commit.slice(0, 8)}. Describe your individual contribution and trace one important operation through the implementation.${evidence ? `\n\nSource: ${evidence.path}\n\n${evidence.excerpt.slice(0, 1800)}` : ""}\n\nWhich design tradeoff would you revisit, and how would you test a change? `,
        source: evidence
          ? { repositoryId: repo.id, path: evidence.path }
          : undefined,
        hints: [
          "Choose a single request, data transformation, or transaction and walk through its path.",
        ],
        followups: [
          "What observable behavior would fail if your stated invariant were violated?",
          "Which test would distinguish your implementation from an incorrect alternative?",
        ],
        rubric: [
          "Individual contribution",
          "Implementation evidence",
          "Testing and tradeoffs",
        ],
      };
      this.store.put("problem", p.id, p);
      ids.unshift(p.id);
    }
    if (artifact && stage !== "behavioral") {
      for (const evidence of artifact.evidence.slice(0, 3).reverse()) {
        const p: Problem = {
          id: "project-" + randomUUID(),
          track: input.track,
          kind: "discussion",
          title: `Defend ${artifact.name}`,
          difficulty: input.difficulty,
          tags: ["Project defense", artifact.kind],
          prompt: `Source: ${evidence.path}\n\n${evidence.excerpt.slice(0, 2500)}\n\nDescribe your own contribution. ${artifact.kind === "financial-model" ? "Explain the assumptions and units behind the figures. Which driver most changes your conclusion, and how would you test the sensitivity?" : artifact.kind === "notebook" ? "Trace the data preparation and method. How would you detect leakage and reproduce the result?" : "Explain the hypothesis, method, and evidence. What alternative explanation or limitation matters most?"}\n\nThis source was inspected, not independently verified. ${artifact.notes.join(" ")}`,
          hints: [
            "Select one concrete claim, identify its assumptions, and explain what evidence could disprove it.",
          ],
          followups: [
            "Which assumption would you stress first, and what result would change your decision?",
            "How would someone independently reproduce or audit your conclusion?",
          ],
          rubric: [
            "Individual contribution",
            "Evidence and assumptions",
            "Reproducibility",
            "Limitations",
          ],
        };
        this.store.put("problem", p.id, p);
        ids.unshift(p.id);
      }
    }
    if (stage === "behavioral") {
      const prompts = [
        [
          "Explain a difficult decision",
          "Describe a decision you made with incomplete information. Explain the alternatives, your individual role, the tradeoff, and what happened. What evidence would change your decision today?",
        ],
        [
          "Resolve a disagreement",
          "Tell me about a substantive disagreement in a team. What did you do, what was the result, and what would the other person say you could have done better?",
        ],
        [
          "Defend your role choice",
          `Why are you pursuing this role${input.company ? ` at ${input.company}` : ""}? Connect the work to a specific experience, then explain one skill gap and your plan to address it.`,
        ],
      ];
      const attached =
        artifact ??
        (input.repositoryId
          ? this.store.get<Repository>("repository", input.repositoryId)
          : undefined);
      const source = attached?.evidence[0];
      for (const [index, [title, prompt]] of prompts.entries()) {
        const p: Problem = {
          id: "project-" + randomUUID(),
          track: input.track,
          kind: "discussion",
          title,
          difficulty: input.difficulty,
          prompt:
            prompt +
            (index === 0 && source
              ? `\n\nGround your example in the attached work if relevant. Source: ${source.path}\n${source.excerpt.slice(0, 1600)}\nThis source does not establish authorship or correctness.`
              : ""),
          tags: ["Behavioral", "Reflection"],
          hints: [
            "Use a specific situation and distinguish your actions from the team's actions.",
          ],
          followups: [
            "What did you learn, and what observable change did you make afterward?",
          ],
          rubric: [
            "Specific evidence",
            "Individual contribution",
            "Reflection",
          ],
        };
        this.store.put("problem", p.id, p);
        ids.push(p.id);
      }
    }
    if (profile.resumeText.trim() && stage !== "oa" && stage !== "behavioral") {
      const claim =
        profile.resumeText
          .split("\n")
          .find((line) =>
            /built|developed|implemented|research|analys|led|designed|created|project/i.test(
              line,
            ),
          ) ?? profile.resumeText.slice(0, 600);
      const resume: Problem = {
        id: "resume-" + randomUUID(),
        track: input.track,
        kind: "discussion",
        title: "Defend a resume claim",
        difficulty: input.difficulty,
        tags: ["Resume", "Ownership"],
        prompt: `Your confirmed resume includes: “${claim.slice(0, 800)}”\n\nExplain your individual contribution, one decision you made, and the evidence that your work achieved its intended result. What would you do differently now?`,
        hints: [
          "Separate what you personally implemented or analysed from the overall team result.",
        ],
        followups: [
          "What evidence would let someone reproduce or challenge that result?",
        ],
        rubric: [
          "Individual contribution",
          "Technical depth",
          "Evidence and limitations",
        ],
      };
      this.store.put("problem", resume.id, resume);
      ids.push(resume.id);
    }
    const s: Session = {
      ...input,
      stage,
      id: randomUUID(),
      status: "active",
      createdAt: new Date().toISOString(),
      questionIds: ids,
      questionIndex: 0,
      messages: [],
      assessments: [],
      hintsUsed: 0,
      draft: { answer: "", code: "", language: "python" },
      provider: this.store.settings().provider,
    };
    const p = this.problem(s);
    s.draft.code = p.starterCode?.python ?? "";
    s.messages.push(message("interviewer", p.prompt));
    this.save(s);
    this.store.put("session-settings", s.id, this.store.settings());
    return this.view(s);
  }
  async answer(
    id: string,
    input: {
      answer: string;
      code: string;
      language: Language;
      requestId: string;
    },
  ) {
    return this.lock(id, async () => {
      const s = this.get(id);
      const key = id + ":" + input.requestId;
      if (this.store.get("receipt", key)) return this.view(s);
      this.active(s);
      if (!input.answer.trim() && !input.code.trim())
        throw new HttpError(400, "Add your answer or code before submitting.");
      const p = this.problem(s);
      s.draft = {
        answer: input.answer,
        code: input.code,
        language: input.language,
      };
      s.messages.push(
        message(
          "candidate",
          input.answer +
            (input.code.trim()
              ? `\n\nCode (${input.language}):\n${input.code}`
              : ""),
        ),
      );
      if (s.mode === "strict") this.save(s);
      const assessment: Assessment = {
        questionId: p.id,
        title: p.title,
        verdict: "needs-review",
        evidence: [],
        feedback:
          "Your response is saved. Guided practice does not assess explanations. Compare your answer with the criteria below, or connect a model for feedback.",
        nextPractice: p.followups[0],
        hintsUsed: s.hintsUsed,
      };
      if (p.kind === "numeric") {
        const value = parseNumericAnswer(input.answer);
        if (value === undefined) {
          assessment.verdict = "insufficient-evidence";
          assessment.feedback =
            "No numeric answer could be identified. Start with a fraction, decimal, or percentage, then explain your reasoning.";
          assessment.evidence = ["No finite numeric answer was parsed."];
        } else {
          const correct = Math.abs(value - p.solution!) <= p.tolerance!;
          assessment.verdict = correct ? "needs-review" : "developing";
          assessment.evidence = [
            `Parsed numeric answer: ${value}.`,
            correct
              ? "The numeric answer matches the reference solution within tolerance."
              : "The numeric answer does not match the reference solution.",
          ];
          assessment.feedback = correct
            ? "Your numeric answer matches. Your reasoning still needs review: explain the assumptions and derivation rather than relying on arithmetic alone."
            : "The numeric answer does not match. Revisit the assumptions and show your calculation; the result alone cannot tell us whether the issue is arithmetic or reasoning.";
        }
      } else if (p.kind === "coding") {
        assessment.run = await runCode(p, input.code, input.language);
        const r = assessment.run;
        assessment.evidence = [
          `${r.passed}/${r.total} supplied tests passed.`,
          r.output,
        ];
        assessment.verdict =
          r.status === "passed"
            ? "demonstrated"
            : r.status === "unavailable"
              ? "insufficient-evidence"
              : "developing";
        assessment.feedback =
          r.status === "passed"
            ? "Your code passes the supplied cases. Explain its invariant and time and space complexity; tests do not prove those properties."
            : r.status === "unavailable"
              ? r.output
              : "Your implementation needs another pass. Use the execution evidence to identify a failing assumption before changing the code.";
      } else
        assessment.evidence = [
          `Candidate supplied ${input.answer.trim().split(/\s+/).filter(Boolean).length} words. This records a response, not its correctness.`,
          `Review criteria: ${p.rubric.join("; ")}.`,
        ];
      let followup =
        p.followups[
          s.assessments.filter((a) => a.questionId === p.id).length %
            p.followups.length
        ];
      let notice: string | undefined;
      const settings =
        this.store.get<Settings>("session-settings", id) ??
        this.store.settings();
      if (settings.provider !== "guided")
        try {
          const ai = await providerReply(settings, {
            profile: this.store.profile(),
            question: publicQuestion(p),
            session: s,
            assessment,
          });
          if (p.kind === "discussion")
            assessment.feedback = "Your response is saved for review.";
          assessment.feedback += "\n\nAI feedback: " + ai.feedback;
          assessment.evidence.push("AI interpretation: " + ai.observation);
          followup = ai.followup;
        } catch (error) {
          notice = (error as Error).message;
          assessment.evidence.push(
            "Model feedback unavailable; guided feedback was used.",
          );
        }
      // A provider can take long enough for the deadline to pass. Preserve the response, then finish.
      s.assessments = s.assessments.filter((a) => a.questionId !== p.id);
      s.assessments.push(assessment);
      s.messages.push(
        message("interviewer", assessment.feedback + "\n\n" + followup),
      );
      this.store.transaction(() => {
        this.save(s);
        this.store.put("receipt", key, { questionId: p.id });
      });
      if (Date.now() >= Date.parse(s.createdAt) + s.durationMinutes * 60000)
        this.finish(s);
      return this.view(s, notice);
    });
  }
  async followup(id: string, input: { answer: string; requestId: string }) {
    return this.lock(id, async () => {
      const s = this.get(id);
      const key = id + ":" + input.requestId;
      if (this.store.get("receipt", key)) return this.view(s);
      this.active(s);
      const p = this.problem(s);
      const assessment = s.assessments.find((a) => a.questionId === p.id);
      if (!assessment)
        throw new HttpError(
          409,
          "Submit the original answer before discussing a follow-up.",
        );
      if (!input.answer.trim())
        throw new HttpError(400, "Write your response to the follow-up.");
      s.messages.push(
        message("candidate", "Follow-up response: " + input.answer),
      );
      s.draft.answer = input.answer;
      if (s.mode === "strict") this.save(s);
      let feedback =
        "Your follow-up response is saved separately from the original answer. Guided mode does not grade this new scenario; check your assumptions and derivation. You can revise the original answer or move to the next question.";
      let notice: string | undefined;
      const settings =
        this.store.get<Settings>("session-settings", id) ??
        this.store.settings();
      if (settings.provider !== "guided")
        try {
          const reply = await providerReply(settings, {
            profile: this.store.profile(),
            question: publicQuestion(p),
            session: s,
            assessment,
            phase: "followup",
          });
          feedback = reply.feedback + "\n\n" + reply.followup;
        } catch (error) {
          notice = (error as Error).message;
        }
      assessment.evidence.push(
        "A follow-up response was recorded separately; it did not change the original numeric or test result.",
      );
      s.messages.push(message("interviewer", feedback));
      s.draft.answer = input.answer;
      this.store.transaction(() => {
        this.save(s);
        this.store.put("receipt", key, { questionId: p.id });
      });
      if (Date.now() >= Date.parse(s.createdAt) + s.durationMinutes * 60000)
        this.finish(s);
      return this.view(s, notice);
    });
  }
  hint(id: string) {
    const s = this.get(id);
    this.active(s);
    if (s.stage === "oa")
      throw new HttpError(409, "Hints are unavailable during an OA round.");
    const p = this.problem(s);
    if (s.hintsUsed >= p.hints.length)
      throw new HttpError(409, "No hints remain for this question.");
    s.messages.push(message("interviewer", "Hint: " + p.hints[s.hintsUsed]));
    s.hintsUsed++;
    this.save(s);
    return this.view(s);
  }
  next(id: string) {
    const s = this.get(id);
    this.active(s);
    if (!s.assessments.some((a) => a.questionId === this.problem(s).id))
      throw new HttpError(
        409,
        "Submit a response before moving to the next question.",
      );
    if (s.questionIndex >= s.questionIds.length - 1) {
      this.finish(s);
      return this.view(s);
    }
    const current = this.problem(s);
    const assessment = s.assessments.find((a) => a.questionId === current.id)!;
    const rank: Record<Difficulty, number> = {
      foundation: 0,
      intermediate: 1,
      advanced: 2,
    };
    const verifiedSuccess =
      assessment.run?.status === "passed" ||
      assessment.evidence.some((e) =>
        e.startsWith("The numeric answer matches"),
      );
    const target = Math.max(
      0,
      Math.min(
        2,
        rank[current.difficulty] +
          (assessment.verdict === "developing" || assessment.hintsUsed > 0
            ? -1
            : verifiedSuccess
              ? 1
              : 0),
      ),
    );
    const remaining = s.questionIds.slice(s.questionIndex + 1);
    const graded = remaining.filter(
      (id) => !id.startsWith("resume-") && !id.startsWith("project-"),
    );
    graded.sort(
      (a, b) =>
        Math.abs(rank[getProblem(a).difficulty] - target) -
        Math.abs(rank[getProblem(b).difficulty] - target),
    );
    s.questionIds = [
      ...s.questionIds.slice(0, s.questionIndex + 1),
      ...graded,
      ...remaining.filter(
        (id) => id.startsWith("resume-") || id.startsWith("project-"),
      ),
    ];
    s.questionIndex++;
    s.hintsUsed = 0;
    const p = this.problem(s);
    s.draft = {
      answer: "",
      code: p.starterCode?.[s.draft.language] ?? "",
      language: s.draft.language,
    };
    s.messages.push(message("interviewer", p.prompt));
    this.save(s);
    return this.view(s);
  }
  finish(s: Session) {
    if (s.mode === "strict") {
      const persisted = this.store.get<Session>("session", s.id);
      if (persisted && persisted.status !== "active") {
        Object.assign(s, persisted);
        return;
      }
    }
    if (s.status !== "active") return;
    s.status = "completed";
    s.finishedAt = new Date().toISOString();
    const observed = s.assessments.length;
    s.report = {
      summary: observed
        ? `You submitted answers to ${observed} question${observed === 1 ? "" : "s"}. Results and suggested practice are listed below.`
        : "The session ended before an answer was assessed. Your saved draft remains available in the export.",
      assessments: s.assessments,
      strengths: s.assessments
        .filter((a) => a.verdict === "demonstrated")
        .map(
          (a) =>
            `${a.title}: passed the supplied executable cases${a.hintsUsed ? " after assistance" : ""}.`,
        ),
      practice: [...new Set(s.assessments.map((a) => a.nextPractice))],
      limitations: [
        "Assessments apply to the observed exercises, not general ability or hiring suitability.",
        "Correct arithmetic and passing tests do not establish understanding, complexity, or authorship.",
        s.provider === "guided"
          ? "Guided practice does not assess open-ended reasoning."
          : "AI feedback may be incorrect. Check it against your answer, the test results, and the assessment criteria.",
        s.mode === "strict"
          ? "Strict mode enforces local device and session policy; it does not establish authorship or prove the absence of cheating."
          : "This was a practice session, not a verified proctored assessment.",
      ],
    };
    this.save(s);
  }
}
