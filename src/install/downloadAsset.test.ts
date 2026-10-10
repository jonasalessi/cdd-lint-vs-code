import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { downloadAsset, isAllowedDownloadUrl, type DownloadProgress } from "./downloadAsset";
import { createHttpsGetFake, type FakeRoute } from "./httpsGetFake";

const assetUrl = "https://github.com/jonasalessi/cdd-lint/releases/download/v0.1.0/asset.tar.gz";
const cdnUrl = "https://release-assets.githubusercontent.com/asset?token=1";
const body = Buffer.from("archive bytes");

function redirectTo(location: string): FakeRoute {
  return { status: 302, location };
}

describe("isAllowedDownloadUrl", () => {
  it.each([
    assetUrl,
    cdnUrl,
    "https://objects.githubusercontent.com/a",
    "https://GitHub.com/a",
    "https://a.b.githubusercontent.com/a",
  ])("accepts %s", (url) => {
    expect(isAllowedDownloadUrl(url)).toBe(true);
  });

  it.each([
    "http://github.com/a",
    "http://release-assets.githubusercontent.com/a",
    "https://evilgithubusercontent.com/a",
    "https://github.com.evil.example/a",
    "https://githubusercontent.com/a",
    "https://evil.example/github.com",
    "https://github.com@evil.example/a",
    "https://evil.example/?h=.githubusercontent.com",
    "https://evil.example/#.githubusercontent.com",
    "https://api.github.com/a",
    "https://notgithub.com/a",
    "https://release-assets.githubusercontent.com.evil.example/a",
    "ftp://github.com/a",
    "file:///github.com/a",
    "not a url",
    "",
  ])("rejects %s", (url) => {
    expect(isAllowedDownloadUrl(url)).toBe(false);
  });
});

describe("downloadAsset", () => {
  let directory: string;
  let destinationPath: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "cdd-download-"));
    destinationPath = join(directory, "archive");
  });

  afterEach(() => rm(directory, { recursive: true, force: true }));

  function download(routes: Record<string, FakeRoute>, url = assetUrl) {
    const fake = createHttpsGetFake(routes);
    const signal = new AbortController().signal;
    const result = downloadAsset({ url, destinationPath, signal }, fake.httpsGet);
    return { result, requestedUrls: fake.requestedUrls };
  }

  it("follows the redirect of the release and saves the body", async () => {
    const { result, requestedUrls } = download({
      [assetUrl]: redirectTo(cdnUrl),
      [cdnUrl]: { status: 200, body },
    });

    await result;

    expect(requestedUrls).toEqual([assetUrl, cdnUrl]);
    expect(await readFile(destinationPath)).toEqual(body);
  });

  it("resolves a relative redirect against the current URL", async () => {
    const { result, requestedUrls } = download({
      [assetUrl]: redirectTo("/other/asset"),
      "https://github.com/other/asset": { status: 200, body },
    });

    await result;

    expect(requestedUrls).toEqual([assetUrl, "https://github.com/other/asset"]);
  });

  it.each([
    "https://evilgithubusercontent.com/asset",
    "https://github.com.evil.example/asset",
    "https://evil.example/asset",
  ])("rejects a redirect to the host of %s and does not request it", async (location) => {
    const { result, requestedUrls } = download({
      [assetUrl]: redirectTo(location),
      [location]: { status: 200, body },
    });

    await expect(result).rejects.toThrow(`The download URL ${location} is not allowed.`);
    expect(requestedUrls).toEqual([assetUrl]);
  });

  it("rejects a redirect to http and does not request it", async () => {
    const location = "http://release-assets.githubusercontent.com/asset";
    const { result, requestedUrls } = download({
      [assetUrl]: redirectTo(location),
      [location]: { status: 200, body },
    });

    await expect(result).rejects.toThrow(`The download URL ${location} is not allowed.`);
    expect(requestedUrls).toEqual([assetUrl]);
  });

  it("rejects a redirect to a host that is not allowed after an allowed redirect", async () => {
    const { result, requestedUrls } = download({
      [assetUrl]: redirectTo(cdnUrl),
      [cdnUrl]: redirectTo("https://evil.example/asset"),
    });

    await expect(result).rejects.toThrow("is not allowed");
    expect(requestedUrls).toEqual([assetUrl, cdnUrl]);
  });

  it("checks the first URL and does not request it when it is not allowed", async () => {
    const firstUrl = "https://evil.example/asset.tar.gz";
    const { result, requestedUrls } = download({ [firstUrl]: { status: 200, body } }, firstUrl);

    await expect(result).rejects.toThrow("is not allowed");
    expect(requestedUrls).toEqual([]);
  });

  function redirectChain(length: number): Record<string, FakeRoute> {
    const hopUrl = (index: number) => `https://github.com/hop/${index}`;
    const routes: Record<string, FakeRoute> = { [assetUrl]: redirectTo(hopUrl(1)) };
    for (let index = 1; index < length; index += 1) {
      routes[hopUrl(index)] = redirectTo(hopUrl(index + 1));
    }
    routes[hopUrl(length)] = { status: 200, body };
    return routes;
  }

  it("follows 5 redirects", async () => {
    const { result, requestedUrls } = download(redirectChain(5));

    await result;

    expect(requestedUrls).toHaveLength(6);
    expect(await readFile(destinationPath)).toEqual(body);
  });

  it("stops at the sixth redirect", async () => {
    const { result, requestedUrls } = download(redirectChain(6));

    await expect(result).rejects.toThrow("The download has more than 5 redirects.");
    expect(requestedUrls).toHaveLength(6);
  });

  it("rejects a status that is not 200", async () => {
    const { result } = download({ [assetUrl]: { status: 404 } });

    await expect(result).rejects.toThrow("The download failed with HTTP status 404.");
  });

  it("rejects when the time limit ends", async () => {
    const fake = createHttpsGetFake({});
    const signal = new AbortController().signal;

    const result = downloadAsset(
      { url: assetUrl, destinationPath, signal, timeLimitMs: 20 },
      fake.httpsGet,
    );

    await expect(result).rejects.toThrow("The download did not complete in 0.02 seconds.");
  });

  it("rejects when the caller cancels", async () => {
    const fake = createHttpsGetFake({});
    const controller = new AbortController();

    const result = downloadAsset(
      { url: assetUrl, destinationPath, signal: controller.signal },
      fake.httpsGet,
    );
    controller.abort();

    await expect(result).rejects.toThrow("aborted");
  });

  it("reports the progress as a percentage of the content length", async () => {
    const reports: DownloadProgress[] = [];
    const fake = createHttpsGetFake({ [assetUrl]: { status: 200, body } });
    const signal = new AbortController().signal;

    await downloadAsset(
      { url: assetUrl, destinationPath, signal, onProgress: (progress) => reports.push(progress) },
      fake.httpsGet,
    );

    expect(reports).toEqual([{ incrementPercent: 100 }]);
  });
});
