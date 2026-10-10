import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisResult } from "./analyzeDocument";
import { recordOfState, type DocumentRecord } from "./documentRecord";
import { RequestQueue, requestDelayMs, type DocumentState } from "./requestQueue";

type PipelineStart = {
  uri: string;
  signal: AbortSignal;
  finish: (result: AnalysisResult) => void;
};

const orderUri = "file:///project/order.ts";
const invoiceUri = "file:///project/invoice.ts";
const cleanDocument: DocumentState = { isOpen: true, isSupported: true, isClean: true, version: 7 };
const measured = recordOfState("measured");
const noConfig = recordOfState("no-config");

function recordResult(record: DocumentRecord): AnalysisResult {
  return { kind: "record", record };
}

describe("RequestQueue", () => {
  let documentStates: Map<string, DocumentState>;
  let pipelineStarts: PipelineStart[];
  let appliedRecords: [string, DocumentRecord][];
  let queue: RequestQueue;

  function runPipeline(uri: string, signal: AbortSignal): Promise<AnalysisResult> {
    return new Promise((finish) => pipelineStarts.push({ uri, signal, finish }));
  }

  function changeDocument(uri: string, change: Partial<DocumentState>): void {
    documentStates.set(uri, { ...cleanDocument, ...documentStates.get(uri), ...change });
  }

  async function endDelay(): Promise<void> {
    await vi.advanceTimersByTimeAsync(requestDelayMs);
  }

  async function startPipeline(uri = orderUri): Promise<PipelineStart> {
    queue.request(uri);
    await endDelay();
    return pipelineStarts.at(-1) as PipelineStart;
  }

  async function finish(pipeline: PipelineStart, result: AnalysisResult): Promise<void> {
    pipeline.finish(result);
    await vi.advanceTimersByTimeAsync(0);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    documentStates = new Map([
      [orderUri, cleanDocument],
      [invoiceUri, cleanDocument],
    ]);
    pipelineStarts = [];
    appliedRecords = [];
    queue = new RequestQueue({
      setTimer: setTimeout,
      clearTimer: clearTimeout,
      runPipeline,
      getDocumentState: (uri) => documentStates.get(uri) ?? { ...cleanDocument, isOpen: false },
      applyRecord: (uri, record) => appliedRecords.push([uri, record]),
    });
  });

  afterEach(() => vi.useRealTimers());

  describe("requests", () => {
    it("starts the pipeline 50 ms after the request", async () => {
      expect(queue.request(orderUri)).toBe("scheduled");

      await vi.advanceTimersByTimeAsync(requestDelayMs - 1);
      expect(pipelineStarts).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(pipelineStarts.map((start) => start.uri)).toEqual([orderUri]);
    });

    it("starts one pipeline for two requests in 50 ms", async () => {
      queue.request(orderUri);
      await vi.advanceTimersByTimeAsync(requestDelayMs - 10);
      queue.request(orderUri);

      await vi.advanceTimersByTimeAsync(requestDelayMs - 1);
      expect(pipelineStarts).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(requestDelayMs);
      expect(pipelineStarts).toHaveLength(1);
    });

    it("keeps the requests of two documents apart", async () => {
      queue.request(orderUri);
      queue.request(invoiceUri);
      await endDelay();

      expect(pipelineStarts.map((start) => start.uri)).toEqual([orderUri, invoiceUri]);
    });

    it("ignores a request for a document that is not supported", async () => {
      changeDocument(orderUri, { isSupported: false });

      expect(queue.request(orderUri)).toBe("unsupported");
      await endDelay();
      expect(pipelineStarts).toHaveLength(0);
    });

    it("ignores a request for a document that is not open", async () => {
      expect(queue.request("file:///project/closed.ts")).toBe("unsupported");
      await endDelay();
      expect(pipelineStarts).toHaveLength(0);
    });

    it("ignores a request for a dirty document and keeps the pending request", async () => {
      queue.request(orderUri);
      changeDocument(orderUri, { isClean: false });

      expect(queue.request(orderUri)).toBe("dirty");
      changeDocument(orderUri, { isClean: true });
      await endDelay();
      expect(pipelineStarts).toHaveLength(1);
    });
  });

  describe("the end of the 50 ms", () => {
    it("starts no pipeline for a document that is dirty", async () => {
      queue.request(orderUri);
      changeDocument(orderUri, { isClean: false });
      await endDelay();

      expect(pipelineStarts).toHaveLength(0);
      expect(queue.isActive(orderUri)).toBe(false);
    });

    it("drops the request, so a clean document later starts no pipeline", async () => {
      queue.request(orderUri);
      changeDocument(orderUri, { isClean: false });
      await endDelay();
      changeDocument(orderUri, { isClean: true });
      await endDelay();

      expect(pipelineStarts).toHaveLength(0);
    });

    it.each<Partial<DocumentState>>([{ isOpen: false }, { isSupported: false }])(
      "starts no pipeline for a document that changed to %j",
      async (change) => {
        queue.request(orderUri);
        changeDocument(orderUri, change);
        await endDelay();

        expect(pipelineStarts).toHaveLength(0);
      },
    );
  });

  describe("active pipelines", () => {
    it("aborts the active pipeline when a new pipeline starts", async () => {
      const first = await startPipeline();
      const second = await startPipeline();

      expect(first.signal.aborted).toBe(true);
      expect(second.signal.aborted).toBe(false);
      expect(queue.isActive(orderUri)).toBe(true);
    });

    it("does not abort the active pipeline before the 50 ms of a new request end", async () => {
      const first = await startPipeline();
      queue.request(orderUri);

      expect(first.signal.aborted).toBe(false);
    });

    it("applies the result of the new pipeline and not of the aborted one", async () => {
      const first = await startPipeline();
      const second = await startPipeline();

      await finish(first, recordResult(noConfig));
      await finish(second, recordResult(measured));

      expect(appliedRecords).toEqual([[orderUri, measured]]);
      expect(queue.isActive(orderUri)).toBe(false);
    });

    it("keeps the new pipeline active when the aborted pipeline ends", async () => {
      const first = await startPipeline();
      await startPipeline();

      await finish(first, { kind: "aborted" });

      expect(queue.isActive(orderUri)).toBe(true);
    });

    it("keeps the pipeline of another document", async () => {
      const order = await startPipeline(orderUri);
      await startPipeline(invoiceUri);

      expect(order.signal.aborted).toBe(false);
    });
  });

  describe("results", () => {
    it("applies the record when the document version is equal", async () => {
      const pipeline = await startPipeline();

      await finish(pipeline, recordResult(measured));

      expect(appliedRecords).toEqual([[orderUri, measured]]);
    });

    it("discards a result when the document version changed", async () => {
      const pipeline = await startPipeline();
      changeDocument(orderUri, { version: 8 });

      await finish(pipeline, recordResult(measured));

      expect(appliedRecords).toEqual([]);
      expect(queue.isActive(orderUri)).toBe(false);
    });

    it("discards a result when the document is not open", async () => {
      const pipeline = await startPipeline();
      changeDocument(orderUri, { isOpen: false });

      await finish(pipeline, recordResult(measured));

      expect(appliedRecords).toEqual([]);
    });

    it("applies no record for an aborted result", async () => {
      const pipeline = await startPipeline();

      await finish(pipeline, { kind: "aborted" });

      expect(appliedRecords).toEqual([]);
      expect(queue.isActive(orderUri)).toBe(false);
    });
  });

  describe("cancel", () => {
    it("cancels the pending request of a closed document", async () => {
      queue.request(orderUri);

      queue.cancel(orderUri);
      await endDelay();

      expect(pipelineStarts).toHaveLength(0);
    });

    it("aborts the active pipeline of a closed document and applies no record", async () => {
      const pipeline = await startPipeline();

      queue.cancel(orderUri);
      await finish(pipeline, recordResult(measured));

      expect(pipeline.signal.aborted).toBe(true);
      expect(appliedRecords).toEqual([]);
      expect(queue.isActive(orderUri)).toBe(false);
    });

    it("cancels the pending request and the active pipeline together", async () => {
      const pipeline = await startPipeline();
      queue.request(orderUri);

      queue.cancel(orderUri);
      await endDelay();

      expect(pipeline.signal.aborted).toBe(true);
      expect(pipelineStarts).toHaveLength(1);
    });

    it("cancels all pending requests and aborts all active pipelines", async () => {
      const order = await startPipeline(orderUri);
      queue.request(invoiceUri);

      queue.cancelAll();
      await endDelay();

      expect(order.signal.aborted).toBe(true);
      expect(pipelineStarts).toHaveLength(1);
    });

    it("accepts a request after a cancel", async () => {
      queue.request(orderUri);
      queue.cancelAll();

      const pipeline = await startPipeline();
      await finish(pipeline, recordResult(measured));

      expect(appliedRecords).toEqual([[orderUri, measured]]);
    });
  });

  describe("activity events", () => {
    let activity: [string, boolean][];

    beforeEach(() => {
      activity = [];
      queue.onDidChangeActivity((uri) => activity.push([uri, queue.isActive(uri)]));
    });

    it("emits when a pipeline starts and when it ends", async () => {
      const pipeline = await startPipeline();
      await finish(pipeline, recordResult(measured));

      expect(activity).toEqual([
        [orderUri, true],
        [orderUri, false],
      ]);
    });

    it("applies the record before it emits the end", async () => {
      const appliedAtEvent: number[] = [];
      queue.onDidChangeActivity(() => appliedAtEvent.push(appliedRecords.length));

      const pipeline = await startPipeline();
      await finish(pipeline, recordResult(measured));

      expect(appliedAtEvent).toEqual([0, 1]);
    });

    it("emits when a pipeline is aborted", async () => {
      await startPipeline();
      queue.cancel(orderUri);

      expect(activity).toEqual([
        [orderUri, true],
        [orderUri, false],
      ]);
    });

    it("emits no event for a request that was dropped", async () => {
      queue.request(orderUri);
      changeDocument(orderUri, { isClean: false });
      await endDelay();

      expect(activity).toEqual([]);
    });
  });
});
