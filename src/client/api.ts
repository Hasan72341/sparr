import { sebProof } from "./seb-client";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (
    /^\/strict\/[^/]+$/.test(window.location.pathname) &&
    !path.startsWith("/strict/")
  ) {
    const proof = await sebProof();
    headers.set("X-Sparr-SEB-Page", proof.pageUrl);
    headers.set("X-Sparr-SEB-Config", proof.configHash);
  }
  if (options.method && options.method !== "GET")
    headers.set("X-Sparr-Client", "web");
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch(`/api${path}`, { ...options, headers });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      result?.error || `Request failed (${response.status}). Try again.`,
      response.status,
    );
  return result as T;
}

export function post<T>(path: string, body: unknown = {}) {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function put<T>(path: string, body: unknown) {
  return api<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

export async function download(path: string, name: string) {
  const result = await api<unknown>(path);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
