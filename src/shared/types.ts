export type TrackId =
  | "swe"
  | "quant-research"
  | "quant-trading"
  | "quant-dev"
  | "finance"
  | "markets"
  | "ml";
export type Difficulty = "foundation" | "intermediate" | "advanced";
export type Language = "python" | "javascript";
export interface Track {
  id: TrackId;
  name: string;
  shortName: string;
  description: string;
  topics: string[];
}
export interface Profile {
  name: string;
  email: string;
  headline: string;
  resumeText: string;
  skills: string[];
  goals: string;
}
export interface Settings {
  provider: "guided" | "ollama" | "openai-compatible" | "codex" | "claude";
  model: string;
  baseUrl: string;
}
export interface Capabilities {
  platform: string;
  runner: { available: boolean; name: string; reason?: string };
  strict: { available: boolean; reasons: string[] };
  providers: { id: string; available: boolean; reason?: string }[];
  native: {
    available: boolean;
    displays?: number;
    cameras?: number;
    notes: string[];
  };
}
export interface Repository {
  id: string;
  name: string;
  url: string;
  commit: string;
  createdAt: string;
  files: { path: string; bytes: number }[];
  languages: string[];
  summary: string;
  evidence: { path: string; excerpt: string }[];
  executionStatus: string;
}
export interface Question {
  id: string;
  track: TrackId;
  title: string;
  kind: "coding" | "numeric" | "discussion";
  difficulty: Difficulty;
  prompt: string;
  tags: string[];
  starterCode?: Record<Language, string>;
  examples?: { input: unknown; output: unknown }[];
  source?: { repositoryId: string; path: string };
}
export interface Message {
  id: string;
  role: "interviewer" | "candidate" | "system";
  content: string;
  createdAt: string;
}
export interface RunResult {
  status: "passed" | "failed" | "error" | "unavailable";
  passed: number;
  total: number;
  durationMs: number;
  output: string;
  cases: { name: string; passed: boolean; detail?: string }[];
}
export interface Assessment {
  questionId: string;
  title: string;
  verdict:
    "demonstrated" | "developing" | "needs-review" | "insufficient-evidence";
  evidence: string[];
  feedback: string;
  nextPractice: string;
  hintsUsed: number;
  run?: RunResult;
}
export interface Report {
  summary: string;
  assessments: Assessment[];
  strengths: string[];
  practice: string[];
  limitations: string[];
}
export interface Session {
  id: string;
  track: TrackId;
  difficulty: Difficulty;
  durationMinutes: number;
  mode: "practice" | "strict";
  status: "active" | "completed" | "terminated";
  createdAt: string;
  finishedAt?: string;
  questionIds: string[];
  questionIndex: number;
  messages: Message[];
  assessments: Assessment[];
  hintsUsed: number;
  draft: { answer: string; code: string; language: Language };
  repositoryId?: string;
  artifactId?: string;
  company?: string;
  jobDescription?: string;
  stage?: "technical" | "oa" | "project" | "behavioral";
  report?: Report;
  terminationReason?: string;
  integrity?: { policy: string; events: IntegrityEvent[] };
  provider: Settings["provider"];
}
export interface SessionView {
  session: Session;
  question: Question;
  remainingSeconds: number;
  providerNotice?: string;
}
export interface Bootstrap {
  profile: Profile;
  settings: Settings;
  tracks: Track[];
  sessions: Session[];
  repositories: Repository[];
  artifacts: Artifact[];
  capabilities: Capabilities;
}

export interface Artifact {
  id: string;
  name: string;
  kind: "research" | "notebook" | "financial-model";
  filename: string;
  createdAt: string;
  summary: string;
  evidence: { path: string; excerpt: string }[];
  notes: string[];
}

export type PracticeOptions = Pick<
  Session,
  | "track"
  | "difficulty"
  | "durationMinutes"
  | "repositoryId"
  | "artifactId"
  | "company"
  | "jobDescription"
> & { mode: "practice"; stage: NonNullable<Session["stage"]> };

export interface SebLaunch {
  id: string;
  options: PracticeOptions;
  expiresAt: string;
  configUrl: string;
  launchUrl: string;
  startUrl: string;
}

export interface GuardianSnapshot {
  version: 1;
  sequence: number;
  armedPid: number | null;
  displays: number | null;
  mirrored: boolean;
  cameras: number;
  physicalCamera: boolean;
  virtualMachine: boolean | null;
  prohibitedApplications: string[];
  cameraPermission: string;
  microphonePermission: string;
  captureRunning: boolean;
  videoAgeMs: number | null;
  audioAgeMs: number | null;
  faceCount: number | null;
  seb: {
    pid: number;
    startedAt: number;
    validSignature: boolean;
    frontmost: boolean;
    version: string;
  } | null;
}
export interface IntegrityEvent {
  at: string;
  code: string;
  detail: string;
}
export interface StrictLaunch {
  id: string;
  options: PracticeOptions;
  startUrl: string;
  quitUrl: string;
  configUrl: string;
  launchUrl: string;
  expiresAt: string;
}
export interface StrictStatus {
  phase: "preflight" | "active" | "ended";
  ready: boolean;
  reasons: string[];
  sessionId?: string;
  quitUrl: string;
  observation?: Pick<
    GuardianSnapshot,
    | "displays"
    | "cameras"
    | "faceCount"
    | "cameraPermission"
    | "microphonePermission"
  >;
}
