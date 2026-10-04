import { extractResumeInProcess } from "./resume-parser.ts";
import { parseArtifactInProcess } from "./document-parser.ts";
const chunks: Buffer[] = [];
let bytes = 0;
for await (const chunk of process.stdin) {
  bytes += chunk.length;
  if (bytes > 5 * 1024 * 1024) process.exit(2);
  chunks.push(chunk);
}
try {
  const result = await (
    process.argv[3] === "artifact"
      ? parseArtifactInProcess
      : extractResumeInProcess
  )(Buffer.concat(chunks), process.argv[2]);
  console.log("SPARR_PARSE_RESULT:" + JSON.stringify({ result }));
} catch (error) {
  console.log(
    "SPARR_PARSE_RESULT:" +
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Could not parse document.",
      }),
  );
}
