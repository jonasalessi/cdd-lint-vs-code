import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type { DownloadResponse, HttpsGetFunction } from "./downloadAsset";

// Test double of https.get. A URL with no route never answers, like a server that hangs.

export type FakeRoute = {
  status: number;
  location?: string;
  body?: Buffer;
};

export type HttpsGetFake = {
  httpsGet: HttpsGetFunction;
  requestedUrls: string[];
};

export function createHttpsGetFake(routes: Record<string, FakeRoute>): HttpsGetFake {
  const requestedUrls: string[] = [];
  const httpsGet: HttpsGetFunction = (url, options, onResponse) => {
    requestedUrls.push(url);
    const request = new EventEmitter();
    options.signal.addEventListener("abort", () => request.emit("error", abortError()));
    answer(routes[url], onResponse);
    return request;
  };
  return { httpsGet, requestedUrls };
}

function answer(
  route: FakeRoute | undefined,
  onResponse: (response: DownloadResponse) => void,
): void {
  if (route !== undefined) {
    setImmediate(() => onResponse(toResponse(route)));
  }
}

function toResponse(route: FakeRoute): DownloadResponse {
  const body = route.body ?? Buffer.alloc(0);
  const headers = { location: route.location, "content-length": String(body.length) };
  return Object.assign(Readable.from([body]), { statusCode: route.status, headers });
}

function abortError(): Error {
  return Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
}
