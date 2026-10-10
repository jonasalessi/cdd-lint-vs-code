import { createWriteStream } from "node:fs";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export type DownloadResponse = Readable & {
  statusCode?: number;
  headers: { location?: string; "content-length"?: string };
};

export type DownloadClientRequest = {
  on: (event: "error", listener: (error: Error) => void) => unknown;
};

export type HttpsGetFunction = (
  url: string,
  options: { signal: AbortSignal },
  onResponse: (response: DownloadResponse) => void,
) => DownloadClientRequest;

export type DownloadProgress = { incrementPercent: number | undefined };

export type DownloadRequest = {
  url: string;
  destinationPath: string;
  signal: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
  timeLimitMs?: number;
};

type Hop = {
  url: string;
  signal: AbortSignal;
  httpsGet: HttpsGetFunction;
};

export const downloadTimeLimitMs = 60_000;
export const maxRedirects = 5;

const redirectStatuses = [301, 302, 303, 307, 308];
const allowedHost = "github.com";
const allowedHostSuffix = ".githubusercontent.com";

export async function downloadAsset(
  request: DownloadRequest,
  httpsGet: HttpsGetFunction,
): Promise<void> {
  const timeLimitMs = request.timeLimitMs ?? downloadTimeLimitMs;
  const timeLimit = AbortSignal.timeout(timeLimitMs);
  const signal = AbortSignal.any([request.signal, timeLimit]);
  try {
    const response = await openFinalResponse({ url: request.url, signal, httpsGet }, maxRedirects);
    await saveBody(response, { ...request, signal });
  } catch (error) {
    throw isTimeLimitError(timeLimit, request.signal) ? timeLimitError(timeLimitMs) : error;
  }
}

export function isAllowedDownloadUrl(url: string): boolean {
  if (!URL.canParse(url)) {
    return false;
  }
  const { protocol, hostname } = new URL(url);
  return protocol === "https:" && isAllowedHost(hostname);
}

function isAllowedHost(hostname: string): boolean {
  return hostname === allowedHost || hostname.endsWith(allowedHostSuffix);
}

async function openFinalResponse(hop: Hop, redirectsLeft: number): Promise<DownloadResponse> {
  const response = await openAllowedUrl(hop);
  const location = redirectLocationOf(response);
  if (location === undefined) {
    return successfulResponse(response);
  }
  response.resume();
  if (redirectsLeft === 0) {
    throw new Error(`The download has more than ${maxRedirects} redirects.`);
  }
  return openFinalResponse({ ...hop, url: redirectTargetOf(location, hop.url) }, redirectsLeft - 1);
}

function openAllowedUrl(hop: Hop): Promise<DownloadResponse> {
  if (!isAllowedDownloadUrl(hop.url)) {
    return Promise.reject(new Error(`The download URL ${hop.url} is not allowed.`));
  }
  return new Promise((resolve, reject) => {
    hop.httpsGet(hop.url, { signal: hop.signal }, resolve).on("error", reject);
  });
}

function redirectLocationOf(response: DownloadResponse): string | undefined {
  const isRedirect = redirectStatuses.includes(response.statusCode ?? 0);
  return isRedirect ? response.headers.location : undefined;
}

// An invalid location stays as it is, and the check of the next hop rejects it.
function redirectTargetOf(location: string, currentUrl: string): string {
  return URL.canParse(location, currentUrl) ? new URL(location, currentUrl).href : location;
}

function successfulResponse(response: DownloadResponse): DownloadResponse {
  if (response.statusCode === 200) {
    return response;
  }
  response.resume();
  throw new Error(`The download failed with HTTP status ${response.statusCode}.`);
}

async function saveBody(response: DownloadResponse, request: DownloadRequest): Promise<void> {
  reportProgress(response, request.onProgress);
  await pipeline(response, createWriteStream(request.destinationPath), { signal: request.signal });
}

function reportProgress(response: DownloadResponse, onProgress: DownloadRequest["onProgress"]) {
  const totalBytes = Number(response.headers["content-length"]);
  response.on("data", (chunk: Buffer) =>
    onProgress?.({ incrementPercent: percentOf(chunk.length, totalBytes) }),
  );
}

function percentOf(chunkBytes: number, totalBytes: number): number | undefined {
  return totalBytes > 0 ? (chunkBytes / totalBytes) * 100 : undefined;
}

function isTimeLimitError(timeLimit: AbortSignal, cancellation: AbortSignal): boolean {
  return timeLimit.aborted && !cancellation.aborted;
}

function timeLimitError(timeLimitMs: number): Error {
  return new Error(`The download did not complete in ${timeLimitMs / 1000} seconds.`);
}
