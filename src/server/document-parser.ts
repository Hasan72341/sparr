import { basename, extname } from "node:path";
import type { Artifact } from "../shared/types.ts";
import { extractResumeInProcess } from "./resume-parser.ts";

type ParsedArtifact = Omit<Artifact, "id" | "createdAt">;

export async function parseArtifactInProcess(
  buffer: Buffer,
  filename: string,
): Promise<ParsedArtifact> {
  const name = basename(filename).slice(0, 160);
  const ext = extname(name).toLowerCase();
  const evidence: Artifact["evidence"] = [];
  let kind: Artifact["kind"] = "research";
  const notes = [
    "Extracted content is candidate-provided evidence; it does not establish authorship or correctness.",
  ];
  if (ext === ".ipynb") {
    kind = "notebook";
    const doc = JSON.parse(buffer.toString("utf8"));
    if (!Array.isArray(doc.cells))
      throw new Error("Notebook must contain a cells array.");
    for (const [index, cell] of doc.cells.slice(0, 30).entries()) {
      if (!["code", "markdown"].includes(cell?.cell_type)) continue;
      const source = Array.isArray(cell.source)
        ? cell.source.filter((v: unknown) => typeof v === "string").join("")
        : typeof cell.source === "string"
          ? cell.source
          : "";
      if (source.trim())
        evidence.push({
          path: `${name} / cell ${index + 1} (${cell.cell_type})`,
          excerpt: source.slice(0, 2000),
        });
    }
    notes.push(
      "Inspected source from up to 30 cells. Cells were not executed; stored outputs and images were excluded.",
    );
  } else if (ext === ".csv") {
    kind = "financial-model";
    const { parse } = await import("csv-parse/sync");
    const rows: string[][] = parse(buffer, {
      to: 100,
      max_record_size: 20000,
      relax_column_count: true,
      bom: true,
    });
    evidence.push({
      path: name,
      excerpt: rows
        .map(
          (row, index) =>
            `Row ${index + 1}: ${row
              .slice(0, 20)
              .map((v) => v.slice(0, 160))
              .join(" | ")}`,
        )
        .join("\n")
        .slice(0, 16000),
    });
    notes.push(
      "Inspected up to 100 rows and 20 columns. Formulas are plain text and are not recalculated.",
    );
  } else if (ext === ".xlsx") {
    kind = "financial-model";
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    for (const sheet of workbook.worksheets.slice(0, 5)) {
      const cells: string[] = [];
      sheet.eachRow((row) => {
        if (cells.length >= 500) return;
        row.eachCell((cell) => {
          if (cells.length >= 500) return;
          const value = cell.value;
          let display: string;
          if (value && typeof value === "object" && "formula" in value)
            display = `Formula: ${value.formula}; cached result: ${JSON.stringify(value.result) ?? "unavailable"}`;
          else if (
            value &&
            typeof value === "object" &&
            "sharedFormula" in value
          )
            display = `Shared formula: ${value.sharedFormula}; cached result: ${JSON.stringify(value.result) ?? "unavailable"}`;
          else display = cell.text;
          cells.push(`${cell.address}: ${display.slice(0, 240)}`);
        });
      });
      if (cells.length)
        evidence.push({
          path: `${name} / ${sheet.name}`,
          excerpt: cells.join("\n").slice(0, 10000),
        });
    }
    notes.push(
      "Inspected up to 5 sheets and 500 cells per sheet. Formulas are not recalculated; cached values may be stale. Macros and external links are not executed.",
    );
  } else {
    const profile = await extractResumeInProcess(buffer, name);
    for (
      let i = 0;
      i < profile.resumeText.length && evidence.length < 10;
      i += 3000
    )
      evidence.push({
        path: `${name} / text excerpt ${evidence.length + 1}`,
        excerpt: profile.resumeText.slice(i, i + 3000),
      });
    notes.push(
      "Extracted text only, up to 20 PDF pages and 30,000 characters. Figures, equations, layout, and source references may be incomplete.",
    );
  }
  if (!evidence.some((e) => e.excerpt.trim()))
    throw new Error("This file contains no supported readable content.");
  return {
    name: name.replace(/\.[^.]+$/, ""),
    filename: name,
    kind,
    evidence,
    notes,
    summary: `Inspected ${evidence.length} source excerpt${evidence.length === 1 ? "" : "s"} from ${name}. Select it when starting a project defense session.`,
  };
}
