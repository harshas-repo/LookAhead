/**
 * YouCam / Perfect Corp HTTP client (server-side only).
 *
 * Implements the documented contract from api-feasibility.md:
 *  - Bearer auth
 *  - File upload: POST /s2s/v2.0/file  ->  signed S3 PUT
 *  - Async task create + polling
 *
 * Contains no secrets in logs and never returns the API key to callers.
 */

import { getConfig } from "../../config";
import type { NormalizedPhoto } from "../types";

export class YouCamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly errorCode?: string
  ) {
    super(message);
    this.name = "YouCamError";
  }
}

function authHeaders(): Record<string, string> {
  const { apiKey } = getConfig().youcam;
  if (!apiKey) {
    throw new YouCamError("YouCam API key is not configured", 500, "MissingApiKey");
  }
  return { Authorization: `Bearer ${apiKey}` };
}

interface FileRegisterResponse {
  status: number;
  data?: {
    files: Array<{
      file_id: string;
      requests: Array<{ method: string; url: string; headers: Record<string, string> }>;
    }>;
  };
}

/**
 * In-memory `file_id` reuse cache (api-feasibility.md §6: "reuse file_id for both
 * analysis and VTO").
 *
 * The same normalized photo is uploaded once for Hair Length Detection and again
 * for every Hairstyle VTO preview. Each upload costs a signed-PUT round trip and
 * registers a new provider file. Because our photo pipeline is deterministic and
 * the fileName is stable per stored photo (`${photoRef.id}.jpg`), we can reuse the
 * first `file_id` for all subsequent calls in the same session — fewer provider
 * calls and no redundant uploads.
 *
 * Keyed by fileName; entries expire well inside the provider's ttl30 window so we
 * never hand a task a stale id. Bounded to avoid unbounded growth across sessions.
 */
const FILE_ID_TTL_MS = 25 * 60 * 1000;
const FILE_ID_CACHE_MAX = 64;
const fileIdCache = new Map<string, { fileId: string; at: number }>();

/** Test/maintenance hook: drop all cached file ids. */
export function clearFileIdCache(): void {
  fileIdCache.clear();
}

function cachedFileId(fileName: string): string | null {
  const hit = fileIdCache.get(fileName);
  if (!hit) return null;
  if (Date.now() - hit.at > FILE_ID_TTL_MS) {
    fileIdCache.delete(fileName);
    return null;
  }
  return hit.fileId;
}

function rememberFileId(fileName: string, fileId: string): void {
  // Evict oldest entries first if we're at capacity (Map preserves insert order).
  if (fileIdCache.size >= FILE_ID_CACHE_MAX) {
    const oldest = fileIdCache.keys().next().value;
    if (oldest !== undefined) fileIdCache.delete(oldest);
  }
  fileIdCache.set(fileName, { fileId, at: Date.now() });
}

/** Upload a normalized photo; returns the provider file_id (reused when cached). */
export async function uploadFile(photo: NormalizedPhoto): Promise<string> {
  const reused = cachedFileId(photo.fileName);
  if (reused) return reused;

  const { baseUrl } = getConfig().youcam;

  // Step A — register the file (JSON metadata).
  // `cache: "no-store"` on every provider call: Next.js patches global fetch and
  // may otherwise cache GET responses — fatal for task polling, which must see
  // fresh status on every request.
  const registerRes = await fetch(`${baseUrl}/s2s/v2.0/file`, {
    method: "POST",
    cache: "no-store",
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: JSON.stringify({
      files: [
        {
          content_type: photo.contentType,
          file_name: photo.fileName,
          file_size: photo.bytes.byteLength
        }
      ]
    })
  });

  if (!registerRes.ok) {
    throw new YouCamError("File registration failed", registerRes.status, "FileRegisterFailed");
  }
  const register = (await registerRes.json()) as FileRegisterResponse;
  const file = register.data?.files?.[0];
  if (!file?.file_id || !file.requests?.[0]) {
    throw new YouCamError("Unexpected file registration response", 502, "MalformedResponse");
  }

  // Step B — upload bytes to the signed URL.
  const upload = file.requests[0];
  const putRes = await fetch(upload.url, {
    method: upload.method || "PUT",
    cache: "no-store",
    headers: {
      "Content-Type": photo.contentType,
      "Content-Length": String(photo.bytes.byteLength)
    },
    body: new Uint8Array(photo.bytes)
  });
  if (!putRes.ok) {
    throw new YouCamError("Signed upload failed", putRes.status, "UploadFailed");
  }

  rememberFileId(photo.fileName, file.file_id);
  return file.file_id;
}

interface TaskCreateResponse {
  status: number;
  data?: { task_id?: string };
  error?: string;
  error_code?: string;
}

/** Create an async task at `path` with `body`; returns the task_id. */
export async function createTask(path: string, body: Record<string, unknown>): Promise<string> {
  const { baseUrl } = getConfig().youcam;
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = (await res.json().catch(() => ({}))) as TaskCreateResponse;
  if (!res.ok || !json.data?.task_id) {
    throw new YouCamError(json.error || "Task creation failed", res.status, json.error_code || "TaskCreateFailed");
  }
  return json.data.task_id;
}

export interface TaskResult {
  taskStatus: "running" | "success" | "error";
  resultUrl: string | null;
  resultString: string | null;
  errorCode: string | null;
  /**
   * The raw `data.results` object, so family-specific adapters can read their own
   * fields (hair_density.term, hair_type.{mapping,term}) without this client
   * having to know every capability's shape. `resultString`/`resultUrl` remain the
   * normalized convenience fields for length + VTO.
   */
  results?: Record<string, unknown>;
  raw: unknown;
}

/** Poll a task once and normalize its status/results. */
export async function getTask(path: string, taskId: string): Promise<TaskResult> {
  const { baseUrl } = getConfig().youcam;
  const res = await fetch(`${baseUrl}${path}/${encodeURIComponent(taskId)}`, {
    method: "GET",
    cache: "no-store",
    headers: { ...authHeaders(), "content-type": "application/json" }
  });
  const json = (await res.json().catch(() => ({}))) as {
    status?: number;
    data?: {
      task_status?: string;
      error?: string | null;
      results?: unknown;
    };
    error_code?: string;
  };

  if (!res.ok) {
    throw new YouCamError("Task poll failed", res.status, json.error_code || "PollFailed");
  }

  const status = (json.data?.task_status || "running") as TaskResult["taskStatus"];
  const results = json.data?.results as Record<string, unknown> | undefined;

  // Different capabilities return results differently:
  //  - VTO returns { url }
  //  - Hair length returns { hair_length: { term } } (an OBJECT, per the live API);
  //    older/other shapes may use a bare string or { result }.
  let resultUrl: string | null = null;
  let resultString: string | null = null;
  if (results) {
    if (typeof results.url === "string") resultUrl = results.url;
    const readTerm = (v: unknown): string | null => {
      if (typeof v === "string") return v;
      if (v && typeof v === "object" && typeof (v as Record<string, unknown>).term === "string") {
        return (v as Record<string, unknown>).term as string;
      }
      return null;
    };
    resultString = readTerm(results.hair_length) ?? readTerm(results.result) ?? readTerm(results.term);
  }

  return {
    taskStatus: status,
    resultUrl,
    resultString,
    errorCode: (json.data?.error as string | null) ?? (json.error_code ?? null),
    results,
    raw: json.data ?? null
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll a task until success/error or timeout, with fixed interval + bounded
 * attempts (tech-implementation.md §11: timeout and backoff).
 */
export async function pollTask(path: string, taskId: string): Promise<TaskResult> {
  const { intervalMs, timeoutMs } = getConfig().polling;
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await getTask(path, taskId);
    if (result.taskStatus === "success" || result.taskStatus === "error") {
      return result;
    }
    if (Date.now() > deadline) {
      throw new YouCamError("Task polling timed out", 504, "PollTimeout");
    }
    // Fixed, brisk interval: tasks typically finish in ~5-15s, so a short steady
    // cadence returns results as soon as they exist (no growing backoff).
    await sleep(intervalMs);
  }
}

/** Authenticated GET returning parsed JSON (used for template listing). */
export async function getJson(path: string): Promise<unknown> {
  const { baseUrl } = getConfig().youcam;
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    cache: "no-store",
    headers: { ...authHeaders(), "content-type": "application/json" }
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new YouCamError("Request failed", res.status, (json.error_code as string) || "RequestFailed");
  }
  return json;
}

/** Download result bytes from a provider URL (for re-hosting within TTL). */
export async function downloadBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new YouCamError("Result download failed", res.status, "DownloadFailed");
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
