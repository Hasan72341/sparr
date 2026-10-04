import { extname } from "node:path";
import type { Profile } from "../shared/types.ts";
const emptyProfile: Profile = {
  name: "",
  email: "",
  headline: "",
  resumeText: "",
  skills: [],
  goals: "",
};
export function parseResumeText(text: string): Profile {
  const clean = text.replace(/\r/g, "").trim();
  if (clean.length < 10)
    throw new Error(
      "The resume has too little readable text. Upload a text-based PDF, DOCX, or TXT file.",
    );
  const lines = clean
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const name =
    lines.find(
      (l) =>
        l.length < 90 &&
        !l.includes("@") &&
        !l.includes("http") &&
        !/resume|curriculum vitae/i.test(l),
    ) ?? "";
  const vocabulary = [
    "Python",
    "JavaScript",
    "TypeScript",
    "React",
    "Node.js",
    "SQL",
    "C++",
    "Java",
    "Rust",
    "Go",
    "Docker",
    "Kubernetes",
    "PyTorch",
    "TensorFlow",
    "Statistics",
    "Probability",
    "Machine learning",
    "Valuation",
    "Accounting",
    "Excel",
    "Finance",
    "Trading",
    "Linear algebra",
  ];
  return {
    ...emptyProfile,
    name: name.slice(0, 120),
    email: clean.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "",
    resumeText: clean.slice(0, 60000),
    skills: vocabulary.filter((skill) =>
      new RegExp(
        "(?:^|[^a-z])" +
          skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
          "(?:[^a-z]|$)",
        "i",
      ).test(clean),
    ),
    headline: "",
  };
}
export async function extractResumeInProcess(
  buffer: Buffer,
  filename: string,
): Promise<Profile> {
  const ext = extname(filename).toLowerCase();
  let text = "";
  if (ext === ".pdf") {
    if (buffer.subarray(0, 5).toString() !== "%PDF-")
      throw new Error("This file is not a valid PDF.");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: false,
    });
    try {
      const doc = await task.promise;
      if (doc.numPages > 20)
        throw new Error("Use a resume with at most 20 pages.");
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const c = await page.getTextContent();
        text +=
          c.items
            .map((item) =>
              "str" in item
                ? item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ")
                : "",
            )
            .join("") + "\n";
      }
    } finally {
      await task.destroy();
    }
  } else if (ext === ".docx") {
    const mammoth = await import("mammoth");
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if ([".txt", ".md"].includes(ext)) {
    if (buffer.includes(0))
      throw new Error("The resume must contain readable text.");
    text = buffer.toString("utf8");
  } else throw new Error("Upload a PDF, DOCX, TXT, or Markdown resume.");
  return parseResumeText(text);
}
