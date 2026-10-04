import { HttpError } from "./interviews.js";
export class Gate {
  private count = 0;
  constructor(
    private maximum: number,
    private label: string,
  ) {}
  get busy() {
    return this.count > 0;
  }
  async run<T>(action: () => Promise<T>) {
    if (this.count >= this.maximum)
      throw new HttpError(429, `${this.label} is busy. Try again shortly.`);
    this.count++;
    try {
      return await action();
    } finally {
      this.count--;
    }
  }
}
export const executionGate = new Gate(2, "Code execution");
export const providerGate = new Gate(2, "AI assessment");
export const parserGate = new Gate(1, "Resume parser");
export async function boundedResponse(
  response: Response,
  maximum = 200000,
): Promise<string> {
  if (Number(response.headers.get("content-length")) > maximum) {
    await response.body?.cancel();
    throw new Error("Provider response exceeded the size limit.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Provider returned an empty response.");
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > maximum) {
        await reader.cancel();
        throw new Error("Provider response exceeded the size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
