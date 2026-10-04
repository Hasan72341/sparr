import type { TrackId } from "./types";

export interface PreparationTemplate {
  id: string;
  label: string;
  company: string;
  track: TrackId;
  jobDescription: string;
}

// Study suggestions authored for Sparr; not job postings or company questions.
export const preparationTemplates: PreparationTemplate[] = [
  {
    id: "trilogy-swe",
    label: "Trilogy · Software engineering",
    company: "Trilogy",
    track: "swe",
    jobDescription:
      "Study suggestion for a software engineering role: practice debugging unfamiliar code, designing focused regression tests, and explaining implementation tradeoffs. Discuss how you would use AI coding tools, verify their output, and take responsibility for correctness. Bring an example of a bug you diagnosed and the evidence that your fix worked.",
  },
  {
    id: "assurant-swe",
    label: "Assurant · Software engineering",
    company: "Assurant",
    track: "swe",
    jobDescription:
      "Study suggestion for a software engineering role: practice reliable APIs, data validation, and handling failures in customer-facing systems. Explain testing, monitoring, privacy, access control, and safe handling of sensitive data. Discuss retries, idempotency, and how to investigate an incident without exposing customer information.",
  },
  {
    id: "joveo-swe",
    label: "Joveo · Software engineering",
    company: "Joveo",
    track: "swe",
    jobDescription:
      "Study suggestion for a software engineering role in a recruitment platform: practice event ingestion, data pipelines, API design, and diagnosing stale or duplicated data. Explain product tradeoffs using recruitment funnel metrics, measurement quality, and user needs. Discuss how to test pipeline changes and protect candidate data.",
  },
  {
    id: "jpmorganchase-swe",
    label: "JPMorganChase · Software engineering",
    company: "JPMorganChase",
    track: "swe",
    jobDescription:
      "Study suggestion for a software engineering role: practice correctness and reliability in transaction processing. Explain consistency, idempotency, concurrency, reconciliation, and failure recovery. Discuss tests for duplicate requests and partial failures, and how monitoring and audit records help investigate an incorrect balance or delayed transaction.",
  },
  {
    id: "goldman-sachs-finance",
    label: "Goldman Sachs · Corporate finance / valuation",
    company: "Goldman Sachs",
    track: "finance",
    jobDescription:
      "Study suggestion for a finance or valuation role: practice linking financial statements, estimating cash flows, and explaining valuation assumptions. Discuss discount rates, terminal value, comparable companies, and sensitivity to revenue growth and margins. Explain the limits of your model and distinguish observed figures from forecasts and scenarios. Adapt this context to your actual target role.",
  },
];
